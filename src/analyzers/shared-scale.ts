/**
 * ペインどうしで揃える目盛りの範囲（docs/architecture.md「ペインどうしで揃える目盛り」）。
 *
 * 範囲は最小と最大を持つ（隣り合う指の間隔の平均は負になりうる）。同じキー
 * （Analyzerと見る量）のペインが報告した範囲を集め、全部を含む範囲を返す。
 * Reactを知らないので、Workspaceの器が購読の仕組みを結ぶ側（`shared-scale.tsx`）と分けてある。
 */
export interface ScaleRange {
  readonly min: number;
  readonly max: number;
}

/** 集めた範囲の全部を含む範囲。1つも無ければ`undefined`。 */
export function mergeScaleRanges(ranges: Iterable<ScaleRange>): ScaleRange | undefined {
  let merged: ScaleRange | undefined;
  for (const range of ranges) {
    merged = merged === undefined
      ? range
      : { min: Math.min(merged.min, range.min), max: Math.max(merged.max, range.max) };
  }
  return merged;
}

/** 値の並びを含む範囲。0は常に含める（棒グラフの底）。 */
export function scaleRangeWithZero(values: Iterable<number>): ScaleRange {
  let min = 0;
  let max = 0;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}

/** 範囲を報告するペインの集まり。同じキーの範囲を持ち主（ペイン）ごとに覚え、全体の範囲を返す。 */
export interface ScaleRegistry {
  /** `owner`が`key`で出している範囲を置き換える。`undefined`でそのペインの範囲を外す。 */
  readonly report: (key: string, owner: string, range: ScaleRange | undefined) => void;
  /** `key`の全体の範囲。値が変わらない間は同じ参照を返す（購読側が不要に再描画しない）。 */
  readonly rangeOf: (key: string) => ScaleRange | undefined;
  readonly subscribe: (listener: () => void) => () => void;
}

export function createScaleRegistry(): ScaleRegistry {
  const reported = new Map<string, Map<string, ScaleRange>>();
  const merged = new Map<string, ScaleRange>();
  const listeners = new Set<() => void>();

  const same = (a: ScaleRange | undefined, b: ScaleRange | undefined): boolean =>
    a === b || (a !== undefined && b !== undefined && a.min === b.min && a.max === b.max);

  return {
    report(key, owner, range) {
      let owners = reported.get(key);
      if (range === undefined) {
        if (owners?.delete(owner) !== true) return;
      } else {
        if (owners === undefined) {
          owners = new Map();
          reported.set(key, owners);
        }
        if (same(owners.get(owner), range)) return;
        owners.set(owner, range);
      }
      const before = merged.get(key);
      const after = mergeScaleRanges(owners.values());
      if (same(before, after)) return;
      if (after === undefined) merged.delete(key);
      else merged.set(key, after);
      if (owners.size === 0) reported.delete(key);
      for (const listener of [...listeners]) listener();
    },
    rangeOf: (key) => merged.get(key),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
