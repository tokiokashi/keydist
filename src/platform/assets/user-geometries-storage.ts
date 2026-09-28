import {
  sanitizeUserGeometryShapes,
  type PhysicalShape,
} from '#input/shapes/user-geometries.ts';

export const USER_GEOMETRIES_STORAGE_KEY = 'keydist:geometry-shapes';

export interface GeometryShapeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storageOrUndefined(): GeometryShapeStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function load(storage = storageOrUndefined()): PhysicalShape[] {
  if (!storage) return [];
  try {
    return sanitizeUserGeometryShapes(
      JSON.parse(storage.getItem(USER_GEOMETRIES_STORAGE_KEY) ?? '[]'),
    );
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
