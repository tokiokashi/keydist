export interface AnalyzerComparisonOption {
  value: string;
  label: string;
}

export interface AnalyzerComparisonSnapshot {
  baselineOptions: readonly AnalyzerComparisonOption[];
  chartMetricOptions: readonly AnalyzerComparisonOption[];
}

export interface AnalyzerComparisonModel {
  getSnapshot(): AnalyzerComparisonSnapshot;
  subscribe(listener: () => void): () => void;
  setOptions(
    baselineOptions: readonly AnalyzerComparisonOption[],
    chartMetricOptions: readonly AnalyzerComparisonOption[],
  ): void;
}

function sameOptions(
  a: readonly AnalyzerComparisonOption[],
  b: readonly AnalyzerComparisonOption[],
): boolean {
  return a.length === b.length
    && a.every((option, index) => (
      option.value === b[index]?.value && option.label === b[index]?.label
    ));
}

/**
 * ResultsView が算出した一時的な select option を React control へ渡すための bridge。
 * durable state は持たず、永続化 authority は AnalyzerUiStateOwner / AppState のまま。
 */
export function createAnalyzerComparisonModel(): AnalyzerComparisonModel {
  let snapshot: AnalyzerComparisonSnapshot = {
    baselineOptions: [{ value: '', label: '比較なし' }],
    chartMetricOptions: [],
  };
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setOptions(baselineOptions, chartMetricOptions) {
      if (
        sameOptions(snapshot.baselineOptions, baselineOptions)
        && sameOptions(snapshot.chartMetricOptions, chartMetricOptions)
      ) {
        return;
      }
      snapshot = {
        baselineOptions: [...baselineOptions],
        chartMetricOptions: [...chartMetricOptions],
      };
      for (const listener of listeners) listener();
    },
  };
}
