import { useEffect, useRef } from 'react';
import type { Command } from '#input/commands/index.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import { setWorkspacePaneOptionsCommand } from '#engine/workspace-commands.ts';
import type { PaneOptionsCommit } from '#hosts/workspace/index.ts';
import type { OptionsWriteLogs } from '#hosts/shared/options-write-log.ts';
import {
  createDebouncedPersistenceScheduler,
  type DebouncedPersistenceScheduler,
} from '#platform/persistence/debounced-scheduler.ts';

/**
 * Workspaceのペインの解析設定を、ペインごとに間引いてから`dispatch`する。
 *
 * 個別画面の`useDebouncedCommit`（`app/standalone/`）は値を1つの待ち行列で間引く。ペインが
 * 複数あるWorkspaceで1つの待ち行列を共有すると、別のペインを続けて操作した時に、先のペインの
 * 待ち中の値が後の値に置き換わって消える。そのため書き先の持ち主（`paneOptionsOwnerKey`）ごとに待ち行列を持つ。
 * 共有に従うペインは同じ組を書くので同じ待ち行列に入り、後の値（下書きどうしが伝え合うので先の変更を含む）が先の値を置き換える。
 * `hosts`は`platform`をimportできない（依存規則）ので、間引きの組み立てはここ（`app`）で行う。
 *
 * 離脱（アンマウント・ページを離れる・タブを隠す）でも待っている値を書く（`useDebouncedCommit`と同じ理由）。
 * 書き込み先のWorkspaceは書く時点の`workspaceId`で決める。呼び出し側は`workspaceId`をkeyにして
 * このhookを含むcomponentを作り直すので、離脱の書き込みは元のWorkspaceへ向かう。
 */
export function usePaneOptionsCommit(
  dispatch: (command: Command<KeydistAssets>) => void,
  workspaceId: string,
  writeLogs: OptionsWriteLogs,
): PaneOptionsCommit {
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const workspaceIdRef = useRef(workspaceId);
  workspaceIdRef.current = workspaceId;

  const schedulersRef = useRef(new Map<string, DebouncedPersistenceScheduler<{ readonly paneId: string; readonly options: unknown }>>());
  const commitRef = useRef<PaneOptionsCommit | undefined>(undefined);
  if (commitRef.current === undefined) {
    const schedulerFor = (ownerKey: string) => {
      let scheduler = schedulersRef.current.get(ownerKey);
      if (scheduler === undefined) {
        scheduler = createDebouncedPersistenceScheduler<{ readonly paneId: string; readonly options: unknown }>({
          // 重複排除はしない。同じ値かどうかは、適用時点の資産と比べるコマンド側のno-op判定に任せる
          write: ({ paneId, options }) => {
            // 書いた値を記録し、ペインの下書きが自分の保存の反響を見分けるのに使う
            // 記録は、この直後の資産の更新（dispatch）と同じ同期の処理で続ける。間に非同期を挟むと、
            // 下書きが資産の更新より先に古い保存先で描画され、入力が巻き戻る。
            writeLogs.forKey(ownerKey).record(options);
            dispatchRef.current(setWorkspacePaneOptionsCommand(workspaceIdRef.current, paneId, options));
          },
        });
        schedulersRef.current.set(ownerKey, scheduler);
      }
      return scheduler;
    };
    commitRef.current = Object.assign(
      (ownerKey: string, paneId: string, options: unknown) => schedulerFor(ownerKey).notify({ paneId, options }),
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
