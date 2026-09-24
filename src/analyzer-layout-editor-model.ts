export interface AnalyzerLayoutEditorRule {
  id: string;
  name: string;
}

export interface AnalyzerLayoutEditorSnapshot {
  romajiRules: readonly AnalyzerLayoutEditorRule[];
}

export interface AnalyzerLayoutEditorModel {
  getSnapshot(): AnalyzerLayoutEditorSnapshot;
  subscribe(listener: () => void): () => void;
  setRomajiRules(rules: readonly AnalyzerLayoutEditorRule[]): void;
}

export function createAnalyzerLayoutEditorModel(
  initialRules: readonly AnalyzerLayoutEditorRule[],
): AnalyzerLayoutEditorModel {
  let snapshot: AnalyzerLayoutEditorSnapshot = { romajiRules: [...initialRules] };
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setRomajiRules(rules) {
      if (
        snapshot.romajiRules.length === rules.length
        && snapshot.romajiRules.every((rule, index) =>
          rule.id === rules[index]?.id && rule.name === rules[index]?.name)
      ) return;
      snapshot = { romajiRules: [...rules] };
      for (const listener of listeners) listener();
    },
  };
}
