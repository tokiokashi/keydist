import { useNavigate } from '@tanstack/react-router';
import type { SampleKind } from '#engine/sample-workspace.ts';
import { createSampleWorkspaceInStorage } from './create-workspace.ts';
import { generatePaneId, generateWorkspaceId } from './id-generator.ts';

/**
 * トップのサンプルのボタンを押した時の動作。選んだ種類のサンプルを作って保存し、できたWorkspaceを開く。
 * 保存できなかった時は何もしない（画面に留まる）。
 */
export function useCreateSampleWorkspace(): (kind: SampleKind) => void {
  const navigate = useNavigate();
  return (kind) => {
    const id = generateWorkspaceId();
    if (!createSampleWorkspaceInStorage(id, generatePaneId, kind)) return;
    void navigate({ to: '/workspace/$id', params: { id } });
  };
}
