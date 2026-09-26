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
  const halfSize = polarBaseRadius + OUTER_MARGIN;

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
