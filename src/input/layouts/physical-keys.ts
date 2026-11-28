import { resolveKeyId, type Geometry, type Key } from '../shapes/geometry.ts';
import { runStepsToEnd, STEP_INTERVAL } from '../semantics/index.ts';
import type { Layout } from './types.ts';

const usedKeysCache = new WeakMap<object, ReadonlySet<string>>();

/** canonical input pathに実際に現れるphysical key集合。layout idやpresentation metadataには依存しない。 */
export function physicalKeysUsedByLayout(layout: Pick<Layout, 'canonicalInputs' | 'pendingTable'>): ReadonlySet<string> {
  return runStepsToEnd(physicalKeysUsedByLayoutSteps(layout));
}

/**
 * `physicalKeysUsedByLayout` と同じ集合を、`STEP_INTERVAL` 項目ごとに `yield` する形で求める。
 * 求めた集合は配列の `canonicalInputs` ごとに覚え、同じ配列に対しては二度求めない。
 * 数万の見出しを持つ配列（漢直）の集合を、配列を作る間に先に求めておくために使う。
 */
export function* physicalKeysUsedByLayoutSteps(layout: Pick<Layout, 'canonicalInputs' | 'pendingTable'>): Generator<void, ReadonlySet<string>> {
  // 表を取得する前の配列は、表の代わりに宣言を読む
  if (layout.pendingTable !== undefined) {
    return new Set(layout.pendingTable.physicalKeys.map((key) => resolveKeyId(key)));
  }
  const known = usedKeysCache.get(layout.canonicalInputs);
  if (known !== undefined) return known;
  const keys = new Set<string>();
  let count = 0;
  for (const alternatives of layout.canonicalInputs.values()) {
    for (const alternative of alternatives) {
      for (const input of alternative.semanticInputs) {
        for (const key of input.physicalKeys) keys.add(resolveKeyId(key));
      }
    }
    if (++count % STEP_INTERVAL === 0) yield;
  }
  usedKeysCache.set(layout.canonicalInputs, keys);
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
