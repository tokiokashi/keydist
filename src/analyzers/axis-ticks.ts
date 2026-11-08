/**
 * 軸の目盛りの値と書式（画面に依存しない純粋な関数）。散布図と箱ひげ図が共有する。
 */

export interface TickRange {
  readonly lo: number;
  readonly hi: number;
}

/** 範囲の中の、切りのよい（1・2・5の10の冪乗倍）値。おおよそ`target`本。 */
export function niceTicks(range: TickRange, target: number): { readonly values: readonly number[]; readonly step: number } {
  const span = range.hi - range.lo;
  if (!(span > 0) || !Number.isFinite(span)) return { values: [], step: 1 };
  const rough = span / Math.max(1, target);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const { first, last } = multiplesIn(range, step);
  const values: number[] = [];
  for (let i = first; i <= last; i++) values.push(multiple(i, step));
  return { values, step };
}

/** `step`の整数倍のうち、範囲に入るものの添字の最小と最大。 */
export function multiplesIn(range: TickRange, step: number): { readonly first: number; readonly last: number } {
  return { first: Math.ceil(range.lo / step - 1e-9), last: Math.floor(range.hi / step + 1e-9) };
}

export function multiple(index: number, step: number): number {
  return Number((index * step).toPrecision(12));
}

/** 目盛りの刻み`step`が見分けられる小数の桁数。 */
function decimalsOf(step: number): number {
  return step >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(step) - 1e-9));
}

export function formatTickValue(value: number, step: number): string {
  return value.toFixed(decimalsOf(step));
}
