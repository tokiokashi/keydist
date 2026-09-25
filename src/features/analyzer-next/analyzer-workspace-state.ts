import type { AnalysisViewDefinition, AnalysisViewInstance, AnalysisViewType } from './view-contract.ts';
import { decodeViewInstance } from './view-contract.ts';

export const ANALYZER_WORKSPACE_VERSION = 1;
export const ANALYZER_WORKSPACE_LAYOUT_VERSION = 1;

export type AnalyzerWorkspaceLayoutNode =
  | {
      kind: 'split';
      orientation: 'horizontal' | 'vertical';
      children: readonly AnalyzerWorkspaceLayoutNode[];
    }
  | {
      kind: 'tabs';
      instanceIds: readonly string[];
      activeInstanceId?: string;
    };

export interface AnalyzerWorkspaceLayoutV1 {
  version: typeof ANALYZER_WORKSPACE_LAYOUT_VERSION;
  root?: AnalyzerWorkspaceLayoutNode;
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

function decodeLayoutNode(
  raw: unknown,
  validIds: ReadonlySet<string>,
): AnalyzerWorkspaceLayoutNode | undefined {
  const source = record(raw);
  if (!source) return undefined;

  if (source.kind === 'tabs' && Array.isArray(source.instanceIds)) {
    const instanceIds = [...new Set(
      source.instanceIds.filter(
        (value): value is string => typeof value === 'string' && validIds.has(value),
      ),
    )];
    if (instanceIds.length === 0) return undefined;
    const activeInstanceId = typeof source.activeInstanceId === 'string'
      && instanceIds.includes(source.activeInstanceId)
      ? source.activeInstanceId
      : instanceIds[0];
    return { kind: 'tabs', instanceIds, activeInstanceId };
  }

  if (
    source.kind === 'split'
    && (source.orientation === 'horizontal' || source.orientation === 'vertical')
    && Array.isArray(source.children)
  ) {
    const children = source.children
      .map((child) => decodeLayoutNode(child, validIds))
      .filter((child): child is AnalyzerWorkspaceLayoutNode => child !== undefined);
    if (children.length === 0) return undefined;
    if (children.length === 1) return children[0];
    return {
      kind: 'split',
      orientation: source.orientation,
      children,
    };
  }

  return undefined;
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
  const root = rawLayout?.version === ANALYZER_WORKSPACE_LAYOUT_VERSION
    ? decodeLayoutNode(rawLayout.root, ids)
    : undefined;

  return {
    version: ANALYZER_WORKSPACE_VERSION,
    instances: uniqueInstances,
    layout: {
      version: ANALYZER_WORKSPACE_LAYOUT_VERSION,
      ...(root === undefined ? {} : { root }),
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
  return {
    ...state,
    instances: [
      ...state.instances,
      {
        ...structuredClone(source),
        id: newId,
      },
    ],
  };
}
