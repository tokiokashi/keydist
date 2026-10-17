import type { ComparisonColumnId } from './column-text.ts';

/**
 * 比較表の数値セルに敷くバーの長さ。バーは値の大きさだけを表し、良し悪しや順位は表さない。
 *
 * 長さの決め方は列ごとに2種類。
 * - `zero`: 0を起点にする。長さは「その列の値 ÷ その列の最大値」。値が0以上で、0が「量が無い」を意味する列。
 *   割合・率の列も100%ではなく列の最大値を全幅にする（値が数%の列でバーが見えなくなるのを避けるため）。
 * - `relative`: 列の最小値を0、最大値を全幅にする。負の値を取りうる列のように、0に意味が無い列だけが使う。
 *   微小な差も全幅の差に見えるので、セルのtooltipで相対の長さであることを示す。
 */
export type ComparisonBarScale = 'zero' | 'relative';

export const COMPARISON_BAR_SCALE: Readonly<Record<ComparisonColumnId, ComparisonBarScale>> = {
  // 個数・回数・文字あたりの量。0は「無い」。
  actions: 'zero',
  totalUnits: 'zero',
  meanPerStroke: 'zero',
  perCharUnits: 'zero',
  perCharSteps: 'zero',
  perCharPresses: 'zero',
  // 割合（%）と回数。0は「該当が無い」。
  singleTapLayerRate: 'zero',
  singleTapRate: 'zero',
  singleKeyRate: 'zero',
  sameFinger: 'zero',
  sameFingerRate: 'zero',
  // ホームの間隔との差の平均。ホームより近いと負になるので、0を起点にできない。
  adjacentMean: 'relative',
  // 標準偏差。0はばらつきが無い。
  adjacentStdDev: 'zero',
  // 右手の割合（%）。0%は右手を使っていない。
  rightHandDistanceShare: 'zero',
  rightHandPressShare: 'zero',
};

/** 相対の長さのバーを持つセルのtooltip。 */
export const COMPARISON_RELATIVE_BAR_NOTE = 'バーは、この列の最小の値を0、最大の値を全幅とした相対の長さです。';

/** 列の値の範囲。数でない値（非有限）は含めない。 */
export interface ComparisonBarRange {
  readonly scale: ComparisonBarScale;
  readonly min: number;
  readonly max: number;
}

/** 列の値（数でないものは除く）から範囲を作る。数の値が1つも無ければ`undefined`。 */
export function comparisonBarRange(
  scale: ComparisonBarScale,
  values: readonly number[],
): ComparisonBarRange | undefined {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return min > max ? undefined : { scale, min, max };
}

/**
 * 値のバーの長さ（0〜1）。バーを出さない時は`undefined`
 * （値が数でない・範囲が無い・0起点で最大が0・相対で全行が同じ値）。
 */
export function comparisonBarFraction(value: number, range: ComparisonBarRange | undefined): number | undefined {
  if (range === undefined || !Number.isFinite(value)) return undefined;
  if (range.scale === 'zero') {
    if (!(range.max > 0)) return undefined;
    return Math.min(1, Math.max(0, value / range.max));
  }
  if (range.max === range.min) return undefined;
  return (value - range.min) / (range.max - range.min);
}
