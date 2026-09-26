import type { InputMethod, CascadeLevel } from './levels.ts';
import type { ItemValueMap, SettingsItemId } from './items.ts';

/** 1レベル分の疎な上書き。上書きした項目だけを持つ。 */
export type LevelOverrides = { readonly [K in SettingsItemId]?: ItemValueMap[K] };

/**
 * カスケード全体の保存形式。プレーンなJSONとして持つ（Map等は使わない）。
 * 後続のvalibot codec（Phase 2の別項目）がそのままdecodeできる形を意図している。
 * globalは単一、それ以外は「そのレベルのインスタンスid → 上書き」の辞書。
 */
export interface CascadeOverrides {
  readonly global?: LevelOverrides;
  readonly shape?: Readonly<Record<string, LevelOverrides>>;
  readonly inputMethod?: Readonly<Partial<Record<InputMethod, LevelOverrides>>>;
  readonly layout?: Readonly<Record<string, LevelOverrides>>;
  readonly setup?: Readonly<Record<string, LevelOverrides>>;
}

export const EMPTY_CASCADE_OVERRIDES: CascadeOverrides = {};

/** 指定レベルに保存されている上書き（無ければundefined）。 */
export function levelOverrides(overrides: CascadeOverrides, level: CascadeLevel): LevelOverrides | undefined {
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
export function withLevelOverrides(
  overrides: CascadeOverrides,
  level: CascadeLevel,
  next: LevelOverrides | undefined,
): CascadeOverrides {
  if (level.kind === 'global') {
    if (next === undefined) {
      const { global: _drop, ...rest } = overrides;
      return rest;
    }
    return { ...overrides, global: next };
  }

  const bucketKey = level.kind;
  const bucket = { ...(overrides[bucketKey] as Record<string, LevelOverrides> | undefined) };
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
