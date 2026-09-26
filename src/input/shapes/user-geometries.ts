import { PHYSICAL_SHAPES, type PhysicalShape } from './geometry.ts';
import { sanitizePhysicalShape } from './settings.ts';

const defaultShape = PHYSICAL_SHAPES['row-staggered'];
const storageFallback: PhysicalShape = {
  ...defaultShape,
  rowStagger: undefined,
  columnStagger: undefined,
  splitAt: undefined,
  splitGap: undefined,
  thumbHome: undefined,
  extraKeys: undefined,
};


function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStoredShape(value: unknown): value is PhysicalShape {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || !value.id.startsWith('shape-')
    || typeof value.name !== 'string'
    || !Array.isArray(value.rowWidths)
    || !Array.isArray(value.thumbs)) return false;
  return true;
}


export function sanitizeUserGeometryShapes(value: unknown): PhysicalShape[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isStoredShape)
    .map((shape) => sanitizePhysicalShape(shape, storageFallback));
}

export type { PhysicalShape } from './geometry.ts';

export const newId = (): string =>
  `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
