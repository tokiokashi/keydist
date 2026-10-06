import type { InputMethod } from '#input/settings/index.ts';
import type { LayoutKind } from '#input/layouts/kind.ts';
import type { TextLanguage } from '#input/text/language.ts';
import { layoutKind } from '#input/layouts/kind.ts';
import type { UserLayout } from '#input/layouts/user-layouts.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { PhysicalShape } from '#input/shapes/geometry.ts';
import type { CascadeContext } from '#input/settings/index.ts';
import { resolveSetup, type SetupCatalog, type SetupReferenceError } from './resolve.ts';
import type { Setup } from './types.ts';

/**
 * 打ち方の導出（打ち方はテキストの言語×配列の種類から導く。テキストに
 * 合わないSetupは「このテキストには使えない」と表示する）。
 *
 * 例外にはしない。英語テキストにかな配列を渡す組み合わせだけが
 * 不成立で、他の3通り（alpha×en=direct, alpha×ja=romaji, kana×ja=kana-direct）は必ず
 * 打ち方が決まる。
 */
export type InputMethodDerivation =
  | { readonly ok: true; readonly inputMethod: InputMethod }
  | { readonly ok: false; readonly reason: 'text-language-mismatch' };

export function deriveInputMethod(
  language: TextLanguage,
  kind: LayoutKind,
): InputMethodDerivation {
  if (kind === 'kana') {
    return language === 'ja'
      ? { ok: true, inputMethod: 'kana-direct' }
      : { ok: false, reason: 'text-language-mismatch' };
  }
  // kind === 'alpha': 英字を直接打つ配列。日本語はローマ字変換を介す
  return language === 'ja'
    ? { ok: true, inputMethod: 'romaji' }
    : { ok: true, inputMethod: 'direct' };
}

export type SetupTextResolution =
  | {
      readonly ok: true;
      readonly layout: Layout;
      readonly shape: PhysicalShape;
      readonly context: CascadeContext;
    }
  | { readonly ok: false; readonly kind: 'reference'; readonly errors: readonly SetupReferenceError[] }
  | {
      readonly ok: false;
      readonly kind: 'incompatible-text';
      readonly layout: Layout;
      readonly language: TextLanguage;
    };

/**
 * `resolveSetup` は打ち方を引数で受け取る（`resolve.ts` のコメント参照:「配列の実体だけでは
 * 打ち方が決まらない」ため、導出そのものは呼び出し側の責任にしていた）。
 *
 * ここでは `resolveSetup` の引数を変えずにラップする形を選ぶ。理由:
 * - `resolveSetup` は「打ち方が既に分かっている」場面（例えばテスト・カスケードの
 *   `inputMethod` レベルのプレビュー等、テキストを介さずに打ち方だけを指定したい場面）
 *   でも単独で使える形のままにしておきたい。引数をテキストの言語に置き換えると、
 *   そうした場面でも常に言語判定を経由させる必要が生じる
 * - 「参照が壊れている」（配列・物理配列が削除された）ケースと「テキストに合わない」ケースは
 *   別々の表示になる（前者は削除された時だけ出る例外表示、後者は使えないSetupとして表示する）。
 *   1つの関数の中で両方を判定する方が、呼び出し側でこの2つを混同しにくい
 *
 * 自作配列の種類判定に要る `userLayouts` は呼び出し側（`SetupCatalog` を組み立てる側と
 * 同じ場所）から渡してもらう。`kind.ts` の `layoutKind` がそのまま使える形にしている。
 */
export function resolveSetupForText(
  setup: Setup,
  catalog: SetupCatalog,
  userLayouts: ReadonlyMap<string, UserLayout>,
  language: TextLanguage,
): SetupTextResolution {
  const layout = catalog.layouts.get(setup.layoutId);
  const shape = catalog.shapes.get(setup.shapeId);

  const errors: SetupReferenceError[] = [];
  if (layout === undefined) errors.push({ kind: 'layout-missing', layoutId: setup.layoutId });
  if (shape === undefined) errors.push({ kind: 'shape-missing', shapeId: setup.shapeId });
  if (errors.length > 0) return { ok: false, kind: 'reference', errors };

  const derivation = deriveInputMethod(language, layoutKind(layout!, userLayouts));
  if (!derivation.ok) {
    return { ok: false, kind: 'incompatible-text', layout: layout!, language };
  }

  const resolution = resolveSetup(setup, catalog, derivation.inputMethod);
  // layout/shapeの存在は上ですでに確認済みなので、ここでresolveSetupがokにならないことはない。
  if (!resolution.ok) return { ok: false, kind: 'reference', errors: resolution.errors };
  return { ok: true, layout: resolution.layout, shape: resolution.shape, context: resolution.context };
}
