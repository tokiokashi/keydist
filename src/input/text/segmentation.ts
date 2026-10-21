import {
  NO_READING_CORRECTIONS,
  replacementFor,
  TOKEN_POSITION_MISMATCH,
  TOKEN_SURFACE_MISMATCH,
  type ReadingCorrections,
  type ReadingToken,
} from './reading.ts';

/**
 * 文節の区切りの位置を、原文から評価に渡すテキストへ写す純粋な処理。
 * 分割器そのもの（`platform/bunsetsu/`）はここに持たない。分割器が返す区切りの位置を受け取るだけにする。
 *
 * 写す段は2つある。
 * 1. 原文 → 漢字を読みに直したテキスト（このファイル。利用者の読みの直しで文字数が変わっても、区切りは語の境目に載る）
 * 2. 読みのテキスト → 評価に渡すテキスト（`evaluation-text.ts` の `evaluationBoundaries`。記号を取り除く）
 */

/** 文節の区切りの出どころ。評価に渡すテキストが何から作られたかを表す。 */
export type SegmentationOrigin =
  /** 漢字を読みに直した辞書の語の境目へ寄せた */
  | 'dictionary'
  /** 原文に漢字が無く、語の列が要らなかった */
  | 'kana-only'
  /** 辞書を読み込めず、漢字が表記のまま残った。前処理の対応だけで写した */
  | 'dictionary-unavailable';

/** 分割器の名前と版。数値の条件に記録する。 */
export interface SegmenterInfo {
  readonly name: string;
  readonly version: string;
}

/** 器が分割器から得た文節の区切り。位置は読みのテキストのコードポイント（記号を取り除く前）。 */
export interface SegmentationInput {
  readonly boundaries: readonly number[];
  readonly origin: SegmentationOrigin;
  readonly splitter: SegmenterInfo;
}

/** 計算部が受け取る文節の区切り。位置は評価に渡すテキストの文字位置（先頭が0。0と末尾を含まない）。 */
export interface SegmentationAssets {
  readonly boundaries: readonly number[];
  readonly origin: SegmentationOrigin;
  readonly splitter: SegmenterInfo;
}

/** 分割器が返した文字列の断片の列から、区切りの位置（UTF-16の位置。0と末尾を含まない）を求める。 */
export function offsetsOfChunks(chunks: readonly string[]): number[] {
  const offsets: number[] = [];
  let position = 0;
  for (const chunk of chunks) {
    if (position > 0 && chunk.length > 0) offsets.push(position);
    position += chunk.length;
  }
  return offsets;
}

function codePointCount(text: string): number {
  let count = 0;
  for (const _char of text) count++;
  return count;
}

/** 原文の一部分と、それが読みのテキストで占める範囲（コードポイント）。 */
interface Piece {
  /** 原文でのUTF-16の位置 */
  readonly from: number;
  readonly to: number;
  /** 読みのテキストでのコードポイントの位置 */
  readonly outFrom: number;
  readonly outTo: number;
  /** 語を丸ごと置き換えた部分か（そうでなければ原文をそのまま残した部分） */
  readonly replaced: boolean;
}

/**
 * 原文の区切り（UTF-16の位置）を、語の読みに直したテキストのコードポイントの位置へ写す。
 * `convertToReading` と同じ置き換えを辿る（`tokens` が空なら、原文のままの位置になる）。
 *
 * 区切りが、置き換えた語の途中に来た時は、その語の後ろの境目へ寄せる。1語の読みを2つの区間に分けない。
 * 置き換えない語や語の間の文字の途中は、そのまま写す。
 * 先頭・末尾に来た区切りと、寄せたことで重なった区切りは除く。結果は昇順で重複しない。
 */
export function mapBoundariesToReading(
  sourceText: string,
  tokens: readonly ReadingToken[],
  sourceBoundaries: readonly number[],
  corrections: ReadingCorrections = NO_READING_CORRECTIONS,
): number[] {
  const bytes = new TextEncoder().encode(sourceText);
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const pieces: Piece[] = [];
  let bytePosition = 0;
  let from = 0;
  let outFrom = 0;
  const push = (length: number, outLength: number, replaced: boolean): void => {
    pieces.push({ from, to: from + length, outFrom, outTo: outFrom + outLength, replaced });
    from += length;
    outFrom += outLength;
  };
  for (const token of tokens) {
    if (token.byteStart < bytePosition || token.byteEnd < token.byteStart || token.byteEnd > bytes.length) {
      throw new Error(TOKEN_POSITION_MISMATCH);
    }
    const gap = decoder.decode(bytes.subarray(bytePosition, token.byteStart));
    if (gap.length > 0) push(gap.length, codePointCount(gap), false);
    const original = decoder.decode(bytes.subarray(token.byteStart, token.byteEnd));
    if (original !== token.surface) throw new Error(TOKEN_SURFACE_MISMATCH);
    const replacement = replacementFor(token, corrections);
    if (original.length > 0) push(original.length, codePointCount(replacement === undefined ? original : replacement.text), replacement !== undefined);
    bytePosition = token.byteEnd;
  }
  const rest = decoder.decode(bytes.subarray(bytePosition));
  if (rest.length > 0) push(rest.length, codePointCount(rest), false);

  const total = outFrom;
  const mapped = new Set<number>();
  // 区切りを昇順に辿り、区切りを含む部分を前から探す（区切りが多い長いテキストでも部分の数に比例する時間で済ませる）
  let cursor = 0;
  for (const boundary of [...sourceBoundaries].sort((a, b) => a - b)) {
    while (cursor < pieces.length && boundary >= pieces[cursor]!.to) cursor++;
    const piece = pieces[cursor];
    let position: number;
    if (piece === undefined || boundary < piece.from) {
      position = total;
    } else if (boundary === piece.from) {
      position = piece.outFrom;
    } else if (piece.replaced) {
      position = piece.outTo;
    } else {
      position = piece.outFrom + codePointCount(sourceText.slice(piece.from, boundary));
    }
    if (position > 0 && position < total) mapped.add(position);
  }
  return [...mapped].sort((a, b) => a - b);
}
