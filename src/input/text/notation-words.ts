import {
  NO_READING_CORRECTIONS,
  NO_WORD_READINGS,
  replacementFor,
  TOKEN_POSITION_MISMATCH,
  TOKEN_SURFACE_MISMATCH,
  type ReadingCorrections,
  type ReadingToken,
} from './reading.ts';

/**
 * 漢字を読みに直した語（仕様 §4.6の1.）の、読みのテキストでの範囲と表記。漢直の配列で表記のまま打つ語の候補になる（仕様 §4.3）。
 * 範囲 `[start, end)` はテキストのコードポイントの位置で、どの段のテキストの位置かは、持ち主（`PaneText`・`ResolvedInput`）が決める。
 */
export interface NotationWord {
  readonly start: number;
  readonly end: number;
  /** 語の表記。持ち主の段までに前処理が当たっていれば、その後の字列 */
  readonly surface: string;
}

/**
 * 解析で得た語の列から、読みに置き換える語の、読みのテキストの範囲と原文の表記を求める。
 * 置き換える語の判定は `convertToReading` と同じ（`replacementFor`）。読みのテキストの位置は `comboBarriersInReading` と同じ数え方。
 * 語の位置・表記が原文と合わない時は、`convertToReading` と同じ例外を投げる。
 */
export function notationWordsInReading(
  sourceText: string,
  tokens: readonly ReadingToken[],
  corrections: ReadingCorrections = NO_READING_CORRECTIONS,
  wordReadings: ReadonlyMap<number, string> = NO_WORD_READINGS,
): NotationWord[] {
  const bytes = new TextEncoder().encode(sourceText);
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const words: NotationWord[] = [];
  let bytePosition = 0;
  let outPosition = 0;
  for (const [index, token] of tokens.entries()) {
    if (token.byteStart < bytePosition || token.byteEnd < token.byteStart || token.byteEnd > bytes.length) {
      throw new Error(TOKEN_POSITION_MISMATCH);
    }
    outPosition += [...decoder.decode(bytes.subarray(bytePosition, token.byteStart))].length;
    const original = decoder.decode(bytes.subarray(token.byteStart, token.byteEnd));
    if (original !== token.surface) throw new Error(TOKEN_SURFACE_MISMATCH);
    const replacement = replacementFor(token, corrections, wordReadings.get(index));
    const outLength = [...(replacement?.text ?? original)].length;
    if (replacement !== undefined) words.push({ start: outPosition, end: outPosition + outLength, surface: original });
    outPosition += outLength;
    bytePosition = token.byteEnd;
  }
  return words;
}
