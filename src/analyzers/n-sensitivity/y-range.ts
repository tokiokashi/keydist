/**
 * N感度の縦軸の範囲の決め方。
 *
 * 見せ方で読まれ方が変わる（範囲を詰めるほど、配列間の差が大きく見える）。このツールは優劣を
 * 裁定しない（spec/distance-model.md §12.3）ので、既定は0から始めるfullにする。
 * 利用者が解析設定で選ぶ（既定はfull）。決め方はここに閉じ込める。
 *
 * - full: 0から始める。相対は0〜100%。実測は0〜最大値。
 * - fit: 値のある範囲に合わせる。データの最小値より少し下（幅の5%）を下限にし、区切りのよい値へ丸める
 * - coarse: 相対は0〜100%を4等分した区切り、実測はきりのよい刻みの区切りのうち、
 *   データの最小値を含む一番高い区切りを下限にする。
 *   fitより下限が粗く、軸が0から始まらないことが目盛りから読み取りやすい
 *
 * 上限は、相対ではN=0が必ず100%（=最大）なので、どの決め方でも100%。実測では最大値
（fit・coarseは、目盛りがきりのよい値になるよう上へ丸める）。
 * 「0を含めて上だけ詰める」は、相対では上限が最初から最大なので詰める余地が無く、fullと同じになる。
 */
export type YRangeMode = 'full' | 'fit' | 'coarse';

export interface YRange {
  readonly lo: number;
  readonly hi: number;
  readonly ticks: readonly number[];
}

/** 目盛りの本数（区間の数）。0から始める従来の見た目（0,20,…,100%）を保つ値。 */
const FULL_TICK_INTERVALS = 5;
/** 詰める時の目盛りの目安の区間数。 */
const FIT_TICK_INTERVALS = 4;
/** fitで、データの最小値より下に空ける余白（値の幅に対する割合）。 */
const FIT_PADDING = 0.05;

/** 区間数の目安に合う、1・2・5×10^kの目盛り幅。 */
function niceStep(span: number, intervals: number): number {
  const raw = span / intervals;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

function ticksBetween(lo: number, hi: number, step: number): number[] {
  const count = Math.round((hi - lo) / step);
  // 0.1刻みなどで足し算の誤差が目盛りの値に残らないよう、桁を丸める
  return Array.from({ length: count + 1 }, (_, i) => Number((lo + step * i).toFixed(9)));
}

/** 目盛りの値をすべて正確に表せる最小の小数桁数（0〜4）。刻みが1未満でも目盛りが重複して並ばない。 */
function decimalsFor(ticks: readonly number[]): number {
  for (let digits = 0; digits < 4; digits += 1) {
    if (ticks.every((tick) => Math.abs(tick - Number(tick.toFixed(digits))) < 1e-6)) return digits;
  }
  return 4;
}

/** 縦軸の目盛りの文字。相対は%、実測は[u]。実測値は大きさが一定でないので、整数で丸める。 */
export function formatYTicks(relative: boolean, ticks: readonly number[]): string[] {
  const digits = relative ? decimalsFor(ticks) : 0;
  return ticks.map((tick) => (relative ? `${tick.toFixed(digits)}%` : `${tick.toFixed(0)} u`));
}

/**
 * `values`は描く全点のy（相対なら%、実測なら[u]）。空なら0〜1を返す。
 * `relative`は上限を100に固定する（N=0が100%で、Nを増やしても距離は増えないため）。
 */
export function computeYRange(mode: YRangeMode, relative: boolean, values: readonly number[]): YRange {
  const dataMax = values.length > 0 ? Math.max(...values) : 1;
  const dataMin = values.length > 0 ? Math.min(...values) : 0;
  const hi = relative ? 100 : Math.max(1, dataMax);

  if (mode === 'full' || dataMin >= hi) {
    return { lo: 0, hi, ticks: Array.from({ length: FULL_TICK_INTERVALS + 1 }, (_, i) => (hi / FULL_TICK_INTERVALS) * i) };
  }

  if (mode === 'coarse') {
    // 相対は0〜100%の4等分（25%刻み）。実測の最大値は区切りが悪いので、きりのよい刻みで上へ丸める
    const quarter = relative ? hi / 4 : niceStep(hi, 4);
    const top = relative ? hi : Math.ceil(hi / quarter) * quarter;
    const lo = Math.min(Math.round(top / quarter) - 1, Math.floor(dataMin / quarter)) * quarter;
    return { lo, hi: top, ticks: ticksBetween(lo, top, quarter) };
  }

  // fit: 下限は最小値の少し下を、目盛り幅の倍数へ切り下げる。上限は最大値（相対は100）のまま。
  const padded = Math.max(0, dataMin - (hi - dataMin) * FIT_PADDING);
  const step = niceStep(hi - padded, FIT_TICK_INTERVALS);
  const lo = Math.floor(padded / step) * step;
  // 相対の上限は100%のまま（100%を超える目盛りは作らない）。
  const top = relative ? hi : Math.ceil(hi / step) * step;
  return { lo, hi: top, ticks: ticksBetween(lo, top, step) };
}
