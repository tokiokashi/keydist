import type { PanelId } from './panel-registry.ts';
import type {
  PanelRect,
  WorkspacePanelState,
  WorkspaceStateV1,
} from './workspace-state.ts';

export type WorkspaceAction =
  | { type: 'float'; id: PanelId; rect?: PanelRect }
  | { type: 'dock'; id: PanelId; dockSlot?: string }
  | { type: 'move'; id: PanelId; x: number; y: number }
  | { type: 'resize'; id: PanelId; width: number; height: number }
  | { type: 'activate'; id: PanelId }
  | { type: 'set-visible'; id: PanelId; visible: boolean };

function updatePanel(
  state: WorkspaceStateV1,
  id: PanelId,
  update: (panel: WorkspacePanelState) => WorkspacePanelState,
): WorkspaceStateV1 {
  const panel = state.panels[id];
  if (panel === undefined) return state;
  return {
    ...state,
    panels: { ...state.panels, [id]: update(panel) },
  };
}

export function activatePanel(state: WorkspaceStateV1, id: PanelId): WorkspaceStateV1 {
  if (state.panels[id] === undefined) return state;
  const nextOrder = state.zOrder.filter((panelId) => panelId !== id);
  nextOrder.push(id);
  if (nextOrder.every((panelId, index) => panelId === state.zOrder[index])) return state;
  return { ...state, zOrder: nextOrder };
}

export function workspaceReducer(
  state: WorkspaceStateV1,
  action: WorkspaceAction,
): WorkspaceStateV1 {
  switch (action.type) {
    case 'float': {
      const floated = updatePanel(state, action.id, (panel) => ({
        ...panel,
        mode: 'floating',
        ...(action.rect === undefined ? {} : { rect: { ...action.rect } }),
      }));
      return activatePanel(floated, action.id);
    }
    case 'dock':
      return updatePanel(state, action.id, (panel) => ({
        ...panel,
        mode: 'docked',
        ...(action.dockSlot === undefined ? {} : { dockSlot: action.dockSlot }),
      }));
    case 'move':
      return updatePanel(state, action.id, (panel) => panel.rect === undefined
        ? panel
        : { ...panel, rect: { ...panel.rect, x: action.x, y: action.y } });
    case 'resize':
      return updatePanel(state, action.id, (panel) => panel.rect === undefined
        ? panel
        : { ...panel, rect: { ...panel.rect, width: action.width, height: action.height } });
    case 'activate':
      return activatePanel(state, action.id);
    case 'set-visible':
      return updatePanel(state, action.id, (panel) => ({ ...panel, visible: action.visible }));
  }
}
