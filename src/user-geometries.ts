import { PHYSICAL_SHAPES, type PhysicalShape } from './geometry.ts';
import { sanitizePhysicalShape } from './geometry-settings.ts';

export const USER_GEOMETRIES_STORAGE_KEY = 'keydist:geometry-shapes';

export interface GeometryShapeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

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

function storageOrUndefined(): GeometryShapeStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

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

export function load(storage = storageOrUndefined()): PhysicalShape[] {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(USER_GEOMETRIES_STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isStoredShape)
      .map((shape) => sanitizePhysicalShape(shape, storageFallback));
  } catch {
    return [];
  }
}

export function save(shapes: readonly PhysicalShape[], storage = storageOrUndefined()): void {
  if (!storage) return;
  try {
    storage.setItem(USER_GEOMETRIES_STORAGE_KEY, JSON.stringify(shapes));
  } catch {
    // 保存できなくても、その場の編集と評価は成立する。
  }
}

export const newId = (): string =>
  `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
