import { useSyncExternalStore } from 'react';
import { ErrorDetails } from '#hosts/shared/ErrorDetails.tsx';
import { getImportedWorkspacesSnapshot, setImportedWorkspaces, subscribeImportedWorkspaces } from './imported-workspaces-notice.ts';

/**
 * Workspaceをファイルから読み込んだ直後の知らせ。何件読み込めたかと、別名で足した理由・足さなかった理由・
 * この端末に無い参照先を一覧で伝える。読み込んだWorkspaceは削除から元に戻せるので、ここには元に戻すを置かない。
 */
export function ImportedWorkspacesNotice() {
  const imported = useSyncExternalStore(subscribeImportedWorkspaces, getImportedWorkspacesSnapshot, () => undefined);
  if (imported === undefined) return null;
  return (
    <div className="shell-notice shell-notice-detailed" role="status" data-imported-workspaces-notice="true" key={imported.serial}>
      <div className="shell-notice-body">
        <span data-imported-workspaces-summary="true">{imported.summary}</span>
        {imported.lines.length === 0 ? null : (
          <ul className="shell-notice-details">
            {imported.lines.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        )}
        <ErrorDetails lines={imported.details} />
      </div>
      <button type="button" aria-label="閉じる" title="閉じる" onClick={() => setImportedWorkspaces(undefined)}>
        ×
      </button>
    </div>
  );
}
