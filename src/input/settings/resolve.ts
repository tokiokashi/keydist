import {
  resolveDefaultValue,
  type ItemRegistry,
  type RegistryValueMap,
  type SettingItem,
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

export type ResolvedCascade<V> = { readonly [K in keyof V]: ResolvedItem<V[K]> };

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

function resolveItem(
  itemId: string,
  item: SettingItem<unknown>,
  overrides: CascadeOverrides<unknown>,
  levels: readonly CascadeLevel[],
  context: CascadeContext,
): ResolvedItem<unknown> {
  const diagnostics: Diagnostic[] = [];

  let value = resolveDefaultValue(item, context);
  let origin: ResolvedOrigin = { kind: 'default' };

  // 弱い順に重ねる。許可されていないレベルの値は解決に使わず、診断だけ残す
  // （インポートした旧データ等、許可外レベルに値が残っているケースを想定）。
  for (const level of levels) {
    const stored = levelOverrides(overrides, level) as Record<string, unknown> | undefined;
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
 * 純関数（registry・overrides・contextだけを見る）。項目の定義（具体の11個）は
 * `src/engine/settings-items.ts` が持ち、ここは仕組みだけを提供する。
 */
export function resolveCascade<R extends ItemRegistry>(
  registry: R,
  overrides: CascadeOverrides<RegistryValueMap<R>>,
  context: CascadeContext,
): ResolvedCascade<RegistryValueMap<R>> {
  const levels = levelsForContext(context);
  const result: Record<string, ResolvedItem<unknown>> = {};
  for (const itemId of Object.keys(registry)) {
    result[itemId] = resolveItem(
      itemId,
      registry[itemId],
      overrides as CascadeOverrides<unknown>,
      levels,
      context,
    );
  }
  return result as ResolvedCascade<RegistryValueMap<R>>;
}
