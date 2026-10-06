/**
 * 対象（配列・Setup）を並べて見せる時の色。
 *
 * 色は対象ごとに固定せず、同じ画面に並べている集合の中で、パレットから加えた順に配る。
 * 何番を配るかは画面の器が持つ（個別画面は集合の`colorSlots`（`engine/multi-target-selection.ts`）、
 * Workspaceは全ペインの和に対する`Workspace.colorSlots`（`engine/workspace.ts`））。
 * ここは番号から色を引くだけ。
 *
 * **色の値は`theme.css`の`--target-color-N`にあり、明暗で切り替える。** ここが返すのは
 * `var(--target-color-N)`で、hexの文字列ではない。SVGへは`style`で渡す（presentation attributeの
 * `var()`はブラウザごとの差が確かめきれていないため）。色の値をJSで読む必要がある場面を作らない。
 * 1色を明暗共通にすると、明では`--surface-muted`（#efefec）、暗では`--surface-muted`（#2a2a27）の上でも
 * コントラスト比3以上になる明度の帯が、相対輝度で0.1688〜0.2538にしか残らず、距離を保った12色が取れなかった。
 * 明暗別なら、番号ごとに同じ色相のまま明度だけを動かして、明・暗それぞれの全ての面
 * （`--bg`・`--surface`・`--surface-raised`・`--surface-subtle`・`--surface-muted`と、凡例の枠）で3以上になる。
 * 使っている明度の範囲は、明が相対輝度0.113〜0.251、暗が0.171〜0.352（上限・下限の制約ではなく解の範囲）。
 *
 * **パレットはOKLCHで作った自前の12色。** 実績のあるカテゴリ配色（d3-scale-chromaticの
 * `schemeObservable10`・`schemeTableau10`）は明るい色（黄・水色・桃等）を含み、白の背景に対して
 * コントラスト比3に届かない色が10色中6〜7色ある。色相は番号ごとに明暗で同じにし（現状との差は1.1°以内）、
 * どの2色もOKLabの距離で0.12以上離す（明暗それぞれ。`target-colors.test.ts`がコントラストと距離を検査する）。
 *
 * **並びは「先頭から配った時に離れる順」。** 集合は先頭の数色しか使わないことが多いので、
 * それまでに出た色から最も遠い色を次に置く。色相順に並べると、2つ目・3つ目が1つ目の隣の色相に
 * なって見分けにくい。
 *
 * **遠さは色覚多様性のシミュレーションを含めて測る。** 通常の色覚だけで並べると、先頭3色が
 * 青・橙・緑になり、1型（P型）では橙と緑が、3型（T型）では青と緑がほぼ同じ色に見えた。
 * 通常・1型・2型・3型（Machado 2009、重さ1.0）の4通りで見たOKLabの距離の最小値を遠さとし、
 * 先頭5色は4通りのどれで見ても0.1以上離れる（明暗それぞれ。`target-colors-cvd.test.ts`が検査する）。
 * 1色目は青紫、2色目は橙で、1色だけの集合では、明暗の面を通した最悪のコントラスト比が高い青紫を先にする。
 */
export const TARGET_PALETTE_SIZE = 12;

/**
 * 番号の色。番号は集合の側が0以上`COLOR_SLOT_COUNT`（= この色数）未満で配る。範囲外が来ても
 * 例外にしないよう、剰余で折り返す。
 */
export function targetPaletteColor(slot: number): string {
  return `var(--target-color-${((slot % TARGET_PALETTE_SIZE) + TARGET_PALETTE_SIZE) % TARGET_PALETTE_SIZE})`;
}
