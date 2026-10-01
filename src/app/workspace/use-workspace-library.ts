import { useEffect, useRef, useState } from 'react';
import { WORKSPACE_LIBRARY_CODEC } from '#engine/workspace-codec.ts';
import type { WorkspaceLibrary } from '#engine/workspace.ts';
import { createAssetTabSync, type AssetTabSync } from '#platform/asset-tab-sync.ts';
import { WORKSPACES_STORAGE_KEY } from '#platform/assets/workspaces-storage.ts';

/**
 * 保存したWorkspaceの手持ち（読む前は`undefined`）。どの画面の資産の手持ちにも属さないシェルの知らせが、
 * 追加先がまだあるかを見るために使う。同じタブの書き込み（Undo・Redoを含む）と他タブの書き込みの通知で読み直す。
 * `refreshKey`が変わった時も読み直す（書き込み直後に、通知より先に描き直される場合に備える）。
 */
export function useWorkspaceLibrary(refreshKey: unknown): WorkspaceLibrary | undefined {
  const [library, setLibrary] = useState<WorkspaceLibrary | undefined>(undefined);
  const syncRef = useRef<AssetTabSync<WorkspaceLibrary> | undefined>(undefined);

  useEffect(() => {
    const sync = createAssetTabSync({
      storageKey: WORKSPACES_STORAGE_KEY,
      codec: WORKSPACE_LIBRARY_CODEC,
      onExternalChange: (value) => setLibrary(value),
    });
    syncRef.current = sync;
    setLibrary(sync.load() ?? []);
    return sync.start();
  }, []);

  useEffect(() => {
    const loaded = syncRef.current?.load();
    if (loaded !== undefined) setLibrary(loaded);
  }, [refreshKey]);

  return library;
}
