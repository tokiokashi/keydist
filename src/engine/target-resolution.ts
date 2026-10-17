import type { UserLayout } from '#input/layouts/user-layouts.ts';
import { layoutKind } from '#input/layouts/kind.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { PhysicalShape } from '#input/shapes/geometry.ts';
import type { CascadeContext } from '#input/settings/index.ts';
import type { TextLanguage } from '#input/text/language.ts';
import {
  deriveInputMethod,
  resolveSetupForText,
  type AnalysisTarget,
  type Setup,
  type SetupCatalog,
  type SetupReferenceError,
  type SetupTextResolution,
} from '#input/setup/index.ts';
import { readOverride } from '#input/settings/index.ts';
import { physicalKeysUsedByLayout } from '#input/layouts/physical-keys.ts';
import { FALLBACK_JIS_SHAPE_ID, jisShapeIdFor } from '#input/shapes/jis-shape.ts';
import { DEFAULT_SHAPE_ID, resolveDefaultShapeId, resolveWorkspaceDefaultShapeId, type SettingsCascadeOverrides } from './settings-items.ts';

/**
 * `AnalysisTarget`の解決。
 *
 * - **Setup対象**: 手持ち（`setups`）から実体を探し、見つかれば`resolveSetupForText`
 *   （既存のSetup解決。`input/setup/input-method.ts`）へそのまま委ねる。今までと
 *   ビット単位で同じ結果になる（決定「Setup対象は今までどおり解決する」）
 * - **配列対象**: `Setup`という器を経由せず、配列idと「既定の物理配列」（カスケードの
 *   全体・配列のレベルの項目`defaultShapeId`。`settings-items.ts`）から`CascadeContext`を
 *   直接組み立てる。`targetKind: 'layout'`のcontextは型の上で`setupId`を持てないため、
 *   `resolveCascade`はSetupレベルの上書きを一切見ない（「配列を対象にした時はSetupレベルを
 *   持たない」が`CascadeContext`の型契約そのもので保証される。`input/settings/context.ts`の
 *   コメント参照）
 *
 * 手持ちのSetup一覧に上書きが1つも無いSetup（配列と「既定の物理配列」が一致するもの）を
 * 対象にした場合、このモジュールが作る`CascadeContext`は`targetKind`・`setupId`以外Setup版と
 * 完全に一致する（`targetKind`で変わるのは`defaultShapeId`の`applicable`だけで、Traceには効かない）。`resolveCascade`はSetupレベルに何も無ければ実効値へ影響しない
 * （`resolveItem`は`stored === undefined`なら何もしない）ので、両者の`ResolvedInput`
 * （ひいては`traceKeyOf`が使うTraceキー）は同一になる（Setupのid・ラベル・色は
 * キーに含めない。`engine/keys.ts`のコメント参照）。
 */
export type TargetTextResolution = SetupTextResolution | { readonly ok: false; readonly kind: 'target-missing'; readonly target: AnalysisTarget };

/**
 * 配列を対象にした時に測る物理配列。配列のレベルの上書き ＞ Workspace・全体の値 ＞ 既定の順で選ぶ。
 * 選んだ物理配列が手持ちに無い時は`DEFAULT_SHAPE_ID`にする。
 *
 * JISの物理配列が要る配列（`Layout.requiresJisShape`）は、配列のレベルの上書きが手持ちの物理配列を指す時はそれを使い、
 * 上書きが無い・手持ちに無い時は、Workspace・全体の値から選ばれた物理配列と同じ形のJISの物理配列にする
 * （`jisShapeIdFor`。自作の物理配列は、配列が使うキーを全部持つ時だけそのまま使う）。
 */
export function resolveShapeForLayout(
  overrides: SettingsCascadeOverrides,
  layout: Layout,
  shapes: ReadonlyMap<string, PhysicalShape>,
): PhysicalShape | undefined {
  const own = readOverride(overrides, { kind: 'layout', layoutId: layout.id }, 'defaultShapeId');
  const ownShape = own === undefined ? undefined : shapes.get(own);
  if (ownShape !== undefined) return ownShape;
  if (layout.requiresJisShape !== true) {
    return shapes.get(own ?? resolveWorkspaceDefaultShapeId(overrides)) ?? shapes.get(DEFAULT_SHAPE_ID);
  }
  const base = shapes.get(resolveWorkspaceDefaultShapeId(overrides)) ?? shapes.get(DEFAULT_SHAPE_ID);
  if (base === undefined) return shapes.get(FALLBACK_JIS_SHAPE_ID);
  const jisId = jisShapeIdFor(base, physicalKeysUsedByLayout(layout));
  return shapes.get(jisId) ?? shapes.get(FALLBACK_JIS_SHAPE_ID) ?? base;
}

export function resolveTargetForText(
  target: AnalysisTarget,
  setups: ReadonlyMap<string, Setup>,
  catalog: SetupCatalog,
  userLayouts: ReadonlyMap<string, UserLayout>,
  overrides: SettingsCascadeOverrides,
  language: TextLanguage,
): TargetTextResolution {
  if (target.kind === 'setup') {
    const setup = setups.get(target.setupId);
    if (setup === undefined) return { ok: false, kind: 'target-missing', target };
    return resolveSetupForText(setup, catalog, userLayouts, language);
  }

  const layout: Layout | undefined = catalog.layouts.get(target.layoutId);
  if (layout === undefined) return { ok: false, kind: 'target-missing', target };

  // 「既定の物理配列」が壊れている（未知・削除されたid）だけでは配列対象の解決を失敗にしない。
  // `DEFAULT_SHAPE_ID`へ静かにfallbackし、`context.shapeId`が実際に
  // 使った物理配列を持つ。その食い違いは`SETTINGS_ITEMS.defaultShapeId`の`validate`が
  // `resolveCascade`の通常の経路で検知して診断を積む（値と`context.shapeId`を突き合わせる
  // だけの軽い検査。settings-items.tsのコメント参照）ので、ここでは値の選定だけを行う。
  // `DEFAULT_SHAPE_ID`自体もcatalogに無い場合（自作カタログが極端に小さい等）だけ、
  // 本当に解決できないので`reference`エラーにする。
  const shape: PhysicalShape | undefined = resolveShapeForLayout(overrides, layout, catalog.shapes);
  if (shape === undefined) {
    const errors: SetupReferenceError[] = [{ kind: 'shape-missing', shapeId: resolveDefaultShapeId(overrides, target.layoutId) }];
    return { ok: false, kind: 'reference', errors };
  }

  const derivation = deriveInputMethod(language, layoutKind(layout, userLayouts));
  if (!derivation.ok) return { ok: false, kind: 'incompatible-text', layout, language };

  const context: CascadeContext = {
    targetKind: 'layout',
    shapeId: shape.id,
    shape,
    inputMethod: derivation.inputMethod,
    layoutId: layout.id,
    layout,
  };
  return { ok: true, layout, shape, context };
}
