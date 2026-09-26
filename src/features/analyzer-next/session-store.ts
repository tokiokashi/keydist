import type { ModeId } from '../../layout-selection.ts';
import type {
  UiPlaybackState,
  UiStateConditionsDefaults,
  UiStateLayoutConditions,
} from '../../ui-state.ts';
import { normalizeSessionFocus } from './view-contract.ts';

type DistanceOnlyDefaults = Omit<
  UiStateConditionsDefaults,
  'playbackRateAverage' | 'playbackRateWindow' | 'playbackRateHalfLifeSeconds'
>;
type DeepReadonly<T> =
  T extends (...args: never[]) => unknown ? T
    : T extends readonly (infer Item)[] ? readonly DeepReadonly<Item>[]
      : T extends object ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
        : T;


export type AnalysisDistanceOverrideConditions =
  & DistanceOnlyDefaults
  & Pick<UiStateLayoutConditions, 'romajiRule'>;

export interface AnalysisTimingGlobalConditions {
  playbackRateAverage: UiStateConditionsDefaults['playbackRateAverage'];
  playbackRateWindow: UiStateConditionsDefaults['playbackRateWindow'];
  playbackRateHalfLifeSeconds: UiStateConditionsDefaults['playbackRateHalfLifeSeconds'];
}

export interface AnalysisTimingOverrideConditions {
  stepsPerSecond: UiPlaybackState['stepsPerSecond'];
  speedMultiplier: UiPlaybackState['speedMultiplier'];
  sameFingerDelay: UiPlaybackState['sameFingerDelay'];
  allFingerMovementDelay: UiPlaybackState['allFingerMovementDelay'];
  useCalibration: UiPlaybackState['useCalibration'];
}

export type AnalysisTimingConditions =
  & AnalysisTimingGlobalConditions
  & AnalysisTimingOverrideConditions;

export interface AnalysisSessionTarget {
  readonly mode: ModeId;
  readonly selectedLayoutIds: readonly string[];
  readonly focusLayoutId?: string;
}

export interface AnalysisSessionState extends AnalysisSessionTarget {
  readonly text: string;
  readonly distance: {
    readonly defaults: DeepReadonly<DistanceOnlyDefaults>;
    readonly perLayout: Readonly<Record<
      string,
      DeepReadonly<Partial<AnalysisDistanceOverrideConditions>>
    >>;
  };
  readonly timing: {
    readonly defaults: DeepReadonly<AnalysisTimingConditions>;
    readonly perLayout: Readonly<Record<
      string,
      DeepReadonly<Partial<AnalysisTimingOverrideConditions>>
    >>;
  };
  readonly revisions: Readonly<{
    target: number;
    distance: number;
    timing: number;
    focus: number;
  }>;
}

export type AnalysisSessionListener = () => void;

export interface AnalysisSessionStore {
  getSnapshot(): AnalysisSessionState;
  subscribe(listener: AnalysisSessionListener): () => void;
  setTarget(target: AnalysisSessionTarget): void;
  setText(text: string): void;
  setSelectedLayouts(layoutIds: readonly string[]): void;
  setFocus(layoutId: string | undefined): void;
  setDistanceDefault<K extends keyof DistanceOnlyDefaults>(
    key: K,
    value: DistanceOnlyDefaults[K],
  ): void;
  setDistanceOverride<K extends keyof AnalysisDistanceOverrideConditions>(
    layoutId: string,
    key: K,
    value: AnalysisDistanceOverrideConditions[K] | undefined,
  ): void;
  setTimingDefault<K extends keyof AnalysisTimingConditions>(
    key: K,
    value: AnalysisTimingConditions[K],
  ): void;
  setTimingOverride<K extends keyof AnalysisTimingOverrideConditions>(
    layoutId: string,
    key: K,
    value: AnalysisTimingOverrideConditions[K] | undefined,
  ): void;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return Object.freeze(value) as T;
}

function cloneState(state: AnalysisSessionState): AnalysisSessionState {
  return deepFreeze(structuredClone(state));
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((id, index) => id === right[index]);
}

function normalizeTarget(target: AnalysisSessionTarget): AnalysisSessionTarget {
  const selectedLayoutIds = unique(target.selectedLayoutIds);
  return {
    mode: target.mode,
    selectedLayoutIds,
    focusLayoutId: normalizeSessionFocus(selectedLayoutIds, target.focusLayoutId),
  };
}

