export type MovementScaleMode = 'fit' | 'fixed';

export interface MovementPlotScale {
  readonly scaleMax: number;
  readonly unitsPerSvgUnit: number;
  readonly plotRadius: number;
  readonly polarBaseRadius: number;
  readonly polarAmplitude: number;
  readonly halfSize: number;
  readonly viewSize: number;
}

const FIT_PLOT_RADIUS = 82;
const FIXED_SVG_UNITS_PER_U = 24;
const POLAR_GAP = 9;
/**
 * 固定スケールの円（角度と確率の円）の半径。データの最長ベクトルに依らない定数にして、
 * 物理配列・配列・テキスト・指の絞り込みを変えても円の大きさが動かないようにする。
 * 組み込みの物理配列・配列・サンプル（492条件）で最長ベクトルは3〜6u、5u以下が約8割。
 * 5uまでが円の内側に収まる大きさにした（6uは円と重なる。重なってよい）。
 */
const FIXED_POLAR_SCALE_MAX = 5;
const FIXED_POLAR_BASE_RADIUS = FIXED_POLAR_SCALE_MAX * FIXED_SVG_UNITS_PER_U + POLAR_GAP;
const POLAR_AMPLITUDE = 16;
export const MIN_POLAR_BANDWIDTH_DEGREES = 4;
export const MAX_POLAR_DISPLAY_GAIN = 3;
const OUTER_MARGIN = 13;

export function movementPlotScale(
  maxDistance: number,
  mode: MovementScaleMode,
): MovementPlotScale {
  const scaleMax = Math.max(1, Math.ceil(maxDistance));
  const unitsPerSvgUnit = mode === 'fit'
    ? FIT_PLOT_RADIUS / scaleMax
    : FIXED_SVG_UNITS_PER_U;
  const plotRadius = scaleMax * unitsPerSvgUnit;
  const polarBaseRadius = mode === 'fit' ? plotRadius + POLAR_GAP : FIXED_POLAR_BASE_RADIUS;
  const polarAmplitude = POLAR_AMPLITUDE;
  // 固定では円より長いベクトルが出うるので、最長ベクトルの先端もviewBoxに含める
  // （円の半径だけを定数にし、描画領域はデータに追従させる）。fitではplotRadius+GAP=円なので従来と同じ。
  const halfSize = Math.max(polarBaseRadius, plotRadius + POLAR_GAP) + OUTER_MARGIN;

  return {
    scaleMax,
    unitsPerSvgUnit,
    plotRadius,
    polarBaseRadius,
    polarAmplitude,
    halfSize,
    viewSize: halfSize * 2,
  };
}


/**
 * KDE densityとdisplay gainから必要なpolar外周extentを計算する。
 * density自体は変更せず、canvas/viewBoxの確保量だけを増やす。
 */
export function movementPlotExtent(
  scale: MovementPlotScale,
  maxDensity: number,
  displayGain: number,
): number {
  const polarRadius = scale.polarBaseRadius
    + Math.max(0, maxDensity) * scale.polarAmplitude * Math.max(0, displayGain);
  return Math.max(scale.halfSize, polarRadius + OUTER_MARGIN);
}
