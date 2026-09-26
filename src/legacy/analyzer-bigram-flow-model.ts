import type { Trace } from '#trace/generate.ts';
import type { Geometry } from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/types.ts';

export interface AnalyzerBigramFlowData {
  layout: Layout;
  trace: Trace;
  geometry: Geometry;
}

export interface AnalyzerBigramFlowSnapshot {
  data: AnalyzerBigramFlowData | null;
  revision: number;
}

export interface AnalyzerBigramFlowModel {
  getSnapshot(): AnalyzerBigramFlowSnapshot;
  subscribe(listener: () => void): () => void;
  setData(data: AnalyzerBigramFlowData): void;
  clear(): void;
}

/**
 * ResultsViewで確定済みのtrace / layout / geometryをReact可視化へ渡すephemeral bridge。
 * 評価・構造解析・永続化のauthorityは持たない。
 */
export function createAnalyzerBigramFlowModel(): AnalyzerBigramFlowModel {
  let snapshot: AnalyzerBigramFlowSnapshot = { data: null, revision: 0 };
  const listeners = new Set<() => void>();

  const publish = (data: AnalyzerBigramFlowData | null) => {
    snapshot = { data, revision: snapshot.revision + 1 };
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setData: publish,
    clear: () => publish(null),
  };
}
