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
const POLAR_AMPLITUDE = 16;
export const MIN_POLAR_BANDWIDTH_DEGREES = 4;
export const MAX_POLAR_DISPLAY_GAIN = 3;
/**
 * UI最小HWHM (4°) の単峰von Mises KDEが取る理論peak [rad^-1]。
 * density自体は正規化確率密度のまま保持し、描画時だけこの固定基準で0..1相当に写像する。
 */
export const MAX_POLAR_DISPLAY_DENSITY = 6.726629634118925;
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
  const polarBaseRadius = plotRadius + POLAR_GAP;
  const polarAmplitude = POLAR_AMPLITUDE;
  const halfSize = polarBaseRadius
    + polarAmplitude * MAX_POLAR_DISPLAY_GAIN
    + OUTER_MARGIN;

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


/** 正規化density [rad^-1] を、手やdatasetに依存しない固定display scaleへ写像する。 */
export function polarDisplayDensity(density: number): number {
  return Math.max(0, density) / MAX_POLAR_DISPLAY_DENSITY;
}

export function polarDisplayRadius(
  baseRadius: number,
  amplitude: number,
  density: number,
  gain: number,
): number {
  return baseRadius
    + polarDisplayDensity(density) * amplitude * Math.max(0, gain);
}
