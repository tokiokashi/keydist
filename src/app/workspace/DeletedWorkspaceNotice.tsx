import { useNavigate } from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';
import { restoreWorkspaceInStorage } from './create-workspace.ts';
import {
  getDeletedWorkspaceSnapshot,
  setDeletedWorkspace,
  subscribeDeletedWorkspace,
} from './deleted-workspace-notice.ts';

/**
 * Workspaceを削除した直後に出す知らせ。削除は確認を挟まず、ここの「元に戻す」で戻せる
 * （プリセット・テキストの削除と同じ作法）。戻すと元の位置に戻り、そのWorkspaceを開く。
 */
export function DeletedWorkspaceNotice() {
  const deleted = useSyncExternalStore(subscribeDeletedWorkspace, getDeletedWorkspaceSnapshot, () => undefined);
  const navigate = useNavigate();
  if (deleted === undefined) return null;

  const restore = () => {
    const restored = restoreWorkspaceInStorage(deleted.workspace, deleted.index);
    setDeletedWorkspace(undefined);
    if (restored) void navigate({ to: '/workspace/$id', params: { id: deleted.workspace.id } });
  };

  return (
    <div className="shell-notice" role="status" data-deleted-workspace-notice="true">
      <span className="shell-notice-text">「{deleted.workspace.name}」を削除しました</span>
      <button type="button" onClick={restore}>元に戻す</button>
      <button type="button" aria-label="閉じる" title="閉じる" onClick={() => setDeletedWorkspace(undefined)}>×</button>
    </div>
  );
}
