import { Link } from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';
import {
  getAddedToWorkspaceSnapshot,
  setAddedToWorkspace,
  subscribeAddedToWorkspace,
} from './added-to-workspace-notice.ts';

/**
 * 個別画面から「Workspaceに追加」した直後の知らせ。追加先へは移らず、追加した事実とWorkspaceへのリンクを出す
 * （見ていた個別画面の続きを邪魔しないため）。
 */
export function AddedToWorkspaceNotice() {
  const added = useSyncExternalStore(subscribeAddedToWorkspace, getAddedToWorkspaceSnapshot, () => undefined);
  if (added === undefined) return null;

  return (
    <div className="shell-notice" role="status" data-added-to-workspace-notice="true" key={added.serial}>
      <span className="shell-notice-text">「{added.workspaceName}」に追加した</span>
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
