import type {
  AnalysisViewDefinition,
  AnalysisViewInstance,
  AnalysisViewType,
} from './view-contract.ts';
import { decodeViewInstance } from './view-contract.ts';

export const ANALYZER_WORKSPACE_VERSION = 1;
export const ANALYZER_WORKSPACE_LAYOUT_VERSION = 1;

export interface AnalyzerWorkspaceSplitChild {
  weight: number;
  node: AnalyzerWorkspaceLayoutNode;
}

export type AnalyzerWorkspaceLayoutNode =
  | {
      kind: 'split';
      orientation: 'horizontal' | 'vertical';
      children: readonly AnalyzerWorkspaceSplitChild[];
    }
  | {
      kind: 'tabs';
      instanceIds: readonly string[];
      activeInstanceId?: string;
      hiddenInstanceIds?: readonly string[];
    };

export interface AnalyzerWorkspaceLayoutV1 {
  version: typeof ANALYZER_WORKSPACE_LAYOUT_VERSION;
  root?: AnalyzerWorkspaceLayoutNode;
  /**
   * Globally focused pane. Instance ids are unique across the tree, so this also identifies
   * the active tab group without persisting a renderer-specific group id.
   */
  activeInstanceId?: string;
}

export interface AnalyzerWorkspaceStateV1 {
  version: typeof ANALYZER_WORKSPACE_VERSION;
  instances: readonly AnalysisViewInstance[];
  layout: AnalyzerWorkspaceLayoutV1;
}

export function createEmptyAnalyzerWorkspace(): AnalyzerWorkspaceStateV1 {
  return {
    version: ANALYZER_WORKSPACE_VERSION,
    instances: [],
    layout: { version: ANALYZER_WORKSPACE_LAYOUT_VERSION },
  };
}

function record(raw: unknown): Record<string, unknown> | undefined {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : undefined;
}

function positiveWeight(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 1;
}

function normalizeWeightedChildren(
  children: readonly AnalyzerWorkspaceSplitChild[],
): AnalyzerWorkspaceSplitChild[] {
  const total = children.reduce((sum, child) => sum + positiveWeight(child.weight), 0);
  if (total <= 0) {
    const weight = children.length === 0 ? 1 : 1 / children.length;
    return children.map((child) => ({ ...child, weight }));
  }
  return children.map((child) => ({
    ...child,
    weight: positiveWeight(child.weight) / total,
  }));
}

function decodeLayoutNode(
  raw: unknown,
  validIds: ReadonlySet<string>,
  seenIds: Set<string>,
): AnalyzerWorkspaceLayoutNode | undefined {
  const source = record(raw);
  if (!source) return undefined;

  if (source.kind === 'tabs' && Array.isArray(source.instanceIds)) {
    const instanceIds: string[] = [];
    for (const value of source.instanceIds) {
      if (
        typeof value !== 'string'
        || !validIds.has(value)
        || seenIds.has(value)
        || instanceIds.includes(value)
      ) {
        continue;
      }
      seenIds.add(value);
      instanceIds.push(value);
    }
    if (instanceIds.length === 0) return undefined;

    const hiddenInstanceIds = Array.isArray(source.hiddenInstanceIds)
      ? [...new Set(source.hiddenInstanceIds.filter(
          (value): value is string =>
            typeof value === 'string' && instanceIds.includes(value),
        ))]
      : [];
    const visibleIds = instanceIds.filter((id) => !hiddenInstanceIds.includes(id));
    const requestedActive = typeof source.activeInstanceId === 'string'
      && instanceIds.includes(source.activeInstanceId)
      ? source.activeInstanceId
      : undefined;
    const activeInstanceId = requestedActive !== undefined && visibleIds.includes(requestedActive)
      ? requestedActive
      : visibleIds[0] ?? instanceIds[0];

    return {
      kind: 'tabs',
      instanceIds,
      activeInstanceId,
      ...(hiddenInstanceIds.length === 0 ? {} : { hiddenInstanceIds }),
    };
  }

  if (
    source.kind === 'split'
    && (source.orientation === 'horizontal' || source.orientation === 'vertical')
    && Array.isArray(source.children)
  ) {
    const children = source.children
      .map((rawChild) => {
        const wrapped = record(rawChild);
        const rawNode = wrapped && 'node' in wrapped ? wrapped.node : rawChild;
        const node = decodeLayoutNode(rawNode, validIds, seenIds);
        if (!node) return undefined;
        return {
          weight: positiveWeight(wrapped?.weight),
          node,
        };
      })
      .filter((child): child is AnalyzerWorkspaceSplitChild => child !== undefined);

    if (children.length === 0) return undefined;
    if (children.length === 1) return children[0]!.node;
    return {
      kind: 'split',
      orientation: source.orientation,
      children: normalizeWeightedChildren(children),
    };
  }

  return undefined;
}

