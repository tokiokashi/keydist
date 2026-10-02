import { isPresetGeometryKind, presetGeometryStandard } from './geometry.ts';

/**
 * 物理配列の選択欄の見出し。ANSI・JISは物理配列の規格（`presetGeometryStandard`）から引き、
 * 規格を持たない自作の物理配列は別の見出しにまとめる。
 * 物理配列の選択欄の中なので「配列」が論理配列と取り違えられにくい、というオーナーの判断で
 * 「配列」を付けた見出しにしている。
 */
export const SHAPE_GROUP_LABEL = {
  ansi: 'US配列（ANSI）',
  jis: 'JIS配列',
  user: '自作',
} as const;

export type ShapeGroupKey = keyof typeof SHAPE_GROUP_LABEL;

/**
 * 物理配列の規格から選択欄のグループを決める。
 * 名前の文字列（「JIS」を含むか等）からは推測しない。規格は組み込みの定義だけが持つので、
 * 組み込みでない物理配列は自作として扱う。
 */
export function shapeGroupKey(shapeId: string): ShapeGroupKey {
  return isPresetGeometryKind(shapeId) ? presetGeometryStandard(shapeId) : 'user';
}

export interface ShapeGroup<T> {
  readonly key: ShapeGroupKey;
  readonly label: string;
  readonly shapes: readonly T[];
}

/** 物理配列をANSI・JIS・自作の順にグループへ分ける。空のグループは返さない。各グループ内の並びは入力の順。 */
export function groupShapes<T extends { readonly id: string }>(shapes: Iterable<T>): readonly ShapeGroup<T>[] {
  const byKey: Record<ShapeGroupKey, T[]> = { ansi: [], jis: [], user: [] };
  for (const shape of shapes) byKey[shapeGroupKey(shape.id)].push(shape);
  return (['ansi', 'jis', 'user'] as const)
    .filter((key) => byKey[key].length > 0)
    .map((key) => ({ key, label: SHAPE_GROUP_LABEL[key], shapes: byKey[key] }));
}
