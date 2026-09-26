/**
 * Setupの色（#544 §4「色は自動で付ける」）。
 *
 * 旧実装・`src/ui/theme` を確認したが、「配列やSetupに自動で色を割り当てる」仕組みは
 * 存在しない（`src/legacy/chart.ts` はグラフの系列ごとに呼び出し側が都度 `color` を渡すだけ）。
 * そのためここで新たに小さな定性色パレットを1つ用意し、決定的に割り当てる。
 *
 * idから決めるのは、配列・形状が同じで上書きだけ違う2つのSetup
 * （#544 §4「配列も形状も同じSetupを2つ作れる」= ポリシー違いの比較用途）を並べても
 * 色が同じでは区別できないため。名前と違い、色の衝突（パレットの数を超えた時）は許容する
 * （#544はここに裁定を求めていない。見た目のヒント以上の意味は持たせない）。
 */

/**
 * 定性色12色。色相を30°刻みで回し、明度・彩度をそろえた
 * （dataviz向けの定性パレットの考え方を踏襲。ブランド等の指定は無いのでニュートラルな12色）。
 */
const SETUP_COLOR_PALETTE: readonly string[] = [
  '#4C6EF5', '#F76707', '#12B886', '#E64980',
  '#7048E8', '#F59F00', '#1098AD', '#E03131',
  '#37B24D', '#5C7CFA', '#D6336C', '#0CA678',
];

/**
 * 文字列から決定的な非負整数を作る（FNV-1aハッシュ）。乱数・crypto APIは使わない
 * （純粋層はブラウザ/Node APIに依存しない。#544 §8-2・AGENTS.md）。
 */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** SetupidからパレットのindexへのマッピングだけをexportするとテストがSVG値の変更に弱くなるので、
 * 色そのものではなくindexを返す版も用意する（テストは決定性・分布を見る用途でこちらを使う）。 */
export function setupColorIndex(setupId: string): number {
  return hashString(setupId) % SETUP_COLOR_PALETTE.length;
}

/** Setupの色（決定的）。 */
export function setupColor(setupId: string): string {
  return SETUP_COLOR_PALETTE[setupColorIndex(setupId)];
}

export const SETUP_COLOR_PALETTE_SIZE = SETUP_COLOR_PALETTE.length;
