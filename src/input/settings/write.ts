import type { ItemRegistry, RegistryValueMap } from './items.ts';
import type { CascadeLevel } from './levels.ts';
import type { CascadeOverrides, LevelOverrides } from './overrides.ts';
import { levelOverrides, withLevelOverrides } from './overrides.ts';

export interface DisallowedLevelError {
  readonly kind: 'disallowed-level';
  readonly itemId: string;
  readonly level: CascadeLevel;
  readonly message: string;
}

export type WriteResult<V> =
  | { readonly ok: true; readonly overrides: CascadeOverrides<V> }
  | { readonly ok: false; readonly error: DisallowedLevelError };

/**
 * 1項目を1レベルへ書き込む。コマンド層はこれを経由して書く
 * （書き込むレベルを必ず指定する、という要件をここで満たす）。
 * 許可されていないレベルへの書き込みは例外ではなく値として拒否する。
 */
export function setOverride<R extends ItemRegistry, K extends keyof R & string>(
  registry: R,
  overrides: CascadeOverrides<RegistryValueMap<R>>,
  level: CascadeLevel,
  itemId: K,
  value: RegistryValueMap<R>[K],
): WriteResult<RegistryValueMap<R>> {
  const item = registry[itemId];
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
  const current: LevelOverrides<RegistryValueMap<R>> = levelOverrides(overrides, level) ?? {};
  // 既に同じ値（プリミティブなので`Object.is`で比較できる）が保存されているなら、
  // `overrides`をそのまま返す（新しいオブジェクトを作らない）。コマンド層
  // （engine/commands.ts）はこの参照の一致で「何も変えなかった」を判定するため、
  // ここで新しい参照を作ってしまうと同じ値の書き込みが毎回「変化した」と誤判定される。
  if (itemId in current && Object.is(current[itemId], value)) {
    return { ok: true, overrides };
  }
  const next = { ...current, [itemId]: value } as LevelOverrides<RegistryValueMap<R>>;
  return { ok: true, overrides: withLevelOverrides(overrides, level, next) };
}
