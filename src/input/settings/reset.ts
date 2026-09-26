import type { SettingsItemId } from './items.ts';
import type { CascadeLevel } from './levels.ts';
import type { CascadeOverrides } from './overrides.ts';
import { levelOverrides, withLevelOverrides } from './overrides.ts';

/** 1項目・1レベルの上書きだけを消す（#544 §3「リセット: 項目単位」）。 */
export function resetItem(
  overrides: CascadeOverrides,
  level: CascadeLevel,
  itemId: SettingsItemId,
): CascadeOverrides {
  const current = levelOverrides(overrides, level);
  if (current === undefined || !(itemId in current)) return overrides;
  const { [itemId]: _drop, ...rest } = current;
  const next = Object.keys(rest).length === 0 ? undefined : rest;
  return withLevelOverrides(overrides, level, next);
}

/**
 * 1レベルの上書きを全項目まとめて消す（#544 §3「レベル単位（その配列の上書きを全部消す等）」）。
 */
export function resetLevel(overrides: CascadeOverrides, level: CascadeLevel): CascadeOverrides {
  return withLevelOverrides(overrides, level, undefined);
}
