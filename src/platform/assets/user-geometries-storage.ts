import type { CodecDiagnostic, DecodedWithDiagnostics } from '#input/codec/index.ts';
import {
  decodeUserGeometryShapes,
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

/**
 * 保存を読み、捨てたものの診断も返す。保存が無い時は診断なしの空、
 * JSONとして読めない時は空と診断（壊れたまま次の保存で上書きされることを示すため）。
 */
export function loadWithDiagnostics(storage = storageOrUndefined()): DecodedWithDiagnostics<PhysicalShape[]> {
  if (!storage) return { value: [], diagnostics: [] };
  try {
    const raw = storage.getItem(USER_GEOMETRIES_STORAGE_KEY);
    return decodeUserGeometryShapes(raw === null ? undefined : JSON.parse(raw));
  } catch {
    const diagnostics: CodecDiagnostic[] = [{ path: '', message: '読み取れないため自作の物理配列を捨てました' }];
    return { value: [], diagnostics };
  }
}

export function load(storage = storageOrUndefined()): PhysicalShape[] {
  return loadWithDiagnostics(storage).value;
}

export function save(shapes: readonly PhysicalShape[], storage = storageOrUndefined()): void {
  if (!storage) return;
  try {
    storage.setItem(USER_GEOMETRIES_STORAGE_KEY, JSON.stringify(shapes));
  } catch {
    // 保存できなくても、その場の編集と評価は成立する。
  }
}
