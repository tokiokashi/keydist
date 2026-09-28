/**
 * routeごとに、シェルへどう載るかを宣言する（routeの `staticData`）。
 *
 * - `shell: 'none'`: シェルに載せない。旧Analyzer（`/analyzer`）は自前の上部バーと全画面の
 *   段組みを持ち、置き換えとともに消えるので、シェルに合わせて作り直さない
 * - `contextBar: true`: ページが自分で文脈バーを描く。シェルはサイドバーを開くボタンを
 *   その文脈バーの左端へ差し込む。無いページでは、シェルがボタンだけの帯を出す
 */
declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    readonly shell?: 'none';
    readonly contextBar?: true;
  }
}

export {};
