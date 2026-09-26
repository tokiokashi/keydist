import {
  SETTINGS_ITEMS,
  SETTINGS_ITEM_IDS,
  type ItemValueMap,
  type SettingItem,
  type SettingsItemId,
} from './items.ts';
import type { CascadeLevel, CascadeLevelKind } from './levels.ts';
import { CASCADE_LEVEL_ORDER } from './levels.ts';
import type { CascadeContext } from './context.ts';
import type { CascadeOverrides } from './overrides.ts';
import { levelOverrides } from './overrides.ts';

/** 実効値の出どころ。上書きが無ければ `default`、あれば書き込まれたレベル。 */
export type ResolvedOrigin = { readonly kind: 'default' } | CascadeLevel;

export interface Diagnostic {
  readonly kind: 'ignored-disallowed-level' | 'invalid-fallback' | 'not-applicable';
  readonly message: string;
}

export interface ResolvedItem<T> {
  readonly value: T;
  /** VS Codeの「Modified in …」に相当。数値と条件を一緒に示す要件をここで満たす。 */
  readonly origin: ResolvedOrigin;
  /** 現在のSetupにこの項目が意味を持つか（#544 §3「その配列に無い機能の設定」）。 */
  readonly applicable: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export type ResolvedCascade = { readonly [K in SettingsItemId]: ResolvedItem<ItemValueMap[K]> };

/** そのContextで意味を持つレベルを弱い順に並べる。setupIdが無ければsetupレベルは見ない。 */
function levelsForContext(context: CascadeContext): readonly CascadeLevel[] {
  const levels: CascadeLevel[] = [];
  for (const kind of CASCADE_LEVEL_ORDER) {
    const level = levelFor(kind, context);
    if (level !== undefined) levels.push(level);
  }
  return levels;
}

function levelFor(kind: CascadeLevelKind, context: CascadeContext): CascadeLevel | undefined {
  switch (kind) {
    case 'global': return { kind: 'global' };
    case 'shape': return { kind: 'shape', shapeId: context.shapeId };
    case 'inputMethod': return { kind: 'inputMethod', inputMethod: context.inputMethod };
    case 'layout': return { kind: 'layout', layoutId: context.layoutId };
    case 'setup': return context.setupId === undefined
      ? undefined
      : { kind: 'setup', setupId: context.setupId };
  }
}

/**
 * 1項目を解決する。項目ごとに値の型が違う（`ItemValueMap[K]`）ので、辞書を組み立てる
 * `resolveCascade` 側では `SettingsItemId` の共用体を1つずつ扱えず型が壊れる
 * （TypeScriptの既知の制約）。ここでは `unknown` で型消去して計算し、
 * `resolveCascade` が項目ごとの正しい型へ戻す。
 */
function resolveItem(
  itemId: SettingsItemId,
  overrides: CascadeOverrides,
  levels: readonly CascadeLevel[],
  context: CascadeContext,
): ResolvedItem<unknown> {
  const item = SETTINGS_ITEMS[itemId] as SettingItem<unknown>;
  const diagnostics: Diagnostic[] = [];

  let value = item.defaultValue;
  let origin: ResolvedOrigin = { kind: 'default' };

  // 弱い順に重ねる。許可されていないレベルの値は解決に使わず、診断だけ残す
  // （インポートした旧データ等、許可外レベルに値が残っているケースを想定）。
  for (const level of levels) {
    const stored = levelOverrides(overrides, level);
    if (stored === undefined || !(itemId in stored)) continue;
    if (!item.allowedLevels.has(level.kind)) {
      diagnostics.push({
        kind: 'ignored-disallowed-level',
        message: `項目「${itemId}」の${level.kind}レベルの値は許可されていないため無視した`,
      });
      continue;
    }
    value = stored[itemId];
    origin = level;
  }

  // 妥当性: 形状等で実現できない値は順序で解決せず、実現できる値へ戻す。
  if (item.validate) {
    const result = item.validate(value, context);
    if (!result.ok) {
      diagnostics.push({ kind: 'invalid-fallback', message: result.reason });
      value = result.fallback;
    }
  }

  // 適用可否: 値自体は解決するが、その配列に無い機能なら「効かない」ことを示す。
  const applicable = item.isApplicable === undefined || item.isApplicable(context);
  if (!applicable) {
    diagnostics.push({
      kind: 'not-applicable',
      message: `項目「${itemId}」はこの配列・Setupでは効かない`,
    });
  }

  return { value, origin, applicable, diagnostics };
}

/**
 * カスケードを解決し、項目ごとの実効値・出どころ・診断を返す。
 * 純関数（overrides・contextだけを見る）。engine/UIはこれを呼ぶだけでよい。
 */
export function resolveCascade(overrides: CascadeOverrides, context: CascadeContext): ResolvedCascade {
  const levels = levelsForContext(context);
  const result: Record<string, ResolvedItem<unknown>> = {};
  for (const itemId of SETTINGS_ITEM_IDS) {
    result[itemId] = resolveItem(itemId, overrides, levels, context);
  }
  return result as ResolvedCascade;
}
