import { useEffect, useRef } from 'react';
import type { Command } from '#input/commands/index.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import { setWorkspacePaneOptionsCommand } from '#engine/workspace-commands.ts';
import type { PaneOptionsCommit } from '#hosts/workspace/index.ts';
import {
  createDebouncedPersistenceScheduler,
  type DebouncedPersistenceScheduler,
} from '#platform/persistence/debounced-scheduler.ts';

/**
 * Workspaceのペインの解析設定を、ペインごとに間引いてから`dispatch`する。
 *
 * 個別画面の`useDebouncedCommit`（`app/standalone/`）は値を1つの待ち行列で間引く。ペインが
 * 複数あるWorkspaceで1つの待ち行列を共有すると、別のペインを続けて操作した時に、先のペインの
 * 待ち中の値が後の値に置き換わって消える。そのためペインidごとに待ち行列を持つ。
 * `hosts`は`platform`をimportできない（依存規則）ので、間引きの組み立てはここ（`app`）で行う。
 *
 * 離脱（アンマウント・ページを離れる・タブを隠す）でも待っている値を書く（`useDebouncedCommit`と同じ理由）。
 * 書き込み先のWorkspaceは書く時点の`workspaceId`で決める。呼び出し側は`workspaceId`をkeyにして
 * このhookを含むcomponentを作り直すので、離脱の書き込みは元のWorkspaceへ向かう。
 */
export function usePaneOptionsCommit(
  dispatch: (command: Command<KeydistAssets>) => void,
  workspaceId: string,
): PaneOptionsCommit {
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const workspaceIdRef = useRef(workspaceId);
  workspaceIdRef.current = workspaceId;

  const schedulersRef = useRef(new Map<string, DebouncedPersistenceScheduler<unknown>>());
  const commitRef = useRef<PaneOptionsCommit | undefined>(undefined);
  if (commitRef.current === undefined) {
    const schedulerFor = (paneId: string) => {
      let scheduler = schedulersRef.current.get(paneId);
      if (scheduler === undefined) {
        scheduler = createDebouncedPersistenceScheduler<unknown>({
          // 重複排除はしない。同じ値かどうかは、適用時点の資産と比べるコマンド側のno-op判定に任せる
          write: (options) => dispatchRef.current(setWorkspacePaneOptionsCommand(workspaceIdRef.current, paneId, options)),
        });
        schedulersRef.current.set(paneId, scheduler);
      }
      return scheduler;
    };
    commitRef.current = Object.assign(
      (paneId: string, options: unknown) => schedulerFor(paneId).notify(options),
      { flush: () => { for (const scheduler of schedulersRef.current.values()) scheduler.flush(); } },
    );
  }
  const commit = commitRef.current;

  useEffect(() => {
    const flush = () => commit.flush();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      flush();
    };
  }, [commit]);

  return commit;
}
