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
 * 定性色12色。OKLCHの色相を255°から30°刻みで一周させ、明度・彩度は「白（ライトthemeの
 * `--surface`）と#1c1c1a（ダークthemeの`--surface`）のどちらに対してもコントラスト比が
 * 約4:1になる」ように色相ごとに選んだ（N感度の線・凡例の色見本は両themeの`--surface`上に
 * 描かれ、色をthemeで切り替える仕組みを持たないため、1色で両方に効く明度に揃える）。
 * 黄〜緑の色相はこの明度で出せる彩度が低く、くすんだ色になるのは明度を揃えた代償。
 *
 * 色相の近さ（index差1 = 30°）で並べてある。割り当て側（`BUILTIN_LAYOUT_COLOR_INDEX`）は
 * この並びを前提に、並べて比べる配列同士をindexで離す。
 */
const SETUP_COLOR_PALETTE: readonly string[] = [
  '#277DE0', // 255° 青
  '#796DE1', // 285° 青紫
  '#A95EC8', // 315° 紫
  '#C6519A', // 345° 赤紫
  '#D54E62', //  15° 赤
  '#D05709', //  45° 橙
  '#A97206', //  75° 黄土
  '#877F00', // 105° オリーブ
  '#488D00', // 135° 緑
  '#048F67', // 165° 青緑
  '#038B8B', // 195° 水色
  '#0288AC', // 225° 空色
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
 * `avoid` に挙げたindexは除いた中から選ぶ（複製で複製元と別の色にする、Setupのベースの
 * 配列を配列対象として並べた時と別の色にする、ため）。除外した結果選べるindexが無くなる
 * 場合だけ、除外を諦めて通常どおり選ぶ（「別の色にする」より「例外を起こさない」を優先する。
 * #544 §8-5と同じ方針）。
 */
export function leastUsedColorIndex(
  existingColorIndexes: readonly number[],
  avoid: readonly number[] = [],
): number {
  const counts = new Array(SETUP_COLOR_PALETTE_SIZE).fill(0) as number[];
  for (const index of existingColorIndexes) counts[index] += 1;

  const pick = (skip: readonly number[]): number | undefined => {
    let best: number | undefined;
    let bestCount = Number.POSITIVE_INFINITY;
    for (let index = 0; index < SETUP_COLOR_PALETTE_SIZE; index++) {
      if (skip.includes(index)) continue;
      if (counts[index] < bestCount) {
        bestCount = counts[index];
        best = index;
      }
    }
    return best;
  };

  return pick(avoid) ?? pick([])!;
}

/**
 * 配列を対象にした時の色（#578指摘2の決定「色は集合によらず、対象ごとに固定する」）。
 * Setupと違って保存された`colorIndex`を持たない（配列idそのものが対象の識別子で、
 * 追加・複製という概念が無い）ので、配列idから決定的に求める。
 *
 * **組み込み配列は配列idをキーにした固定の表で割り当てる。** 登録順から計算する方式は、
 * 配列を1つ足すと他の配列の色が動き、並べて比べたい配列同士（colemak/colemak-dh等）が
 * 同じ色に寄ることがあった。17配列・12色なので同じ色の組は5組残る（鳩の巣原理）。
 * その5組は「一緒に並べることが少ない組」を選んで寄せる:
 * - 英字配列（qwerty・dvorak・colemak・colemak-dh・workman）は互いに色相で60°以上離す
 * - qwertyはどの配列とも色を共有しない（日本語でもローマ字入力の比較の基準になるため）
 * - 同じ系統の変種（大西・新JIS・かわせみ）は互いに離す
 * - 色を共有するのは、qwerty以外の英字配列（主に英語の文章で比べる）とかな配列の組と、
 *   大西の変種と別系統の配列の組だけ
 * 組み込みを足したら、この表にも行を足す（color.test.tsが表の抜けを検出する）。
 *
 * 自作配列（表に無いid）は文字列ハッシュ（FNV-1aの簡易版。暗号強度は不要で、同じ入力から
 * 同じ出力が返る決定性だけが要る）へフォールバックする。
 */
export const BUILTIN_LAYOUT_COLOR_INDEX: ReadonlyMap<string, number> = new Map([
  ['qwerty', 0],
  ['kawasemi-plus', 1],
  ['workman', 2],
  ['shingeta', 2],
  ['shin-jis-prefix', 3],
  ['oonishi-custom', 3],
  ['colemak', 4],
  ['naginata-v18', 4],
  ['asuka', 5],
  ['dvorak', 6],
  ['tsuki-2-263', 6],
  ['kawasemi-kai', 7],
  ['nicola', 8],
  ['colemak-dh', 9],
  ['shin-jis-simultaneous', 9],
  ['oonishi', 10],
  ['shin-koume', 11],
]);

function hashToColorIndex(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash) % SETUP_COLOR_PALETTE_SIZE;
}

export function layoutTargetColorIndex(layoutId: string): number {
  return BUILTIN_LAYOUT_COLOR_INDEX.get(layoutId) ?? hashToColorIndex(layoutId);
}

/** パレットの色そのもの（テストで色相の距離を測るため、indexから引けるようにする）。 */
export function paletteColor(index: number): string {
  return SETUP_COLOR_PALETTE[index]!;
}

/**
 * 対象（`AnalysisTarget`）の色。Setup対象は`setupColor`と同じ保存済み`colorIndex`を引き、
 * 配列対象は`layoutTargetColorIndex`で決定的に求める。`setups`はkeyでSetupを引くための
 * 手持ち（見つからなければ既定のindex 0。呼び出し側は`resolveTargetForText`等で先に
 * 対象自体の解決失敗を扱っている前提なので、ここでのfallbackは「表示だけ壊れた色に
 * しない」ための保険）。
 *
 * Setupの`colorIndex`は、作成時にベースの配列の`layoutTargetColorIndex`を避けて選ぶ
 * （`collection.ts`）。配列とそれをベースにしたSetupを並べる（上書きの効果を見る）のは
 * よくある比べ方で、同じ色だと線を追えないため。
 */
export function targetColor(target: AnalysisTarget, setups: ReadonlyMap<string, Setup>): string {
  if (target.kind === 'layout') return SETUP_COLOR_PALETTE[layoutTargetColorIndex(target.layoutId)];
  const setup = setups.get(target.setupId);
  return setup === undefined ? SETUP_COLOR_PALETTE[0] : setupColor(setup);
}
