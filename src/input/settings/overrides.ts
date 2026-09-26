import type { InputMethod, CascadeLevel } from './levels.ts';

/** 1レベル分の疎な上書き。値の型の写像 `V`（`RegistryValueMap<R>`）の部分集合。 */
export type LevelOverrides<V> = { readonly [K in keyof V]?: V[K] };

/**
 * カスケード全体の保存形式。プレーンなJSONとして持つ（Map等は使わない）。
 * 後続のvalibot codec（Phase 2の別項目）がそのままdecodeできる形を意図している。
 * globalは単一、それ以外は「そのレベルのインスタンスid → 上書き」の辞書。
 * `V` はレジストリから決まる値の写像（`RegistryValueMap<R>`）で、呼び出し側が指定する。
 */
export interface CascadeOverrides<V> {
  readonly global?: LevelOverrides<V>;
  readonly shape?: Readonly<Record<string, LevelOverrides<V>>>;
  readonly inputMethod?: Readonly<Partial<Record<InputMethod, LevelOverrides<V>>>>;
  readonly layout?: Readonly<Record<string, LevelOverrides<V>>>;
  readonly setup?: Readonly<Record<string, LevelOverrides<V>>>;
}

/** 上書きが1つも無い状態。`{}` はどの `V` に対しても妥当なので、呼び出し側の型で使える。 */
export function emptyCascadeOverrides<V>(): CascadeOverrides<V> {
  return {};
}

/** 指定レベルに保存されている上書き（無ければundefined）。 */
export function levelOverrides<V>(
  overrides: CascadeOverrides<V>,
  level: CascadeLevel,
): LevelOverrides<V> | undefined {
  switch (level.kind) {
    case 'global': return overrides.global;
    case 'shape': return overrides.shape?.[level.shapeId];
    case 'inputMethod': return overrides.inputMethod?.[level.inputMethod];
    case 'layout': return overrides.layout?.[level.layoutId];
    case 'setup': return overrides.setup?.[level.setupId];
  }
}

/**
 * 指定レベルの上書きを丸ごと置き換えた新しいCascadeOverridesを返す（イミュータブル）。
 * `next` が `undefined` ならそのレベルのエントリごと消す（空オブジェクトを残さない）。
 */
export function withLevelOverrides<V>(
  overrides: CascadeOverrides<V>,
  level: CascadeLevel,
  next: LevelOverrides<V> | undefined,
): CascadeOverrides<V> {
  if (level.kind === 'global') {
    if (next === undefined) {
      const { global: _drop, ...rest } = overrides;
      return rest;
    }
    return { ...overrides, global: next };
  }

  const bucketKey = level.kind;
  const bucket = { ...(overrides[bucketKey] as Record<string, LevelOverrides<V>> | undefined) };
  const instanceKey = level.kind === 'shape'
    ? level.shapeId
    : level.kind === 'inputMethod'
      ? level.inputMethod
      : level.kind === 'layout'
        ? level.layoutId
        : level.setupId;

  if (next === undefined) {
    delete bucket[instanceKey];
  } else {
    bucket[instanceKey] = next;
  }

  if (Object.keys(bucket).length === 0) {
    const { [bucketKey]: _drop, ...rest } = overrides;
    return rest;
  }
  return { ...overrides, [bucketKey]: bucket };
}
