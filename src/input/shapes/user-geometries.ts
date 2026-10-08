import type { CodecDiagnostic, DecodedWithDiagnostics } from '../codec/index.ts';
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


/**
 * 保存された自作の物理配列の一覧を読む。値があって配列でない時（nullを含む）と、
 * 壊れた要素を捨てる時は診断を積む。`undefined`（保存が無い）は空で正しいので診断しない。
 */
export function decodeUserGeometryShapes(value: unknown): DecodedWithDiagnostics<PhysicalShape[]> {
  if (!Array.isArray(value)) {
    const diagnostics = value === undefined
      ? []
      : [{ path: '', message: '配列形式でないため自作の物理配列を捨てました' }];
    return { value: [], diagnostics };
  }
  const diagnostics: CodecDiagnostic[] = [];
  const shapes: PhysicalShape[] = [];
  value.forEach((candidate, index) => {
    if (!isStoredShape(candidate)) {
      diagnostics.push({ path: `[${index}]`, message: '形式が不正なため自作の物理配列を捨てました' });
      return;
    }
    shapes.push(sanitizePhysicalShape(candidate, storageFallback));
  });
  return { value: shapes, diagnostics };
}

export type { PhysicalShape } from './geometry.ts';

export const newId = (): string =>
  `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
