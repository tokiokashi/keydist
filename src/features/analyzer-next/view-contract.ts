import type { ModeId } from '../../layout-selection.ts';

export const ANALYSIS_VIEW_TYPES = [
  'bigram-flow',
  'heatmap',
  'finger-metrics',
  'matrices',
  'comparison',
  'sensitivity',
  'playback',
] as const;

export type AnalysisViewType = typeof ANALYSIS_VIEW_TYPES[number];
export type AnalysisViewCardinality = 'single' | 'set';

export type ViewBinding =
  | { kind: 'session' }
  | { kind: 'focused-layout' }
  | { kind: 'layout'; mode: ModeId; id: string };

export type ResolvedBinding =
  | {
      status: 'ok';
      mode: ModeId;
      layoutIds: readonly string[];
    }
  | {
      status: 'unavailable';
      reason: 'not-selected' | 'other-mode' | 'deleted' | 'empty-selection';
    };

export interface AnalysisBindingSession {
  mode: ModeId;
  selectedLayoutIds: readonly string[];
  focusLayoutId?: string;
  availableLayoutIdsByMode: Readonly<Record<ModeId, readonly string[]>>;
}

export interface AnalysisViewInstance {
  id: string;
  type: AnalysisViewType;
  binding: ViewBinding;
  config: unknown;
  configVersion: number;
}

export interface AnalysisViewConfigCodec<Config> {
  version: number;
  defaults: Config;
  /**
   * Decode or migrate config saved at savedVersion into the current version.
   * decodeViewInstance rejects future versions before calling this function.
   */
  decode(raw: unknown, savedVersion: number): Config;
}

export interface AnalysisViewDefinition<Config = unknown> {
  type: AnalysisViewType;
  title: string;
  cardinality: AnalysisViewCardinality;
  configCodec: AnalysisViewConfigCodec<Config>;
  canDuplicate: boolean;
  minWidth?: number;
  minHeight?: number;
}

export function isBindingAllowed(
  cardinality: AnalysisViewCardinality,
  binding: ViewBinding,
): boolean {
  return cardinality === 'set'
    ? binding.kind === 'session'
    : binding.kind !== 'session';
}

export function normalizeSessionFocus(
  selectedLayoutIds: readonly string[],
  focusLayoutId: string | undefined,
): string | undefined {
  if (focusLayoutId !== undefined && selectedLayoutIds.includes(focusLayoutId)) {
    return focusLayoutId;
  }
  return selectedLayoutIds[0];
}

export function resolveViewBinding(
  session: AnalysisBindingSession,
  cardinality: AnalysisViewCardinality,
  binding: ViewBinding,
): ResolvedBinding {
  if (!isBindingAllowed(cardinality, binding)) {
    throw new Error(`View binding ${binding.kind} is incompatible with ${cardinality} cardinality`);
  }

  if (binding.kind === 'session') {
    if (session.selectedLayoutIds.length === 0) {
      return { status: 'unavailable', reason: 'empty-selection' };
    }
    return {
      status: 'ok',
      mode: session.mode,
      layoutIds: [...session.selectedLayoutIds],
    };
  }

  if (binding.kind === 'focused-layout') {
    const focus = normalizeSessionFocus(
      session.selectedLayoutIds,
      session.focusLayoutId,
    );
    if (focus === undefined) {
      return { status: 'unavailable', reason: 'empty-selection' };
    }
    return {
      status: 'ok',
      mode: session.mode,
      layoutIds: [focus],
    };
  }

  if (binding.mode !== session.mode) {
    return { status: 'unavailable', reason: 'other-mode' };
  }

  const available = session.availableLayoutIdsByMode[binding.mode];
  if (!available.includes(binding.id)) {
    return { status: 'unavailable', reason: 'deleted' };
  }

  if (!session.selectedLayoutIds.includes(binding.id)) {
    return { status: 'unavailable', reason: 'not-selected' };
  }

  return {
    status: 'ok',
    mode: binding.mode,
    layoutIds: [binding.id],
  };
}

export function decodeViewInstance(
  raw: unknown,
  definitions: ReadonlyMap<AnalysisViewType, AnalysisViewDefinition>,
): AnalysisViewInstance | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, unknown>;
  if (typeof source.id !== 'string' || source.id.length === 0) return undefined;
  if (typeof source.type !== 'string' || !ANALYSIS_VIEW_TYPES.includes(source.type as AnalysisViewType)) {
    return undefined;
  }

  const definition = definitions.get(source.type as AnalysisViewType);
  if (!definition) return undefined;

  const binding = decodeViewBinding(source.binding);
  if (!binding || !isBindingAllowed(definition.cardinality, binding)) return undefined;

  const savedConfigVersion = source.configVersion;
  if (
    typeof savedConfigVersion !== 'number'
    || !Number.isInteger(savedConfigVersion)
    || savedConfigVersion < 1
    || savedConfigVersion > definition.configCodec.version
  ) {
    return undefined;
  }

  return {
    id: source.id,
    type: definition.type,
    binding,
    config: definition.configCodec.decode(source.config, savedConfigVersion),
    configVersion: definition.configCodec.version,
  };
}

function decodeViewBinding(raw: unknown): ViewBinding | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, unknown>;
  if (source.kind === 'session') return { kind: 'session' };
  if (source.kind === 'focused-layout') return { kind: 'focused-layout' };
  if (
    source.kind === 'layout'
    && (source.mode === 'en' || source.mode === 'ja')
    && typeof source.id === 'string'
    && source.id.length > 0
  ) {
    return { kind: 'layout', mode: source.mode, id: source.id };
  }
  return undefined;
}
