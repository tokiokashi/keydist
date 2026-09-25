import {
  analyzerSlicesFromUiState,
  uiStateFromAppState,
} from './app-state.ts';
import { loadAppearancePreference } from './appearance.ts';
import {
  loadAppStateDocument,
  patchAppState,
  removeStorageKeys,
} from './persistence/app-state-storage.ts';
import {
  LEGACY_SELECTION_KEY,
  LEGACY_TEXT_COLLAPSED_KEY,
  LEGACY_THEME_KEY,
  loadUiState,
  sanitizeUiState,
  UI_STATE_STORAGE_KEY,
  type UiStateChoices,
  type UiStateLoadResult,
  type UiStateStorage,
  type UiStateV1,
} from './ui-state.ts';

const ANALYZER_LEGACY_STORAGE_KEYS = [
  UI_STATE_STORAGE_KEY,
  LEGACY_THEME_KEY,
  LEGACY_SELECTION_KEY,
  LEGACY_TEXT_COLLAPSED_KEY,
] as const;

export interface AnalyzerUiStateOwner {
  readonly loadResult: UiStateLoadResult;
  getSnapshot(): UiStateV1;
  subscribe(listener: () => void): () => void;
  update(change: (draft: UiStateV1) => void, debounce?: boolean): void;
  flush(): void;
  dispose(): void;
}

function loadAnalyzerState(
  storage: UiStateStorage | undefined,
  defaults: UiStateV1,
  choices: UiStateChoices,
): UiStateLoadResult {
  if (!storage) {
    return {
      state: structuredClone(defaults),
      migratedLegacy: false,
      migratedArpeggioModel: false,
    };
  }

  loadAppearancePreference(storage, defaults.ui.theme);
  const appState = loadAppStateDocument(storage);
  const hasAllSlices = appState.analyzer !== undefined
    && appState.conditions !== undefined
    && appState.playback !== undefined;

  // AppStateが未完成ならUiStateV1系を一度だけmigration sourceとして読む。
  // loadUiState内の旧々形式migrationが一時的にkeydist:ui-stateへ書いても、
  // AppState保存成功後に下で必ずcleanupする。
  const source = hasAllSlices
    ? {
        state: structuredClone(defaults),
        migratedLegacy: false,
        migratedArpeggioModel: false,
      }
    : loadUiState(storage, defaults, choices);

  const state = sanitizeUiState(
    uiStateFromAppState(appState, source.state),
    defaults,
    choices,
  );

  if (patchAppState(storage, analyzerSlicesFromUiState(state))) {
    removeStorageKeys(storage, ANALYZER_LEGACY_STORAGE_KEYS);
  }

  return {
    state,
    migratedLegacy: hasAllSlices ? false : source.migratedLegacy,
    migratedArpeggioModel: hasAllSlices ? false : source.migratedArpeggioModel,
  };
}

function saveAnalyzerState(
  storage: UiStateStorage | undefined,
  state: UiStateV1,
): boolean {
  if (!storage) return false;
  return patchAppState(storage, analyzerSlicesFromUiState(state));
}

/**
 * Analyzerのruntime compatibility owner。
 *
 * runtimeではPhase 9までUiStateV1を維持するが、永続化authorityはAppStateV2だけ。
 * keydist:ui-stateとそれ以前のキーはload時の一方向migration sourceとしてのみ扱う。
 */
export function createAnalyzerUiStateOwner(
  storage: UiStateStorage | undefined,
  defaults: UiStateV1,
  choices: UiStateChoices,
  saveDelayMs = 300,
): AnalyzerUiStateOwner {
  const loadResult = loadAnalyzerState(storage, defaults, choices);
  let state = loadResult.state;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  const flush = () => {
    if (saveTimer !== undefined) clearTimeout(saveTimer);
    saveTimer = undefined;
    saveAnalyzerState(storage, state);
  };

  return {
    loadResult,
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(change, debounce = false) {
      const next = structuredClone(state);
      change(next);
      state = next;
      for (const listener of listeners) listener();

      if (saveTimer !== undefined) clearTimeout(saveTimer);
      if (debounce) {
        saveTimer = setTimeout(flush, saveDelayMs);
      } else {
        flush();
      }
    },
    flush,
    dispose() {
      flush();
      listeners.clear();
    },
  };
}
