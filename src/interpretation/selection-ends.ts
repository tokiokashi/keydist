import type { Stroke } from '#trace/generate.ts';

/**
 * 1回の入力の選択（同じ`selectionIndex`のストロークの組）の文字位置`e`。組の中の`kanaEnd`の最大を、評価に渡したテキストの
 * 文字位置（0から`inputChars − 1`）に収めた値。Run Chartの点の横位置の定義で（`analyzers/run-chart/extract.ts`）、
 * 打鍵の記録がストロークをテキストの位置へ対応づける時も同じ値を使う（`spec/keystroke-record.md`）。
 * 返す表は`selectionIndex` → `e`。
 */
export function selectionEndsOf(strokes: readonly Pick<Stroke, 'selectionIndex' | 'kanaEnd'>[], inputChars: number): Map<number, number> {
  const endBySelection = new Map<number, number>();
  for (const stroke of strokes) {
    const previous = endBySelection.get(stroke.selectionIndex);
    if (previous === undefined || stroke.kanaEnd > previous) endBySelection.set(stroke.selectionIndex, stroke.kanaEnd);
  }
  const last = Math.max(0, inputChars - 1);
  for (const [selection, end] of endBySelection) endBySelection.set(selection, Math.min(Math.max(0, end), last));
  return endBySelection;
}

/** ストロークごとの、属する選択の文字位置`e`（ストロークと同じ並び）。1つの`e`を複数のストロークが共有しうる。 */
export function strokeEndsOf(strokes: readonly Pick<Stroke, 'selectionIndex' | 'kanaEnd'>[], inputChars: number): number[] {
  const ends = selectionEndsOf(strokes, inputChars);
  return strokes.map((stroke) => ends.get(stroke.selectionIndex) ?? 0);
}
