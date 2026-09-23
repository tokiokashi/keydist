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

export const DORMANT_DYNAMIC_PANEL_PREFIX = 'input.layer:';
export const MAX_DORMANT_DYNAMIC_PANELS = 128;

function compactWorkspacePanels(
  panels: WorkspacePanels,
  currentIds: ReadonlySet<PanelId>,
): WorkspacePanels {
  const entries = Object.entries(panels) as Array<[PanelId, WorkspacePanelState]>;
  const dormantDynamicIds = entries
    .filter(([id]) => !currentIds.has(id) && id.startsWith(DORMANT_DYNAMIC_PANEL_PREFIX))
    .map(([id]) => id);
  const keepDormant = new Set(
    dormantDynamicIds.slice(-MAX_DORMANT_DYNAMIC_PANELS),
  );

  return Object.fromEntries(entries.filter(([id]) =>
    currentIds.has(id) || keepDormant.has(id))) as WorkspacePanels;
}

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
 * 現在のdefinitionsに無い動的レイヤーカンペだけをdormantとして保持する。
 * A→B→Aの復元に必要だが、無制限に保持すると自作layout/layerの履歴で増え続けるため
 * first-seen順の末尾128件へ上限を設ける。未知/廃止済みの静的panel IDはpruneする。
 * zOrderには現行definitionsだけを残す。
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

  const compactedPanels = compactWorkspacePanels(nextPanels, definitionIds);
  const stateKeys = Object.keys(state.panels);
  const nextKeys = Object.keys(compactedPanels);
  const samePanels = stateKeys.length === nextKeys.length
    && nextKeys.every((id) => state.panels[id as PanelId] === compactedPanels[id as PanelId]);
  const sameOrder = nextOrder.length === state.zOrder.length
    && nextOrder.every((id, index) => id === state.zOrder[index]);

  if (samePanels && sameOrder) return state;
  return {
    ...state,
    panels: compactedPanels,
    zOrder: nextOrder,
  };
}
