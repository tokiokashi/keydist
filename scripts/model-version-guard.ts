// 数値が動いたのに MODEL_VERSION を上げずに記録を作り直すのを拒む判定。

export function stableStringify(value: unknown): string {
  // JSON.stringifyのkey順はオブジェクト生成順に依存するため、diffを安定させるために
  // key順をソートしてから書き出す（配列の順序は呼び出し側で決めている）。
  const sortKeys = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sortKeys);
    if (input !== null && typeof input === 'object') {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, val]) => [key, sortKeys(val)]),
      );
    }
    return input;
  };
  return JSON.stringify(sortKeys(value), null, 2);
}

export interface ComparableCase {
  id: string;
  metrics: unknown;
  analysis: unknown;
  nSensitivity?: unknown;
}

/** 同じidのケースのうち、数値（指標・解析・Nの感度）が前の記録と違うものを返す。追加・削除されたケースは数えない。 */
export function changedCaseIds(previous: { cases: readonly ComparableCase[] }, next: { cases: readonly ComparableCase[] }): string[] {
  const before = new Map(previous.cases.map((c) => [c.id, c]));
  const changed: string[] = [];
  for (const c of next.cases) {
    const old = before.get(c.id);
    if (old === undefined) continue;
    if (stableStringify([old.metrics, old.analysis, old.nSensitivity]) !== stableStringify([c.metrics, c.analysis, c.nSensitivity])) changed.push(c.id);
  }
  return changed;
}

/**
 * 数値が動いたのに `MODEL_VERSION` が前の記録と同じなら、エラーの文を返す。
 * 版を上げ忘れたまま記録を作り直すと、版が同じで数値が違う結果が並ぶ。
 */
export function modelVersionBumpError(
  previous: { modelVersion?: number; cases: readonly ComparableCase[] },
  next: { modelVersion: number; cases: readonly ComparableCase[] },
): string | null {
  if (previous.modelVersion !== next.modelVersion) return null;
  const changed = changedCaseIds(previous, next);
  if (changed.length === 0) return null;
  return `数値が変わったケースが${changed.length}件あるのに MODEL_VERSION（${next.modelVersion}）が前の記録と同じです。src/engine/model-version.ts の値を上げてから作り直してください。例: ${changed.slice(0, 3).join(', ')}`;
}
