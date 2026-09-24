export interface AnalyzerPlaybackSettingsSnapshot {
  html: string;
  revision: number;
}

export interface AnalyzerPlaybackSettingsModel {
  getSnapshot(): AnalyzerPlaybackSettingsSnapshot;
  subscribe(listener: () => void): () => void;
  setHtml(html: string): void;
  clear(): void;
}

export function createAnalyzerPlaybackSettingsModel(): AnalyzerPlaybackSettingsModel {
  let snapshot: AnalyzerPlaybackSettingsSnapshot = { html: '', revision: 0 };
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
