export interface AnalyzerConditionsSurfaceSnapshot {
  content: DocumentFragment | null;
  revision: number;
  dialogScrollTop?: number;
  tableScroll?: { top: number; left: number };
}

export interface AnalyzerConditionsSurfaceModel {
  getSnapshot(): AnalyzerConditionsSurfaceSnapshot;
  subscribe(listener: () => void): () => void;
  setContent(
    content: DocumentFragment,
    restore?: {
      dialogScrollTop?: number;
      tableScroll?: { top: number; left: number };
    },
  ): void;
}

export function createAnalyzerConditionsSurfaceModel(): AnalyzerConditionsSurfaceModel {
  let snapshot: AnalyzerConditionsSurfaceSnapshot = {
    content: null,
    revision: 0,
  };
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setContent(content, restore = {}) {
      snapshot = {
        content,
        revision: snapshot.revision + 1,
        ...restore,
      };
      for (const listener of listeners) listener();
    },
  };
}
