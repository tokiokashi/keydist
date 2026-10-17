import { N_SENSITIVITY_METRICS, withUnit, type NSensitivityAxisKind, type NSensitivityMetricId } from './metric-catalog.ts';

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
 * 上限は、N=0を100%とする比（ratio）ではN=0が必ず100%（=最大）なので、どの決め方でも100%。実測（value）では
 * 最大値（fit・coarseは、目盛りがきりのよい値になるよう上へ丸める）。
 * 「0を含めて上だけ詰める」は、比では上限が最初から最大なので詰める余地が無く、fullと同じになる。
 *
 * N=0との差[pt]（delta）は負にもなり、N=0の点が必ず0なので範囲はいつも0を含む。そのため「0から」と
 * 「値の範囲」でデータの範囲は変わらず、違いは余白と目盛りの粗さになる（`computeDeltaRange`）。
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
/** 差[pt]を粗い区切りにする時の目盛りの目安の区間数。 */
const COARSE_TICK_INTERVALS = 2;
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

/**
 * 縦軸の目盛りの文字。比は%、差はpt、実測は指標の単位。比と差は刻みで桁が決まり、
 * 実測は大きさが指標ごとに違うので、指標ごとに決めた桁で丸める。
 */
export function formatYTicks(kind: NSensitivityAxisKind, ticks: readonly number[], metric: NSensitivityMetricId): string[] {
  if (kind === 'ratio') {
    const digits = decimalsFor(ticks);
    return ticks.map((tick) => `${tick.toFixed(digits)}%`);
  }
  if (kind === 'delta') {
    const digits = decimalsFor(ticks);
    return ticks.map((tick) => `${tick.toFixed(digits)} pt`);
  }
  const def = N_SENSITIVITY_METRICS[metric];
  return ticks.map((tick) => withUnit(tick.toFixed(def.tickDigits), def.unit));
}

/** 差[pt]の範囲。N=0の点が0なので、データの範囲はいつも0を含む。 */
function computeDeltaRange(mode: YRangeMode, values: readonly number[]): YRange {
  const dataMin = Math.min(0, ...values);
  const dataMax = Math.max(0, ...values);
  // 差がすべて0の時は、目盛りが作れるよう1ptの幅を取る
  const span = dataMax - dataMin || 1;
  const pad = mode === 'fit' ? span * FIT_PADDING : 0;
  const intervals = mode === 'full' ? FULL_TICK_INTERVALS : mode === 'fit' ? FIT_TICK_INTERVALS : COARSE_TICK_INTERVALS;
  const step = niceStep(span + pad * 2, intervals);
  const lo = Math.floor((dataMin - pad) / step) * step;
  const hi = Math.max(Math.ceil((dataMax + pad) / step) * step, lo + step);
  return { lo, hi, ticks: ticksBetween(lo, hi, step) };
}

/**
 * `values`は描く全点のy（比なら%、差ならpt、実測なら指標の単位）。空なら0〜1を返す。
 * `ratio`は上限を100に固定する（N=0が100%で、Nを増やしても距離は増えないため）。
 */
export function computeYRange(mode: YRangeMode, kind: NSensitivityAxisKind, values: readonly number[]): YRange {
  if (kind === 'delta') return computeDeltaRange(mode, values);
  const relative = kind === 'ratio';
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

/**
 * ペインどうしで縦軸を揃える時に報告する範囲（描く値の最小と最大）。値が1つも無ければ`undefined`。
 * 揃えた範囲は`computeYRange`へ値の並びとして渡す（最小と最大だけが目盛りを決める）。
 */
export function yValuesRange(values: readonly number[]): { readonly min: number; readonly max: number } | undefined {
  if (values.length === 0) return undefined;
  let min = values[0]!;
  let max = min;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}
