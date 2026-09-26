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
const OUTER_MARGIN = 13;

export function movementPlotScale(
  maxDistance: number,
  mode: MovementScaleMode,
  polarGain = 1,
): MovementPlotScale {
  const scaleMax = Math.max(1, Math.ceil(maxDistance));
  const unitsPerSvgUnit = mode === 'fit'
    ? FIT_PLOT_RADIUS / scaleMax
    : FIXED_SVG_UNITS_PER_U;
  const plotRadius = scaleMax * unitsPerSvgUnit;
  const polarBaseRadius = plotRadius + POLAR_GAP;
  const polarAmplitude = POLAR_AMPLITUDE * Math.max(0, polarGain);
  const halfSize = polarBaseRadius + polarAmplitude + OUTER_MARGIN;

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
