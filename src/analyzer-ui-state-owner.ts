import {
  loadUiState,
  saveUiState,
  type UiStateChoices,
  type UiStateLoadResult,
  type UiStateStorage,
  type UiStateV1,
} from './ui-state.ts';

export interface AnalyzerUiStateOwner {
  readonly loadResult: UiStateLoadResult;
  getSnapshot(): UiStateV1;
  subscribe(listener: () => void): () => void;
  update(change: (draft: UiStateV1) => void, debounce?: boolean): void;
  flush(): void;
  dispose(): void;
}

/**
 * Legacy Analyzer専用のstate ownership境界。
 *
 * UiStateV1のschema/migration/storageはui-state.tsに残し、
 * runtime ownershipとwriter schedulingだけをmain.tsから分離する。
 * Phase 7のReact shellも同じownerを利用できるようにするための移行用境界であり、
 * 汎用state managerとしては扱わない。
 */
export function createAnalyzerUiStateOwner(
  storage: UiStateStorage | undefined,
  defaults: UiStateV1,
  choices: UiStateChoices,
  saveDelayMs = 300,
): AnalyzerUiStateOwner {
  const loadResult = loadUiState(storage, defaults, choices);
  let state = loadResult.state;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  const flush = () => {
    if (saveTimer !== undefined) clearTimeout(saveTimer);
    saveTimer = undefined;
    saveUiState(storage, state);
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
