export interface AnalyzerPlaybackSurfaceSnapshot {
  html: string;
  revision: number;
}

export interface AnalyzerPlaybackSurfaceModel {
  getSnapshot(): AnalyzerPlaybackSurfaceSnapshot;
  subscribe(listener: () => void): () => void;
  setHtml(html: string): void;
  clear(): void;
}

/**
 * Playback renderer が生成したpresentation markupをReact hostへ渡す一方向bridge。
 * 再生stateや永続stateのauthorityは持たない。
 */
export function createAnalyzerPlaybackSurfaceModel(): AnalyzerPlaybackSurfaceModel {
  let snapshot: AnalyzerPlaybackSurfaceSnapshot = { html: '', revision: 0 };
  const listeners = new Set<() => void>();

  const publish = (html: string) => {
    if (snapshot.html === html) return;
    snapshot = { html, revision: snapshot.revision + 1 };
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setHtml: publish,
    clear: () => publish(''),
  };
}
