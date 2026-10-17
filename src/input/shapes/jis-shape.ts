import {
  isPresetGeometryKind,
  keyId,
  presetGeometryKind,
  presetGeometryStandard,
  presetGeometryTopology,
  resolveKeyId,
  SHIFT_KEY,
  type PhysicalShape,
} from './geometry.ts';

/** JISの物理配列が要る配列に、基にする物理配列から当てる物理配列が無い時の物理配列。 */
export const FALLBACK_JIS_SHAPE_ID = 'jis-row-staggered';

/**
 * 物理配列が持つキーのid（通常のgrid・親指・grid外の追加キー・Shift）。
 * `buildGeometry` が作るキーと同じ集合になる。
 */
export function physicalShapeKeyIds(shape: PhysicalShape): ReadonlySet<string> {
  const keys = new Set<string>();
  shape.rowWidths.forEach((width, row) => {
    for (let col = 0; col < width; col++) keys.add(keyId(row, col));
  });
  for (const thumb of shape.thumbs) keys.add(resolveKeyId(thumb.id));
  for (const extra of shape.extraKeys ?? []) keys.add(resolveKeyId(extra.id));
  if (shape.rowWidths.length > 0) {
    keys.add(SHIFT_KEY.L);
    keys.add(SHIFT_KEY.R);
  }
  return keys;
}

/**
 * JISの物理配列が要る配列を、基にする物理配列（Workspace・全体の値などから決まるもの）と同じ形で測るための物理配列のid。
 *
 * - JISの組み込みの物理配列は、そのまま使う
 * - ANSIの組み込みの物理配列は、同じ形（ロウ・オーソリニア・分割・カラム）のJISの組み込みの物理配列にする
 * - 自作の物理配列は規格を持たない。配列が使うキー（`requiredKeys`）を全部持つならそのまま使い、持たないなら
 *   `FALLBACK_JIS_SHAPE_ID` にする
 */
export function jisShapeIdFor(base: PhysicalShape, requiredKeys: ReadonlySet<string>): string {
  if (isPresetGeometryKind(base.id)) {
    return presetGeometryStandard(base.id) === 'jis' ? base.id : presetGeometryKind('jis', presetGeometryTopology(base.id));
  }
  const keys = physicalShapeKeyIds(base);
  for (const key of requiredKeys) {
    if (!keys.has(key)) return FALLBACK_JIS_SHAPE_ID;
  }
  return base.id;
}
