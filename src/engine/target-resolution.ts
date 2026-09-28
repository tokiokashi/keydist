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
import { resolveDefaultShapeId, type SettingsCascadeOverrides } from './settings-items.ts';

/**
 * `AnalysisTarget`の解決（#578指摘1の決定「対象を配列かSetupにする」）。
 *
 * - **Setup対象**: 手持ち（`setups`）から実体を探し、見つかれば`resolveSetupForText`
 *   （既存のSetup解決。`input/setup/input-method.ts`）へそのまま委ねる。今までと
 *   ビット単位で同じ結果になる（決定「Setup対象は今までどおり解決する」）
 * - **配列対象**: `Setup`という器を経由せず、配列idと「既定の形状」（カスケードの
 *   グローバル専用項目`defaultShapeId`。`settings-items.ts`）から`CascadeContext`を
 *   直接組み立てる。**`context.setupId`を持たない**ため、`resolveCascade`は
 *   Setupレベルの上書きを一切見ない（「配列を対象にした時はSetupレベルを持たない」が
 *   `CascadeContext`の型契約そのもので保証される。`input/settings/context.ts`の
 *   コメント参照）
 *
 * 手持ちのSetup一覧に上書きが1つも無いSetup（配列と「既定の形状」が一致するもの）を
 * 対象にした場合、このモジュールが作る`CascadeContext`は`setupId`の有無以外Setup版と
 * 完全に一致する。`resolveCascade`はSetupレベルに何も無ければ実効値へ影響しない
 * （`resolveItem`は`stored === undefined`なら何もしない）ので、両者の`ResolvedInput`
 * （ひいては`traceKeyOf`が使うTraceキー）は同一になる（#544 §7「Setupのid・ラベル・色は
 * キーに含めない」。`engine/keys.ts`のコメント参照）。
 */
export type TargetTextResolution =
  | SetupTextResolution
  | { readonly ok: false; readonly kind: 'target-missing'; readonly target: AnalysisTarget };

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

  const shapeId = resolveDefaultShapeId(overrides);
  const shape: PhysicalShape | undefined = catalog.shapes.get(shapeId);
  if (shape === undefined) {
    const errors: SetupReferenceError[] = [{ kind: 'shape-missing', shapeId }];
    return { ok: false, kind: 'reference', errors };
  }

  const derivation = deriveInputMethod(language, layoutKind(layout, userLayouts));
  if (!derivation.ok) return { ok: false, kind: 'incompatible-text', layout, language };

  const context: CascadeContext = {
    shapeId: shape.id,
    shape,
    inputMethod: derivation.inputMethod,
    layoutId: layout.id,
    layout,
    // setupIdを持たない: 配列を対象にした時はSetupレベルのカスケードを一切見ない
    // （用語表「対象」・#578指摘1）。
  };
  return { ok: true, layout, shape, context };
}