function tabsNode(instanceIds: readonly string[]): AnalyzerWorkspaceLayoutNode {
  return {
    kind: 'tabs',
    instanceIds: [...instanceIds],
    activeInstanceId: instanceIds[0],
  };
}

function appendOrphans(
  root: AnalyzerWorkspaceLayoutNode | undefined,
  orphanIds: readonly string[],
): AnalyzerWorkspaceLayoutNode | undefined {
  if (orphanIds.length === 0) return root;
  if (!root) return tabsNode(orphanIds);
  if (root.kind === 'tabs') {
    return {
      ...root,
      instanceIds: [...root.instanceIds, ...orphanIds],
    };
  }
  return {
    ...root,
    children: normalizeWeightedChildren([
      ...root.children,
      { weight: 1, node: tabsNode(orphanIds) },
    ]),
  };
}

function visibleInstanceIds(node: AnalyzerWorkspaceLayoutNode | undefined): string[] {
  if (!node) return [];
  if (node.kind === 'tabs') {
    const hidden = new Set(node.hiddenInstanceIds ?? []);
    return node.instanceIds.filter((id) => !hidden.has(id));
  }
  return node.children.flatMap((child) => visibleInstanceIds(child.node));
}

function allInstanceIds(node: AnalyzerWorkspaceLayoutNode | undefined): string[] {
  if (!node) return [];
  return node.kind === 'tabs'
    ? [...node.instanceIds]
    : node.children.flatMap((child) => allInstanceIds(child.node));
}

function normalizeGlobalActive(
  root: AnalyzerWorkspaceLayoutNode | undefined,
  requested: unknown,
): string | undefined {
  const visible = visibleInstanceIds(root);
  if (typeof requested === 'string' && visible.includes(requested)) return requested;
  return visible[0];
}

export function decodeAnalyzerWorkspace(
  raw: unknown,
  definitions: ReadonlyMap<AnalysisViewType, AnalysisViewDefinition>,
): AnalyzerWorkspaceStateV1 {
  const source = record(raw);
  if (!source || source.version !== ANALYZER_WORKSPACE_VERSION) {
    return createEmptyAnalyzerWorkspace();
  }

  const instances = Array.isArray(source.instances)
    ? source.instances
      .map((item) => decodeViewInstance(item, definitions))
      .filter((item): item is AnalysisViewInstance => item !== undefined)
    : [];

  const uniqueInstances: AnalysisViewInstance[] = [];
  const ids = new Set<string>();
  for (const instance of instances) {
    if (ids.has(instance.id)) continue;
    ids.add(instance.id);
    uniqueInstances.push(instance);
  }

  const rawLayout = record(source.layout);
  const seenIds = new Set<string>();
  let root = rawLayout?.version === ANALYZER_WORKSPACE_LAYOUT_VERSION
    ? decodeLayoutNode(rawLayout.root, ids, seenIds)
    : undefined;

  const orphanIds = uniqueInstances
    .map((instance) => instance.id)
    .filter((id) => !seenIds.has(id));
  root = appendOrphans(root, orphanIds);

  const activeInstanceId = normalizeGlobalActive(root, rawLayout?.activeInstanceId);

  return {
    version: ANALYZER_WORKSPACE_VERSION,
    instances: uniqueInstances,
    layout: {
      version: ANALYZER_WORKSPACE_LAYOUT_VERSION,
      ...(root === undefined ? {} : { root }),
      ...(activeInstanceId === undefined ? {} : { activeInstanceId }),
    },
  };
}

