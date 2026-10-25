import { useEffect, useRef, useState } from 'react';
import type { WorkspaceLibrary } from '#engine/workspace.ts';
import type { AssetTabSync } from '#platform/asset-tab-sync.ts';
import { createWorkspaceLibrarySync, loadWorkspaceLibrary } from '../standalone/workspace-library-sync.ts';

/**
 * 保存したWorkspaceの手持ち（読む前は`undefined`）。どの画面の資産の手持ちにも属さないシェルの知らせが、
 * 追加先がまだあるかを見るために使う。同じタブの書き込み（Undo・Redoを含む）と他タブの書き込みの通知で読み直す。
 * `refreshKey`が変わった時も読み直す（書き込み直後に、通知より先に描き直される場合に備える）。
 */
export function useWorkspaceLibrary(refreshKey: unknown): WorkspaceLibrary | undefined {
  const [library, setLibrary] = useState<WorkspaceLibrary | undefined>(undefined);
  const syncRef = useRef<AssetTabSync<WorkspaceLibrary> | undefined>(undefined);

  useEffect(() => {
    const sync = createWorkspaceLibrarySync({
      onExternalChange: (value) => setLibrary(value),
    });
    syncRef.current = sync;
    setLibrary(loadWorkspaceLibrary(sync));
    return sync.start();
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKeyは読み直す時を決める合図。本体では読まない。依存から外すと、書き込み直後の読み直しが起きない
  useEffect(() => {
    // 読めなかった値は開く時に知らせ済み。書き込みのたびに読み直すここでは知らせない
    const report = syncRef.current?.loadReport();
    if (report?.kind === 'loaded') setLibrary(report.value);
  }, [refreshKey]);

  return library;
}
