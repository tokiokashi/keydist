import { SETTINGS_ITEMS, type ItemValueMap, type SettingsItemId } from './items.ts';
import type { CascadeLevel } from './levels.ts';
import type { CascadeOverrides, LevelOverrides } from './overrides.ts';
import { levelOverrides, withLevelOverrides } from './overrides.ts';

export interface DisallowedLevelError {
  readonly kind: 'disallowed-level';
  readonly itemId: SettingsItemId;
  readonly level: CascadeLevel;
  readonly message: string;
}

export type WriteResult =
  | { readonly ok: true; readonly overrides: CascadeOverrides }
  | { readonly ok: false; readonly error: DisallowedLevelError };

/**
 * 1項目を1レベルへ書き込む。後続のコマンド層（Phase 2の別項目）はこれを経由して書く
 * （書き込むレベルを必ず指定する、という#544 §8-2の要件をここで満たす）。
 * 許可されていないレベルへの書き込みは例外ではなく値として拒否する。
 */
export function setOverride<K extends SettingsItemId>(
  overrides: CascadeOverrides,
  level: CascadeLevel,
  itemId: K,
  value: ItemValueMap[K],
): WriteResult {
  const item = SETTINGS_ITEMS[itemId];
  if (!item.allowedLevels.has(level.kind)) {
    return {
      ok: false,
      error: {
        kind: 'disallowed-level',
        itemId,
        level,
        message: `項目「${itemId}」は${level.kind}レベルに書き込めない（許可: ${[...item.allowedLevels].join(', ')}）`,
      },
    };
  }
  const current = levelOverrides(overrides, level) ?? {};
  const next: LevelOverrides = { ...current, [itemId]: value };
  return { ok: true, overrides: withLevelOverrides(overrides, level, next) };
}
