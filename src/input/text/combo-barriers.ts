import {
  katakanaToHiragana,
  NO_READING_CORRECTIONS,
  NO_WORD_READINGS,
  replacementFor,
  TOKEN_POSITION_MISMATCH,
  TOKEN_SURFACE_MISMATCH,
  type ReadingCorrections,
  type ReadingToken,
} from './reading.ts';

/**
 * コンボを止める境（仕様 §4.3）を、解析で得た語の列から、漢字を読みに直したテキストの位置へ写す純粋な処理。
 * 境は、活用する1語の内側の、語幹と活用語尾の間だけに置く（`早|く`・`嬉し|かっ`）。語と語の間には置かない。
 * 位置は、読みのテキストのコードポイントの位置で、境がその位置の直前にある（先頭は0。0と末尾を含まない）。
 * 評価に渡すテキストの位置へは、`evaluationBoundaries`（`evaluation-text.ts`）が写す。
 *
 * 語の読みが利用者の直しで置き換わっても、境は活用語尾の手前に置く。活用語尾はかなで、直しの読みもその語の末尾に活用語尾を持つので、
 * 末尾から活用語尾の長さだけ戻った位置になる。直しの読みが活用語尾で終わらない時は、語幹と語尾を割れないので境を置かない。
 */
export function comboBarriersInReading(
  sourceText: string,
  tokens: readonly ReadingToken[],
  corrections: ReadingCorrections = NO_READING_CORRECTIONS,
  wordReadings: ReadonlyMap<number, string> = NO_WORD_READINGS,
): number[] {
  const bytes = new TextEncoder().encode(sourceText);
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const barriers: number[] = [];
  let bytePosition = 0;
  let outPosition = 0;
  for (const [index, token] of tokens.entries()) {
    if (token.byteStart < bytePosition || token.byteEnd < token.byteStart || token.byteEnd > bytes.length) {
      throw new Error(TOKEN_POSITION_MISMATCH);
    }
    outPosition += [...decoder.decode(bytes.subarray(bytePosition, token.byteStart))].length;
    const original = decoder.decode(bytes.subarray(token.byteStart, token.byteEnd));
    if (original !== token.surface) throw new Error(TOKEN_SURFACE_MISMATCH);
    const outText = replacementFor(token, corrections, wordReadings.get(index))?.text ?? original;
    const outLength = [...outText].length;
    if (token.stemLength !== undefined) {
      const ending = [...token.surface].slice(token.stemLength).join('');
      const endingLength = [...ending].length;
      if (outLength > endingLength && katakanaToHiragana(outText).endsWith(katakanaToHiragana(ending))) {
        barriers.push(outPosition + outLength - endingLength);
      }
    }
    outPosition += outLength;
    bytePosition = token.byteEnd;
  }
  return barriers;
}
