/**
 * 対象（配列・Setup）を並べて見せる時の色（#601）。
 *
 * 色は対象ごとに固定せず、同じ画面に並べている集合の中で、このパレットから加えた順に配る。
 * 何番を配るかは集合の側が持つ（`engine/analyzer-set-selection.ts`の`colorSlots`）。
 * ここは番号から色を引くだけ。
 *
 * **パレットはOKLCHで作った自前の12色。** 実績のあるカテゴリ配色（d3-scale-chromaticの
 * `schemeObservable10`・`schemeTableau10`）は明るい色（黄・水色・桃等）を含み、白の背景に対して
 * コントラスト比3に届かない色が10色中6〜7色ある。この色はJSから線・点・凡例の色見本へ直接
 * 渡していて、themeで切り替えていない（theme.cssの`--series-N`は`light-dark()`で切り替わるが、
 * ここは使っていない）。N感度の線は背景を指定した祖先を持たず、実際にはページ地（`--bg`）の上に
 * 描かれる。そこで1色で明暗どちらの`--bg`・`--surface`にも3以上になる明度の帯に収め、
 * 色相を約30°刻みで一周させ、明度・彩度を色ごとに振ってどの2色もOKLabの距離で0.12以上
 * 離した12色を使う（`target-colors.test.ts`がコントラストと距離を検査する）。
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
 * 番号の色。番号は集合の側が0以上`COLOR_SLOT_COUNT`（= この色数）未満で配る。範囲外が来ても
 * 例外にしないよう、剰余で折り返す。
 */
export function targetPaletteColor(slot: number): string {
  return TARGET_PALETTE[((slot % TARGET_PALETTE_SIZE) + TARGET_PALETTE_SIZE) % TARGET_PALETTE_SIZE]!;
}
