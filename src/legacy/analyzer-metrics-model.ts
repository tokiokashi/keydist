import type { Result } from './results-view.ts';

export interface AnalyzerMetricsSnapshot {
  results: readonly Result[];
  text: string;
  textMeta: string;
  errors: readonly string[];
  detailLayoutId?: string;
  revision: number;
}

export interface AnalyzerMetricsModel {
  getSnapshot(): AnalyzerMetricsSnapshot;
  subscribe(listener: () => void): () => void;
  setResults(input: Omit<AnalyzerMetricsSnapshot, 'revision'>): void;
  clear(textMeta: string): void;
}

export function createAnalyzerMetricsModel(): AnalyzerMetricsModel {
  let snapshot: AnalyzerMetricsSnapshot = {
    results: [],
    text: '',
    textMeta: '',
    errors: [],
    revision: 0,
  };
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setResults(input) {
      snapshot = {
        ...input,
        results: [...input.results],
        errors: [...input.errors],
        revision: snapshot.revision + 1,
      };
      emit();
    },
    clear(textMeta) {
      snapshot = {
        results: [],
        text: '',
        textMeta,
        errors: [],
        revision: snapshot.revision + 1,
      };
      emit();
    },
  };
}
