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

/**
 * 現在のdefinitionsに無いパネルは削除せずdormant（休眠）として state.panels に残す。
 * 動的パネル（レイヤーカンペ等）は配列切替でidが行き来するため、消すと
 * A→B→A で浮動位置が失われる。zOrderとレンダリングからは除外し、
 * 同じidが再登場した時にそのまま状態を復元する。世代のGCはこの版では行わない。
 */
export function reconcileWorkspaceState(
  state: WorkspaceStateV1,
  definitions: readonly WorkspacePanelDefinition[],
): WorkspaceStateV1 {
  const definitionIds = new Set<PanelId>();
  const nextPanels: WorkspacePanels = { ...state.panels };

  for (const definition of definitions) {
    if (definitionIds.has(definition.id)) {
      throw new Error(`Duplicate workspace panel id: ${definition.id}`);
    }
    definitionIds.add(definition.id);
    const current = nextPanels[definition.id];
    if (current === undefined) {
      nextPanels[definition.id] = createWorkspacePanelState(definition);
    } else if (!definition.canHide && !current.visible) {
      // dormant中はdefinition不在のためcapabilityを検証できない。
      // 同じidが再登場した時点で、現在のdefinition invariantを必ず掛け直す。
      nextPanels[definition.id] = { ...current, visible: true };
    }
  }

  const nextOrder = state.zOrder.filter((id) => definitionIds.has(id));
  for (const definition of definitions) {
    if (!nextOrder.includes(definition.id)) nextOrder.push(definition.id);
  }

  const stateKeys = Object.keys(state.panels);
  const nextKeys = Object.keys(nextPanels);
  const samePanels = stateKeys.length === nextKeys.length
    && nextKeys.every((id) => state.panels[id as PanelId] === nextPanels[id as PanelId]);
  const sameOrder = nextOrder.length === state.zOrder.length
    && nextOrder.every((id, index) => id === state.zOrder[index]);

  if (samePanels && sameOrder) return state;
  return {
    ...state,
    panels: nextPanels,
    zOrder: nextOrder,
  };
}
