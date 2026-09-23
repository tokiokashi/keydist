import type {
  PanelId,
  WorkspacePanelDefinition,
} from './panel-registry.ts';

export const WORKSPACE_STATE_VERSION = 1;

export type PanelMode = 'docked' | 'floating';

export interface PanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WorkspacePanelState {
  visible: boolean;
  mode: PanelMode;
  rect?: PanelRect;
  dockSlot?: string;
}

export type WorkspacePanels = Partial<Record<PanelId, WorkspacePanelState>>;

export interface WorkspaceStateV1 {
  version: typeof WORKSPACE_STATE_VERSION;
  panels: WorkspacePanels;
  /** bottom -> top */
  zOrder: PanelId[];
}

export function createWorkspacePanelState(
  definition: WorkspacePanelDefinition,
): WorkspacePanelState {
  return {
    visible: true,
    mode: 'docked',
    dockSlot: definition.defaultDockSlot,
  };
}

export function createWorkspaceState(
  definitions: readonly WorkspacePanelDefinition[],
): WorkspaceStateV1 {
  const panels: WorkspacePanels = {};
  const zOrder: PanelId[] = [];

  for (const definition of definitions) {
    if (Object.hasOwn(panels, definition.id)) {
      throw new Error(`Duplicate workspace panel id: ${definition.id}`);
    }
    panels[definition.id] = createWorkspacePanelState(definition);
    zOrder.push(definition.id);
  }

  return {
    version: WORKSPACE_STATE_VERSION,
    panels,
    zOrder,
  };
}

export function reconcileWorkspaceState(
  state: WorkspaceStateV1,
  definitions: readonly WorkspacePanelDefinition[],
): WorkspaceStateV1 {
  const nextPanels: WorkspacePanels = {};
  const definitionIds = new Set<PanelId>();

  for (const definition of definitions) {
    if (definitionIds.has(definition.id)) {
      throw new Error(`Duplicate workspace panel id: ${definition.id}`);
    }
    definitionIds.add(definition.id);
    nextPanels[definition.id] = state.panels[definition.id]
      ?? createWorkspacePanelState(definition);
  }

  const nextOrder = state.zOrder.filter((id) => definitionIds.has(id));
  for (const definition of definitions) {
    if (!nextOrder.includes(definition.id)) nextOrder.push(definition.id);
  }

  const samePanels = Object.keys(state.panels).length === definitions.length
    && definitions.every(({ id }) => state.panels[id] === nextPanels[id]);
  const sameOrder = nextOrder.length === state.zOrder.length
    && nextOrder.every((id, index) => id === state.zOrder[index]);

  if (samePanels && sameOrder) return state;
  return {
    ...state,
    panels: nextPanels,
    zOrder: nextOrder,
  };
}
