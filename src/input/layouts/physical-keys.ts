import { resolveKeyId, type Geometry, type Key } from './geometry.ts';
import type { Layout } from './layouts/types.ts';

/** canonical input pathに実際に現れるphysical key集合。layout idやpresentation metadataには依存しない。 */
export function physicalKeysUsedByLayout(
  layout: Pick<Layout, 'canonicalInputs'>,
): ReadonlySet<string> {
  const keys = new Set<string>();
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
 * 通常gridと親指キーは従来どおり表示し、grid外の一般キーはlayoutが実際に使う時だけ表示する。
 * Shift等の将来追加されるgrid外キーもcanonical inputをauthorityに同じ規則で扱える。
 */
export function visibleGeometryKeys(
  layout: Pick<Layout, 'canonicalInputs'>,
  geometry: Geometry,
): readonly Key[] {
  const used = physicalKeysUsedByLayout(layout);
  const grid = new Set(geometry.grid.flat().map((key) => key.id));
  return [...geometry.keys.values()].filter((key) =>
    grid.has(key.id)
    || key.finger === 'LT'
    || key.finger === 'RT'
    || used.has(resolveKeyId(key.id)));
}
