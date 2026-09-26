import type { InputConverterPreferencesV2 } from './features/input-converter/input-converter-preferences.ts';
import type { UiPlaybackState, UiStateV1 } from './ui-state.ts';
import type { ThemeChoice } from './theme.ts';
import type { WorkspaceStateV1 } from './workspace/workspace-state.ts';
import type { AnalyzerWorkspaceStateV1 } from './features/analyzer-next/analyzer-workspace-state.ts';

export const APP_STATE_VERSION = 2;

export interface AppearancePreferencesV1 {
  theme: ThemeChoice;
}

export type AnalyzerPreferencesV2 = Omit<UiStateV1['ui'], 'playback'>;

export interface AppStateV2 {
  version: typeof APP_STATE_VERSION;
  workspace?: WorkspaceStateV1;
  analyzerWorkspace?: AnalyzerWorkspaceStateV1;
  inputConverter?: InputConverterPreferencesV2;
  appearance?: AppearancePreferencesV1;
  analyzer?: AnalyzerPreferencesV2;
  conditions?: UiStateV1['conditions'];
  playback?: UiPlaybackState;
}

export type AppStateSliceKey = Exclude<keyof AppStateV2, 'version'>;

export function analyzerSlicesFromUiState(state: UiStateV1): Pick<
  AppStateV2,
  'analyzer' | 'conditions' | 'playback'
> {
  const { playback, ...analyzer } = state.ui;
  return {
    analyzer: structuredClone(analyzer),
    conditions: structuredClone(state.conditions),
    playback: structuredClone(playback),
  };
}

export function uiStateFromAppState(
  appState: AppStateV2,
  fallback: UiStateV1,
): UiStateV1 {
  const state = structuredClone(fallback);
  if (appState.analyzer !== undefined) {
    state.ui = {
      ...state.ui,
      ...structuredClone(appState.analyzer),
      playback: state.ui.playback,
    };
  }
  if (appState.playback !== undefined) state.ui.playback = structuredClone(appState.playback);
  if (appState.conditions !== undefined) state.conditions = structuredClone(appState.conditions);
  return state;
}
