export type PanelId = string;

export interface WorkspacePanelDefinition {
  readonly id: PanelId;
  readonly title: string;
  readonly defaultDockSlot: string;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly defaultFloatingWidth?: number;
  readonly defaultFloatingHeight?: number;
  readonly canFloat: boolean;
  readonly canHide: boolean;
}

export type WorkspacePanelDefinitionInput = Omit<
  WorkspacePanelDefinition,
  'canFloat' | 'canHide'
> & {
  readonly canFloat?: boolean;
  readonly canHide?: boolean;
};

export type WorkspacePanelRegistry = ReadonlyMap<PanelId, WorkspacePanelDefinition>;

export function createWorkspacePanelRegistry(
  definitions: readonly WorkspacePanelDefinitionInput[],
): WorkspacePanelRegistry {
  const registry = new Map<PanelId, WorkspacePanelDefinition>();

  for (const definition of definitions) {
    if (definition.id.length === 0) {
      throw new Error('Workspace panel id must not be empty');
    }
    if (registry.has(definition.id)) {
      throw new Error(`Duplicate workspace panel id: ${definition.id}`);
    }

    registry.set(definition.id, {
      ...definition,
      canFloat: definition.canFloat ?? true,
      canHide: definition.canHide ?? false,
    });
  }

  return registry;
}

/**
 * registryをcapability / サイズのauthorityにするための解決関数（#413 Panel model）。
 * WorkspacePanel はこれを通してのみ canFloat / minWidth / minHeight / defaultFloatingWidth
 * / defaultFloatingHeight を読み、consumer側のpropsで同じ値を重複指定しない。
 * definitionが無い（未登録パネルの防御的呼び出し）場合もここで既定値へ倒す。
 */
export interface ResolvedPanelLayout {
  readonly canFloat: boolean;
  readonly minWidth: number;
  readonly minHeight: number;
  readonly defaultFloatingWidth: number;
  readonly defaultFloatingHeight: number;
}

export const DEFAULT_PANEL_MIN_WIDTH = 320;
export const DEFAULT_PANEL_MIN_HEIGHT = 240;
export const DEFAULT_PANEL_FLOATING_WIDTH = 560;
export const DEFAULT_PANEL_FLOATING_HEIGHT = 480;

export function resolvePanelLayout(
  definition: WorkspacePanelDefinition | undefined,
): ResolvedPanelLayout {
  return {
    canFloat: definition?.canFloat ?? true,
    minWidth: definition?.minWidth ?? DEFAULT_PANEL_MIN_WIDTH,
    minHeight: definition?.minHeight ?? DEFAULT_PANEL_MIN_HEIGHT,
    defaultFloatingWidth: definition?.defaultFloatingWidth ?? DEFAULT_PANEL_FLOATING_WIDTH,
    defaultFloatingHeight: definition?.defaultFloatingHeight ?? DEFAULT_PANEL_FLOATING_HEIGHT,
  };
}
