/**
 * ペインの本体の縦の下限（Workspaceで板の高さを決めるのに使う）。
 *
 * 値はここ1か所で決める。Analyzerは `pane-meta.ts` の `minBodyHeightRem` に、自分の図が読める最小の高さを
 * 書けばよい（書かなければ既定）。見出し・余白はホストが足すので、ここには本体だけの高さを書く。
 * 推奨幅（`recommended-width.ts`）の縦版で、置き方も同じ。
 *
 * 既定は、Workspaceのペインの本体が必ず残す窓の高さ（`hosts/workspace/workspace-grid.css` の `.pane-body` の
 * `min-height`）と同じにする。窓より低くは描けないので、宣言が無いAnalyzerの下限はこれになる。
 *
 * ReactにもCSSにも依存させない（`pane-meta.ts` が読むため）。
 */

/** 既定の本体の下限 [rem]。本体の窓の最小（`workspace-grid.css`）と揃える。 */
export const DEFAULT_MIN_BODY_HEIGHT_REM = 12;

export function minBodyHeightRemOf(meta: object): number {
  const value = (meta as { readonly minBodyHeightRem?: number }).minBodyHeightRem;
  return value ?? DEFAULT_MIN_BODY_HEIGHT_REM;
}
