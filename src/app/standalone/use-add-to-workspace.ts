import { useCallback } from 'react';
import type { Command } from '#input/commands/index.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import {
  addStandalonePaneToNewWorkspaceCommand,
  addStandalonePaneToWorkspaceCommand,
} from '#engine/workspace-commands.ts';
import { findWorkspace } from '#engine/workspace.ts';
import type { AddToWorkspaceDestination } from '#hosts/shared/AddToWorkspaceMenu.tsx';
import { defaultGridSize } from '#hosts/workspace/grid-metrics.ts';
import { setAddedToWorkspace } from '../workspace/added-to-workspace-notice.ts';
import { generatePaneId, generateWorkspaceId } from '../workspace/id-generator.ts';

/**
 * 個別画面の「Workspaceに追加」の書き込みと知らせ（3つの個別画面で共通）。
 *
 * 書き込みはコマンド1回（新しいWorkspaceは作成と追加が1回）で、個別画面のUndoで戻る。追加先へは移らず、
 * 追加した事実と追加先へのリンクを知らせる（個別画面で見ていたものを手放さないため）。
 * ペインの大きさは、Workspaceの「ペインを追加」と同じ既定の大きさにする。
 */
export function useAddToWorkspace(
  analyzerId: string,
  dispatch: (command: Command<KeydistAssets>) => void,
  getAssets: () => KeydistAssets,
  /**
   * 間引き待ちの書き込み（解析設定・テキストの本文）を今すぐ反映する。待ちを残して追加すると、履歴が
   * 「追加」→「待っていた変更」の順に積まれ、Undo 1回で追加が戻らない（`WorkspaceApp`の複製・削除と同じ理由）。
   */
  flushPending: () => void,
) {
  return useCallback((destination: AddToWorkspaceDestination, options: unknown) => {
    flushPending();
    const source = { paneId: generatePaneId(), analyzerId, options };
    const size = defaultGridSize(analyzerId);
    if (destination.kind === 'existing') {
      dispatch(addStandalonePaneToWorkspaceCommand(destination.workspaceId, source, size));
    } else {
      dispatch(addStandalonePaneToNewWorkspaceCommand(generateWorkspaceId(), source, size));
    }
    // 追加できたかは、書き込み後の手持ちにそのペインがあるかで確かめる（無いWorkspaceへの追加は何もしない）
    const workspaces = getAssets().workspaces;
    const target = destination.kind === 'existing'
      ? findWorkspace(workspaces, destination.workspaceId)
      : workspaces.find((workspace) => workspace.panes.some((pane) => pane.id === source.paneId));
    if (target === undefined || !target.panes.some((pane) => pane.id === source.paneId)) return;
    setAddedToWorkspace({ workspaceId: target.id, paneId: source.paneId });
  }, [analyzerId, dispatch, getAssets, flushPending]);
}
