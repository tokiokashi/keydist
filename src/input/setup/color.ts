import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import type { Setup } from './types.ts';
import type { AnalysisTarget } from './target.ts';

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

/**
 * 配列を対象にした時の色（#578指摘2の決定「色は集合によらず、対象ごとに固定する」）。
 * Setupと違って保存された`colorIndex`を持たない（配列idそのものが対象の識別子で、
 * 追加・複製という概念が無い）ので、配列idから決定的に求める。
 *
 * **組み込み配列は`LAYOUT_BY_ID`の登録順から決定的なindexを割り当てる**（レビュー指摘2:
 * 単純なハッシュだと18配列 vs 12色でよく衝突し、qwertyとcolemakのような並んで比べたい
 * 組み込み同士が同じ色になっていた）。順に0,1,2,…ではなく、パレットサイズと互いに素な
 * 歩幅（`BUILTIN_COLOR_STEP`）で回すことで、`LAYOUT_BY_ID`で隣り合う配列（アルファベット順・
 * 追加順で近い配列は用途も似て並べて見られやすい）の色をなるべく離す。それでも
 * 18配列・12色である以上、衝突（同じ色を持つ配列の組）は必ず残る（鳩の巣原理）。
 * この方式は「衝突をゼロにする」のではなく「隣接した配列同士の衝突を減らす」ことが目的。
 *
 * 自作配列（`LAYOUT_BY_ID`に無いid）は登録順という概念が無いので、文字列ハッシュ
 * （FNV-1aの簡易版。暗号強度は不要で、同じ入力から同じ出力が返る決定性だけが要る）へ
 * フォールバックする。
 */
const BUILTIN_COLOR_STEP = 5; // gcd(5, 12) === 1 なので12色を一巡してから重複が始まる
const BUILTIN_LAYOUT_IDS: readonly string[] = [...LAYOUT_BY_ID.keys()];

function hashToColorIndex(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash) % SETUP_COLOR_PALETTE_SIZE;
}

function layoutTargetColorIndex(layoutId: string): number {
  const builtinIndex = BUILTIN_LAYOUT_IDS.indexOf(layoutId);
  if (builtinIndex >= 0) return (builtinIndex * BUILTIN_COLOR_STEP) % SETUP_COLOR_PALETTE_SIZE;
  return hashToColorIndex(layoutId);
}

/**
 * 対象（`AnalysisTarget`）の色。Setup対象は`setupColor`と同じ保存済み`colorIndex`を引き、
 * 配列対象は`layoutTargetColorIndex`で決定的に求める。`setups`はkeyでSetupを引くための
 * 手持ち（見つからなければ既定のindex 0。呼び出し側は`resolveTargetForText`等で先に
 * 対象自体の解決失敗を扱っている前提なので、ここでのfallbackは「表示だけ壊れた色に
 * しない」ための保険）。
 *
 * **Setupの`colorIndex`割り当て（`leastUsedColorIndex`、`collection.ts`）は、その
 * SetupがベースにしているlayoutのlayoutTargetColorIndexとの衝突を考慮しない**
 * （レビュー指摘2「Setup colorIndex allocation must avoid colliding with layout-target
 * colors where possible」への対応: 現状は「手持ちのSetup同士で最も使われていない色」しか
 * 見ておらず、同じ画面にその配列自身の配列対象も並ぶケース（例: QWERTY配列と、QWERTYを
 * ベースにしたSetup）は今のところ考慮していない。`createSetup`/`duplicateSetup`は
 * 対象の集合（どの配列対象と並ぶか）を知らずに呼ばれるため、Setup作成時点では
 * 「その他に何と並ぶか」が決まっていないことが多く、先回りして実装しない
 * （AGENTS.md「設定項目を足すか決める」の3つ目と同じ判断）。実際に同じ色が並ぶ事故が
 * 目立つようになったら、Setup作成時に対象の配列idを`avoid`の材料へ加える形で拡張する）。
 */
export function targetColor(target: AnalysisTarget, setups: ReadonlyMap<string, Setup>): string {
  if (target.kind === 'layout') return SETUP_COLOR_PALETTE[layoutTargetColorIndex(target.layoutId)];
  const setup = setups.get(target.setupId);
  return setup === undefined ? SETUP_COLOR_PALETTE[0] : setupColor(setup);
}
