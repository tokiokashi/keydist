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
