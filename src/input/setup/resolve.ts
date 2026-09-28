import type { Layout } from '#input/layouts/types.ts';
import type { PhysicalShape } from '#input/shapes/geometry.ts';
import type { CascadeContext, InputMethod } from '#input/settings/index.ts';
import type { Setup } from './types.ts';

/**
 * Setupが参照する配列・形状の実体を探すカタログ。組み込み・自作の両方をこの1つの写像に
 * まとめるのは呼び出し側の責任（`src/input/layouts/index.ts` の `LAYOUT_BY_ID` に
 * ユーザー配列を合わせた写像を渡す、等）。ここでは「idから引けること」だけを要求する。
 */
export interface SetupCatalog {
  readonly layouts: ReadonlyMap<string, Layout>;
  readonly shapes: ReadonlyMap<string, PhysicalShape>;
}

/**
 * Setupの参照が解決できない理由（#544 §6「残る例外表示は、Setup/配列/形状が削除された時だけ」）。
 * 配列・形状のどちらも削除されている場合があるので、両方をまとめて返せるようにする。
 */
export type SetupReferenceError =
  | { readonly kind: 'layout-missing'; readonly layoutId: string }
  | { readonly kind: 'shape-missing'; readonly shapeId: string };

export type SetupResolution =
  | {
      readonly ok: true;
      readonly layout: Layout;
      readonly shape: PhysicalShape;
      readonly context: CascadeContext;
    }
  | { readonly ok: false; readonly errors: readonly SetupReferenceError[] };

/**
 * Setup + 配列・形状のカタログから、解決済みの {配列, 形状, カスケードcontext} を返す。
 * 配列や形状が削除されていても例外を投げず、値として理由を返す（#544 §8-5「エラーは値」）。
 *
 * `inputMethod` は引数で受け取る。打ち方（テキストの言語 × 配列の種類から導く値）の導出は
 * 別項目（Phase 2「打ち方の導出」）の対象でここでは実装しない。配列の実体だけでは打ち方が
 * 決まらない（types.ts の Setup のコメント参照）ので、導出した結果を呼び出し側から
 * 渡してもらう。
 *
 * Setupが未確定の段階（新規作成中のプレビュー等）で `setupId` を渡さずに呼びたい場合は、
 * 呼び出し側で `context.setupId` を書き換えるのではなく、`CascadeContext` を直接組み立てる
 * （resolveCascade側は `setupId` 省略時にSetupレベルの上書きを見ない仕様。ここで返す
 * contextは常にそのSetup自身のidを持つ、確定したSetupの解決結果を表す）。
 */
export function resolveSetup(
  setup: Setup,
  catalog: SetupCatalog,
  inputMethod: InputMethod,
): SetupResolution {
  const layout = catalog.layouts.get(setup.layoutId);
  const shape = catalog.shapes.get(setup.shapeId);

  const errors: SetupReferenceError[] = [];
  if (layout === undefined) errors.push({ kind: 'layout-missing', layoutId: setup.layoutId });
  if (shape === undefined) errors.push({ kind: 'shape-missing', shapeId: setup.shapeId });
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    layout: layout!,
    shape: shape!,
    context: {
      shapeId: shape!.id,
      shape: shape!,
      inputMethod,
      layoutId: layout!.id,
      layout: layout!,
      setupId: setup.id,
    },
  };
}
