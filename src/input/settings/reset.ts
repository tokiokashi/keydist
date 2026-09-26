import type { CascadeLevel } from './levels.ts';
import type { CascadeOverrides } from './overrides.ts';
import { levelOverrides, withLevelOverrides } from './overrides.ts';

/** 1項目・1レベルの上書きだけを消す（#544 §3「リセット: 項目単位」）。 */
export function resetItem<V>(
  overrides: CascadeOverrides<V>,
  level: CascadeLevel,
  itemId: keyof V & string,
): CascadeOverrides<V> {
  const current = levelOverrides(overrides, level);
  if (current === undefined || !(itemId in current)) return overrides;
  const { [itemId]: _drop, ...rest } = current;
  const next = Object.keys(rest).length === 0 ? undefined : rest;
  return withLevelOverrides(overrides, level, next as typeof current | undefined);
}

/**
 * 1レベルの上書きを全項目まとめて消す（#544 §3「レベル単位（その配列の上書きを全部消す等）」）。
 */
export function resetLevel<V>(overrides: CascadeOverrides<V>, level: CascadeLevel): CascadeOverrides<V> {
  return withLevelOverrides(overrides, level, undefined);
}
