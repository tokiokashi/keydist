export type GeometryUnit = 'u' | 'mm';

export function toDisplayUnits(valueU: number, pitchMm: number, unit: GeometryUnit): number {
  return unit === 'mm' ? valueU * pitchMm : valueU;
}

export function fromDisplayUnits(value: number, pitchMm: number, unit: GeometryUnit): number {
  return unit === 'mm' ? value / pitchMm : value;
}
