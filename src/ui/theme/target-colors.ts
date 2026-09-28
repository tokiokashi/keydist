/**
 * 対象（配列・Setup）を並べて見せる時の色（#601）。
 *
 * 色は対象ごとに固定せず、同じ画面に並べている集合の中で、このパレットから加えた順に配る。
 * 何番を配るかは集合の側が持つ（`engine/analyzer-set-selection.ts`の`colorSlots`）。
 * ここは番号から色を引くだけ。
 *
 * **パレットはOKLCHで作った自前の12色。** 実績のあるカテゴリ配色（d3-scale-chromaticの
 * `schemeObservable10`・`schemeTableau10`）は明るい色（黄・水色・桃等）を含み、白の背景に対して
 * コントラスト比3に届かない色が10色中6〜7色ある。線と凡例の色見本は両themeの`--surface`上に
 * 描かれ、色をthemeで切り替える仕組みを持たないので、1色で明暗どちらの背景にも3以上に
 * なる明度の帯に収める必要がある。そこで、色相を約30°刻みで一周させ、明度・彩度を色ごとに
 * 振ってどの2色もOKLabの距離で0.12以上離した12色を使う（`target-colors.test.ts`が
 * コントラストと距離を検査する）。
 *
 * **並びは「先頭から配った時に離れる順」。** 集合は先頭の数色しか使わないことが多いので、
 * 青から始め、それまでに出た色から最も遠い色を次に置く（OKLabの距離で貪欲に選んだ順）。
 * 色相順に並べると、2つ目・3つ目が1つ目の隣の色相になって見分けにくい。
 */
const TARGET_PALETTE: readonly string[] = [
  '#0E6CC2', // 青
  '#ED6200', // 橙
  '#3C7A0C', // 緑
  '#B8358F', // 赤紫
  '#AE7BBF', // 薄紫
  '#979200', // オリーブ
  '#3899BD', // 空色
  '#8F630B', // 黄土
  '#04A271', // 青緑
  '#1A7979', // 深い水色
  '#7C66E9', // 青紫
  '#B86469', // くすんだ赤
];

export const TARGET_PALETTE_SIZE = TARGET_PALETTE.length;

/**
 * 番号の色。集合がパレットより大きい時は先頭から繰り返す（同じ画面に13以上並べると
 * 色が重なるのは受け入れる。見分けられる色の数の上限なので、色を増やしても解決しない）。
 */
export function targetPaletteColor(slot: number): string {
  return TARGET_PALETTE[((slot % TARGET_PALETTE_SIZE) + TARGET_PALETTE_SIZE) % TARGET_PALETTE_SIZE]!;
}
