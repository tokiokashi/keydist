import type { Setup } from './types.ts';

/**
 * Setupの色（#544 §4「色は自動で付ける」）。
 *
 * 旧実装・`src/ui/theme` を確認したが、「配列やSetupに自動で色を割り当てる」仕組みは
 * 存在しない（`src/legacy/chart.ts` はグラフの系列ごとに呼び出し側が都度 `color` を渡すだけ）。
 * そのためここで新たに小さな定性色パレットを1つ用意する。
 *
 * **色は作成・複製の時点で決め、`Setup.colorIndex` として保存する**（idから毎回計算し直す
 * 方式は採らない）。理由: 少数のSetupを並べて比べる（#544 §4の主用途）時に、
 * パレットの数（12）に対してハッシュの衝突はすぐ起きる（Setup3個で約24%の確率でどこか
 * 衝突する）。作成時に「その時点の手持ちの中で最も使われていない色」を選べば、
 * 少数のSetupではほぼ確実に色が分かれる。複製は複製元と別の色になるよう選ぶ
 * （同じ配列・形状のSetup2つを並べてポリシー違いを比べる用途で、色が同じでは
 * 区別できないため）。
 *
 * `colorIndex` はユーザーが選ぶ値ではなく自動生成の結果なので、#544 §4がユーザーの保存対象
 * として挙げる3つ（配列・形状・Setup固有の上書き）には入らない。それでも保存するのは、
 * 「その場で計算する」方式だと他のSetupの追加・削除のたびに全Setupの色が動いてしまい、
 * 表示の安定性（同じSetupは見るたびに同じ色）が保てないため。作成時点の決定を固定する
 * という点では `label` と同じ扱いだが、ユーザーが与えた値ではないのでコメントで区別する
 * （types.ts参照）。
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

export const SETUP_COLOR_PALETTE_SIZE = SETUP_COLOR_PALETTE.length;

/** 保存された `colorIndex` からパレットを引くだけの参照関数。 */
export function setupColor(setup: Pick<Setup, 'colorIndex'>): string {
  return SETUP_COLOR_PALETTE[setup.colorIndex];
}

/**
 * 新しく割り当てる色のindexを決める。`existingColorIndexes`（今の手持ちが使っている色）の中で
 * 最も使用回数が少ないindexを返し、同数なら小さいindexを選ぶ（決定的）。
 *
 * `avoid` を渡すと、そのindexを除いた中から選ぶ（複製で複製元と別の色にするため）。
 * 除外した結果選べるindexが無くなる場合（パレットが1色しか無い等）だけ、除外を諦めて
 * 通常どおり選ぶ（「別の色にする」より「例外を起こさない」を優先する。#544 §8-5と同じ方針）。
 *
 * 新規作成（`avoid` 無し）でこの関数を手持ちが空の状態から1件ずつ呼べば、
 * 0, 1, 2, … とパレットを順番に使っていく（`initialSetups` はこれをそのまま使う）。
 */
export function leastUsedColorIndex(
  existingColorIndexes: readonly number[],
  avoid?: number,
): number {
  const counts = new Array(SETUP_COLOR_PALETTE_SIZE).fill(0) as number[];
  for (const index of existingColorIndexes) counts[index] += 1;

  const pick = (skip: number | undefined): number | undefined => {
    let best: number | undefined;
    let bestCount = Number.POSITIVE_INFINITY;
    for (let index = 0; index < SETUP_COLOR_PALETTE_SIZE; index++) {
      if (skip !== undefined && index === skip) continue;
      if (counts[index] < bestCount) {
        bestCount = counts[index];
        best = index;
      }
    }
    return best;
  };

  return pick(avoid) ?? pick(undefined)!;
}
