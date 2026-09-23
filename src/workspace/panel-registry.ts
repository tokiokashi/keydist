export type PanelId = string;

export interface WorkspacePanelDefinition {
  readonly id: PanelId;
  readonly title: string;
  readonly defaultDockSlot: string;
  readonly minWidth?: number;
  readonly minHeight?: number;
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
