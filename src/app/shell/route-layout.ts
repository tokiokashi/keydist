/**
 * routeごとに、シェルへどう載るかを宣言する（routeの `staticData`）。
 *
 * - `contextBar: true`: ページが自分で文脈バーを描く。シェルはサイドバーを開くボタンを
 *   その文脈バーの左端へ差し込む。無いページでは、シェルがボタンだけの帯を出す
 */
declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    readonly contextBar?: true;
  }
}

export {};
