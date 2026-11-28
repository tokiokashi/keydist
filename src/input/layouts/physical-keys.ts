import { resolveKeyId, type Geometry, type Key } from '../shapes/geometry.ts';
import type { Layout } from './types.ts';

/** canonical input pathに実際に現れるphysical key集合。layout idやpresentation metadataには依存しない。 */
export function physicalKeysUsedByLayout(layout: Pick<Layout, 'canonicalInputs' | 'pendingTable'>): ReadonlySet<string> {
  const keys = new Set<string>();
  // 表を取得する前の配列は、表の代わりに宣言を読む
  if (layout.pendingTable !== undefined) {
    for (const key of layout.pendingTable.physicalKeys) keys.add(resolveKeyId(key));
    return keys;
  }
  for (const alternatives of layout.canonicalInputs.values()) {
    for (const alternative of alternatives) {
      for (const input of alternative.semanticInputs) {
        for (const key of input.physicalKeys) keys.add(resolveKeyId(key));
      }
    }
  }
  return keys;
}

/**
 * 通常gridと親指キーは常に表示し、grid外の一般キーはlayoutが実際に使う時だけ表示する。
 * Shift等の将来追加されるgrid外キーもcanonical inputをauthorityに同じ規則で扱える。
 */
export function visibleGeometryKeys(layout: Pick<Layout, 'canonicalInputs' | 'pendingTable'>, geometry: Geometry): readonly Key[] {
  const used = physicalKeysUsedByLayout(layout);
  const grid = new Set(geometry.grid.flat().map((key) => key.id));
  return [...geometry.keys.values()].filter((key) => grid.has(key.id) || key.finger === 'LT' || key.finger === 'RT' || used.has(resolveKeyId(key.id)));
}
