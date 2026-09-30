/**
 * ペインの推奨幅（既定の最大幅）。個別画面とWorkspaceのペインの両方が、この値で本体の幅を止める。
 *
 * 値はここ1か所で決める。Analyzerは `pane-meta.ts` の `recommendedWidthRem` に
 * `WIDE_RECOMMENDED_WIDTH_REM` などを書けば自分だけ変えられる（書かなければ既定）。
 * 推奨幅は「ペインの幅を超えて広げない」方向にだけ効く。ペインが推奨幅より狭い時は
 * 何もせず、ペインの幅に合わせて縮む（スクロールさせない）。
 *
 * ReactにもCSSにも依存させない（`pane-meta.ts` が読むため）。
 */

/** 既定の推奨幅 [rem]。図が横に伸びすぎて読みにくくならない幅（Keyboard Flow・N感度を実物で見て決めた）。 */
export const DEFAULT_RECOMMENDED_WIDTH_REM = 64;

/** 横に並ぶ要素が多いAnalyzer（比較表）の推奨幅 [rem]。 */
export const WIDE_RECOMMENDED_WIDTH_REM = 96;

export function recommendedWidthRemOf(meta: object): number {
  const value = (meta as { readonly recommendedWidthRem?: number }).recommendedWidthRem;
  return value ?? DEFAULT_RECOMMENDED_WIDTH_REM;
}
