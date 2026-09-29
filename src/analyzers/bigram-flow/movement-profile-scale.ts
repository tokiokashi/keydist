export interface MovementPlotScale {
  readonly scaleMax: number;
  readonly unitsPerSvgUnit: number;
  readonly plotRadius: number;
  readonly polarBaseRadius: number;
  readonly polarAmplitude: number;
  readonly halfSize: number;
  readonly viewSize: number;
}

const SVG_UNITS_PER_U = 24;
const POLAR_GAP = 9;
const POLAR_AMPLITUDE = 16;
export const MIN_POLAR_BANDWIDTH_DEGREES = 4;
export const MAX_POLAR_DISPLAY_GAIN = 3;
const OUTER_MARGIN = 13;

/**
 * 角度と確率の円の半径。データの最長ベクトルに依らない定数にして、
 * 物理配列・配列・テキスト・指の絞り込みを変えても円の大きさが動かないようにする。
 * 組み込みの物理配列・配列・サンプル（492条件）で最長ベクトルは3〜6u、5u以下が約8割。
 * 5uまでが円の内側に収まる大きさにした（6uは円と重なる。重なってよい）。
 */
const POLAR_SCALE_MAX = 5;
const POLAR_BASE_RADIUS = POLAR_SCALE_MAX * SVG_UNITS_PER_U + POLAR_GAP;

/**
 * 図の大きさは、データ・表示倍率・密度のどれにもよらず一定にする（画面上の1uあたりのpx、円のpx）。
 * 円より長いベクトルや外へ伸びた方向分布は、図の枠で見切れてよい。縮めたり範囲を広げたりしない。
 * `maxDistance`は目盛りのリングの本数（最長ベクトルまで）と軸の長さだけに効く。
 */
export function movementPlotScale(maxDistance: number): MovementPlotScale {
  const scaleMax = Math.max(1, Math.ceil(maxDistance));
  const plotRadius = scaleMax * SVG_UNITS_PER_U;
  const halfSize = POLAR_BASE_RADIUS + OUTER_MARGIN;

  return {
    scaleMax,
    unitsPerSvgUnit: SVG_UNITS_PER_U,
    plotRadius,
    polarBaseRadius: POLAR_BASE_RADIUS,
    polarAmplitude: POLAR_AMPLITUDE,
    halfSize,
    viewSize: halfSize * 2,
  };
}