export function createAnalysisSessionStore(
  initial: Omit<AnalysisSessionState, 'revisions'>,
): AnalysisSessionStore {
  const normalizedTarget = normalizeTarget(initial);
  let state: AnalysisSessionState = cloneState({
    ...initial,
    ...normalizedTarget,
    revisions: { target: 0, distance: 0, timing: 0, focus: 0 },
  });

  const listeners = new Set<AnalysisSessionListener>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  const replace = (next: AnalysisSessionState) => {
    state = deepFreeze(next);
    emit();
  };
  const setTarget = (target: AnalysisSessionTarget): void => {
    const normalized = normalizeTarget(target);
    const targetChanged = normalized.mode !== state.mode
      || !sameIds(normalized.selectedLayoutIds, state.selectedLayoutIds);
    const focusChanged = normalized.focusLayoutId !== state.focusLayoutId;
    if (!targetChanged && !focusChanged) return;

    replace({
      ...state,
      ...normalized,
      revisions: {
        ...state.revisions,
        target: state.revisions.target + (targetChanged ? 1 : 0),
        focus: state.revisions.focus + (focusChanged ? 1 : 0),
      },
    });
  };

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setTarget,
    setText(text) {
      if (state.text === text) return;
      replace({
        ...state,
        text,
        revisions: { ...state.revisions, target: state.revisions.target + 1 },
      });
    },
    setSelectedLayouts(layoutIds) {
      setTarget({
        mode: state.mode,
        selectedLayoutIds: layoutIds,
        focusLayoutId: state.focusLayoutId,
      });
    },
    setFocus(layoutId) {
      const focusLayoutId = normalizeSessionFocus(state.selectedLayoutIds, layoutId);
      if (focusLayoutId === state.focusLayoutId) return;
      replace({
        ...state,
        focusLayoutId,
        revisions: { ...state.revisions, focus: state.revisions.focus + 1 },
      });
    },
    setDistanceDefault(key, value) {
      if (Object.is(state.distance.defaults[key], value)) return;
      replace({
        ...state,
        distance: {
          ...state.distance,
          defaults: { ...state.distance.defaults, [key]: structuredClone(value) },
        },
        revisions: { ...state.revisions, distance: state.revisions.distance + 1 },
      });
    },
    setDistanceOverride(layoutId, key, value) {
      const current = state.distance.perLayout[layoutId] ?? {};
      if (value !== undefined && Object.is(current[key], value)) return;
      if (value === undefined && !(key in current)) return;
      const nextOverride = { ...current };
      if (value === undefined) delete nextOverride[key];
      else Object.assign(nextOverride, { [key]: structuredClone(value) });
      const perLayout = { ...state.distance.perLayout };
      if (Object.keys(nextOverride).length === 0) delete perLayout[layoutId];
      else perLayout[layoutId] = nextOverride;
      replace({
        ...state,
        distance: { ...state.distance, perLayout },
        revisions: { ...state.revisions, distance: state.revisions.distance + 1 },
      });
    },
    setTimingDefault(key, value) {
      if (Object.is(state.timing.defaults[key], value)) return;
      replace({
        ...state,
        timing: {
          ...state.timing,
          defaults: { ...state.timing.defaults, [key]: structuredClone(value) },
        },
        revisions: { ...state.revisions, timing: state.revisions.timing + 1 },
      });
    },
    setTimingOverride(layoutId, key, value) {
      const current = state.timing.perLayout[layoutId] ?? {};
      if (value !== undefined && Object.is(current[key], value)) return;
      if (value === undefined && !(key in current)) return;
      const nextOverride = { ...current };
      if (value === undefined) delete nextOverride[key];
      else Object.assign(nextOverride, { [key]: structuredClone(value) });
      const perLayout = { ...state.timing.perLayout };
      if (Object.keys(nextOverride).length === 0) delete perLayout[layoutId];
      else perLayout[layoutId] = nextOverride;
      replace({
        ...state,
        timing: { ...state.timing, perLayout },
        revisions: { ...state.revisions, timing: state.revisions.timing + 1 },
      });
    },
  };
}

export type { DistanceOnlyDefaults as AnalysisDistanceConditions };
