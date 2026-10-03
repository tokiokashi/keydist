import { useNavigate } from '@tanstack/react-router';
import { createSampleWorkspaceInStorage } from './create-workspace.ts';
import { generatePaneId, generateWorkspaceId } from './id-generator.ts';

/**
 * 「サンプルのWorkspaceを作る」を押した時の動作。作って保存し、できたWorkspaceを開く。
 * 保存できなかった時は何もしない（画面に留まる）。
 */
export function useCreateSampleWorkspace(): () => void {
  const navigate = useNavigate();
  return () => {
    const id = generateWorkspaceId();
    if (!createSampleWorkspaceInStorage(id, generatePaneId)) return;
    void navigate({ to: '/workspace/$id', params: { id } });
  };
}
