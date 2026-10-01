import { Link } from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';
import {
  getAddedToWorkspaceSnapshot,
  setAddedToWorkspace,
  subscribeAddedToWorkspace,
} from './added-to-workspace-notice.ts';
import { useWorkspaceLibrary } from './use-workspace-library.ts';

/**
 * 個別画面から「Workspaceに追加」した直後の知らせ。追加先へは移らず、追加した事実とWorkspaceへのリンクを出す
 * （見ていた個別画面の続きを邪魔しないため）。追加のUndo・Redoに合わせて出し入れする。
 */
export function AddedToWorkspaceNotice() {
  const added = useSyncExternalStore(subscribeAddedToWorkspace, getAddedToWorkspaceSnapshot, () => undefined);
  const library = useWorkspaceLibrary(added?.serial);
  if (added === undefined) return null;
  // 追加したペインが追加先に残っている間だけ出す。追加をUndoで戻したら引っ込み、Redoで戻したら出る
  // （「開く」が、無いWorkspaceを開かないように）。名前は今の名前を出す。
  const workspace = library?.find((candidate) => candidate.id === added.workspaceId);
  if (workspace === undefined || !workspace.panes.some((pane) => pane.id === added.paneId)) return null;

  return (
    <div className="shell-notice" role="status" data-added-to-workspace-notice="true" key={added.serial}>
      <span className="shell-notice-text">「{workspace.name}」に追加した</span>
      <Link
        className="shell-notice-link"
        to="/workspace/$id"
        params={{ id: added.workspaceId }}
        onClick={() => setAddedToWorkspace(undefined)}
      >
        開く
      </Link>
      <button type="button" aria-label="閉じる" title="閉じる" onClick={() => setAddedToWorkspace(undefined)}>×</button>
    </div>
  );
}