export function removeWorkspaceInstance(
  state: AnalyzerWorkspaceStateV1,
  instanceId: string,
  definitions: ReadonlyMap<AnalysisViewType, AnalysisViewDefinition>,
): AnalyzerWorkspaceStateV1 {
  return decodeAnalyzerWorkspace({
    ...state,
    instances: state.instances.filter((instance) => instance.id !== instanceId),
  }, definitions);
}

function duplicateInLayout(
  node: AnalyzerWorkspaceLayoutNode | undefined,
  sourceId: string,
  newId: string,
): AnalyzerWorkspaceLayoutNode | undefined {
  if (!node) return undefined;
  if (node.kind === 'tabs') {
    const index = node.instanceIds.indexOf(sourceId);
    if (index < 0) return node;
    const instanceIds = [...node.instanceIds];
    instanceIds.splice(index + 1, 0, newId);
    return {
      ...node,
      instanceIds,
      activeInstanceId: newId,
      ...(node.hiddenInstanceIds === undefined
        ? {}
        : { hiddenInstanceIds: node.hiddenInstanceIds.filter((id) => id !== newId) }),
    };
  }

  let changed = false;
  const children = node.children.map((child) => {
    if (changed) return child;
    const nextNode = duplicateInLayout(child.node, sourceId, newId);
    if (!nextNode || nextNode === child.node) return child;
    changed = true;
    return { ...child, node: nextNode };
  });
  return changed ? { ...node, children } : node;
}

export function duplicateWorkspaceInstance(
  state: AnalyzerWorkspaceStateV1,
  sourceId: string,
  newId: string,
): AnalyzerWorkspaceStateV1 {
  if (state.instances.some((instance) => instance.id === newId)) {
    throw new Error(`Duplicate Analyzer Workspace instance id: ${newId}`);
  }
  const source = state.instances.find((instance) => instance.id === sourceId);
  if (!source) return state;

  const nextRoot = duplicateInLayout(state.layout.root, sourceId, newId);
  return {
    ...state,
    instances: [
      ...state.instances,
      {
        ...structuredClone(source),
        id: newId,
      },
    ],
    layout: {
      ...state.layout,
      ...(nextRoot === undefined ? {} : { root: nextRoot }),
      activeInstanceId: newId,
    },
  };
}

export function setWorkspaceInstanceVisibility(
  state: AnalyzerWorkspaceStateV1,
  instanceId: string,
  visible: boolean,
): AnalyzerWorkspaceStateV1 {
  const update = (
    node: AnalyzerWorkspaceLayoutNode,
  ): AnalyzerWorkspaceLayoutNode => {
    if (node.kind === 'tabs') {
      if (!node.instanceIds.includes(instanceId)) return node;
      const hidden = new Set(node.hiddenInstanceIds ?? []);
      if (visible) hidden.delete(instanceId);
      else hidden.add(instanceId);
      const hiddenInstanceIds = [...hidden];
      const visibleIds = node.instanceIds.filter((id) => !hidden.has(id));
      return {
        ...node,
        activeInstanceId: visibleIds.includes(node.activeInstanceId ?? '')
          ? node.activeInstanceId
          : visibleIds[0] ?? node.instanceIds[0],
        ...(hiddenInstanceIds.length === 0
          ? { hiddenInstanceIds: undefined }
          : { hiddenInstanceIds }),
      };
    }
    return {
      ...node,
      children: node.children.map((child) => ({
        ...child,
        node: update(child.node),
      })),
    };
  };

  if (!state.layout.root) return state;
  const root = update(state.layout.root);
  const visibleIds = visibleInstanceIds(root);
  const activeInstanceId = visibleIds.includes(state.layout.activeInstanceId ?? '')
    ? state.layout.activeInstanceId
    : visibleIds[0];

  return {
    ...state,
    layout: {
      ...state.layout,
      root,
      ...(activeInstanceId === undefined
        ? { activeInstanceId: undefined }
        : { activeInstanceId }),
    },
  };
}

/** Exposed for adapter/invariant tests. */
export function workspaceLayoutInstanceIds(
  state: AnalyzerWorkspaceStateV1,
): readonly string[] {
  return allInstanceIds(state.layout.root);
}
