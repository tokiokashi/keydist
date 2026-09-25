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

export interface AnalysisTimingConditions {
  playbackRateAverage: UiStateConditionsDefaults['playbackRateAverage'];
  playbackRateWindow: UiStateConditionsDefaults['playbackRateWindow'];
  playbackRateHalfLifeSeconds: UiStateConditionsDefaults['playbackRateHalfLifeSeconds'];
  stepsPerSecond: UiPlaybackState['stepsPerSecond'];
  speedMultiplier: UiPlaybackState['speedMultiplier'];
  sameFingerDelay: UiPlaybackState['sameFingerDelay'];
  allFingerMovementDelay: UiPlaybackState['allFingerMovementDelay'];
  useCalibration: UiPlaybackState['useCalibration'];
}

export interface AnalysisSessionState {
  mode: ModeId;
  text: string;
  selectedLayoutIds: readonly string[];
  focusLayoutId?: string;
  distance: {
    defaults: DistanceOnlyDefaults;
    perLayout: Readonly<Record<string, Partial<DistanceOnlyDefaults> & Pick<UiStateLayoutConditions, 'romajiRule'>>>;
  };
  timing: {
    defaults: AnalysisTimingConditions;
    perLayout: Readonly<Record<string, Partial<AnalysisTimingConditions>>>;
  };
  revisions: {
    target: number;
    distance: number;
    timing: number;
    focus: number;
  };
}

export type AnalysisSessionListener = () => void;

export interface AnalysisSessionStore {
  getSnapshot(): AnalysisSessionState;
  subscribe(listener: AnalysisSessionListener): () => void;
  setMode(mode: ModeId): void;
  setText(text: string): void;
  setSelectedLayouts(layoutIds: readonly string[]): void;
  setFocus(layoutId: string | undefined): void;
  setDistanceDefault<K extends keyof DistanceOnlyDefaults>(
    key: K,
    value: DistanceOnlyDefaults[K],
  ): void;
  setDistanceOverride<K extends keyof (DistanceOnlyDefaults & Pick<UiStateLayoutConditions, 'romajiRule'>)>(
    layoutId: string,
    key: K,
    value: (DistanceOnlyDefaults & Pick<UiStateLayoutConditions, 'romajiRule'>)[K] | undefined,
  ): void;
  setTimingDefault<K extends keyof AnalysisTimingConditions>(
    key: K,
    value: AnalysisTimingConditions[K],
  ): void;
  setTimingOverride<K extends keyof AnalysisTimingConditions>(
    layoutId: string,
    key: K,
    value: AnalysisTimingConditions[K] | undefined,
  ): void;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function cloneState(state: AnalysisSessionState): AnalysisSessionState {
  return structuredClone(state);
}

export function createAnalysisSessionStore(
  initial: Omit<AnalysisSessionState, 'revisions'>,
): AnalysisSessionStore {
  let state: AnalysisSessionState = {
    ...cloneState({
      ...initial,
      revisions: { target: 0, distance: 0, timing: 0, focus: 0 },
    }),
    selectedLayoutIds: unique(initial.selectedLayoutIds),
  };
  state = {
    ...state,
    focusLayoutId: normalizeSessionFocus(state.selectedLayoutIds, state.focusLayoutId),
  };

  const listeners = new Set<AnalysisSessionListener>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  const replace = (next: AnalysisSessionState) => {
    state = next;
    emit();
  };

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setMode(mode) {
      if (state.mode === mode) return;
      replace({
        ...state,
        mode,
        revisions: { ...state.revisions, target: state.revisions.target + 1 },
      });
    },
    setText(text) {
      if (state.text === text) return;
      replace({
        ...state,
        text,
        revisions: { ...state.revisions, target: state.revisions.target + 1 },
      });
    },
    setSelectedLayouts(layoutIds) {
      const selectedLayoutIds = unique(layoutIds);
      if (
        selectedLayoutIds.length === state.selectedLayoutIds.length
        && selectedLayoutIds.every((id, index) => id === state.selectedLayoutIds[index])
      ) return;
      const focusLayoutId = normalizeSessionFocus(selectedLayoutIds, state.focusLayoutId);
      replace({
        ...state,
        selectedLayoutIds,
        focusLayoutId,
        revisions: {
          ...state.revisions,
          target: state.revisions.target + 1,
          ...(focusLayoutId === state.focusLayoutId
            ? {}
            : { focus: state.revisions.focus + 1 }),
        },
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
