import type { ModeId } from './layout-selection.ts';
import {
  createDefaultUiState,
  type UiStateChoices,
  type UiStateV1,
} from './ui-state.ts';

export const ANALYZER_INITIAL_LAYOUTS = {
  en: ['qwerty', 'dvorak', 'colemak', 'colemak-dh', 'workman', 'oonishi'],
  ja: ['qwerty', 'colemak-dh', 'oonishi', 'oonishi-custom-combo', 'naginata-v18'],
} as const satisfies Record<ModeId, readonly string[]>;

export const ANALYZER_SAMPLE_IDS = {
  en: ['default'],
  ja: ['modern', 'legacy'],
} as const satisfies Record<ModeId, readonly string[]>;

export interface AnalyzerUiStateBootstrapOptions {
  builtInLayoutIds: Record<ModeId, readonly string[]>;
  userLayoutIds: readonly string[];
  textPanelOpen: boolean;
  usePlaybackCalibration: boolean;
}

export interface AnalyzerUiStateBootstrap {
  defaults: UiStateV1;
  choices: UiStateChoices;
}

/**
 * AnalyzerのUiStateV1 loadに必要なdefaults/choicesを組み立てる。
 * DOMやstorageへ触れないため、legacy entrypointとReact shellの双方で共有する。
 */
export function createAnalyzerUiStateBootstrap(
  options: AnalyzerUiStateBootstrapOptions,
): AnalyzerUiStateBootstrap {
  const userLayoutIds = [...new Set(options.userLayoutIds)];
  return {
    defaults: createDefaultUiState({
      textPanelOpen: options.textPanelOpen,
      usePlaybackCalibration: options.usePlaybackCalibration,
      selectedLayouts: ANALYZER_INITIAL_LAYOUTS,
    }),
    choices: {
      layouts: {
        en: [...new Set([...options.builtInLayoutIds.en, ...userLayoutIds])],
        ja: [...new Set([...options.builtInLayoutIds.ja, ...userLayoutIds])],
      },
      samples: {
        en: [...ANALYZER_SAMPLE_IDS.en],
        ja: [...ANALYZER_SAMPLE_IDS.ja],
      },
    },
  };
}
