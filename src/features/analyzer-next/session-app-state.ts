import type { AppStateV2 } from '../../app-state.ts';
import { ANALYZER_INITIAL_LAYOUTS } from '#legacy/analyzer-ui-state-bootstrap.ts';
import { analyzerSampleText } from '#legacy/analyzer-samples.ts';
import {
  createDefaultUiState,
  type UiPlaybackState,
  type UiStateLayoutConditions,
} from '#legacy/ui-state.ts';
import type {
  AnalysisDistanceOverrideConditions,
  AnalysisSessionState,
  AnalysisTimingOverrideConditions,
} from './session-store.ts';

export type AnalysisSessionSeed = Omit<AnalysisSessionState, 'revisions'>;

const TIMING_OVERRIDE_KEYS = [
  'stepsPerSecond',
  'speedMultiplier',
  'sameFingerDelay',
  'allFingerMovementDelay',
  'useCalibration',
] as const satisfies readonly (keyof AnalysisTimingOverrideConditions)[];

function defaultSlices() {
  return createDefaultUiState({
    textPanelOpen: true,
    usePlaybackCalibration: false,
    selectedLayouts: ANALYZER_INITIAL_LAYOUTS,
  });
}

function distanceOverrides(
  perLayout: Readonly<Record<string, UiStateLayoutConditions>>,
): Record<string, Partial<AnalysisDistanceOverrideConditions>> {
  return Object.fromEntries(Object.entries(perLayout).flatMap(([layoutId, override]) => {
    const { playback: _playback, ...distance } = override;
    return Object.keys(distance).length === 0 ? [] : [[layoutId, structuredClone(distance)]];
  }));
}

function timingOverride(
  playback: Partial<UiPlaybackState> | undefined,
): Partial<AnalysisTimingOverrideConditions> {
  if (!playback) return {};
  const result: Partial<AnalysisTimingOverrideConditions> = {};
  for (const key of TIMING_OVERRIDE_KEYS) {
    const value = playback[key];
    if (value !== undefined) Object.assign(result, { [key]: structuredClone(value) });
  }
  return result;
}

function timingOverrides(
  perLayout: Readonly<Record<string, UiStateLayoutConditions>>,
): Record<string, Partial<AnalysisTimingOverrideConditions>> {
  return Object.fromEntries(Object.entries(perLayout).flatMap(([layoutId, override]) => {
    const timing = timingOverride(override.playback);
    return Object.keys(timing).length === 0 ? [] : [[layoutId, timing]];
  }));
}

/**
 * Convert persisted Analyzer slices into the new AnalysisSession ownership model.
 *
 * This is deliberately one-way: Analyzer Next never reconstructs UiStateV1 and does not use
 * AnalyzerUiStateOwner. UI-only playback fields are discarded while model timing fields are
 * moved into the Session timing slice.
 */
export function analysisSessionSeedFromAppState(appState: AppStateV2): AnalysisSessionSeed {
  const fallback = defaultSlices();
  const analyzer = appState.analyzer ?? (() => {
    const { playback: _playback, ...rest } = fallback.ui;
    return rest;
  })();
  const conditions = appState.conditions ?? fallback.conditions;
  const playback = appState.playback ?? fallback.ui.playback;
  const mode = analyzer.input.mode;
  const selectedLayoutIds = [...analyzer.layouts.selectedByMode[mode]];
  const focusLayoutId = analyzer.layouts.detailByMode[mode];
  const sampleId = analyzer.input.selectedSampleByMode[mode];
  const text = analyzer.input.customText ?? analyzerSampleText(mode, sampleId);

  const {
    playbackRateAverage,
    playbackRateWindow,
    playbackRateHalfLifeSeconds,
    ...distanceDefaults
  } = conditions.defaults;

  return {
    mode,
    text,
    selectedLayoutIds,
    ...(focusLayoutId === undefined ? {} : { focusLayoutId }),
    distance: {
      defaults: structuredClone(distanceDefaults),
      perLayout: distanceOverrides(conditions.perLayout),
    },
    timing: {
      defaults: {
        playbackRateAverage,
        playbackRateWindow,
        playbackRateHalfLifeSeconds,
        stepsPerSecond: playback.stepsPerSecond,
        speedMultiplier: playback.speedMultiplier,
        sameFingerDelay: playback.sameFingerDelay,
        allFingerMovementDelay: playback.allFingerMovementDelay,
        useCalibration: playback.useCalibration,
      },
      perLayout: timingOverrides(conditions.perLayout),
    },
  };
}
