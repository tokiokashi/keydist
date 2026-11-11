import {
  containsKanji,
  dictionaryReadingOf,
  isCorrectionReading,
  TOKEN_POSITION_MISMATCH,
  TOKEN_SURFACE_MISMATCH,
  type ReadingToken,
} from './reading.ts';

/**
 * 語ごとの読みの直し（仕様 §4.6の1段目「語ごとの直しの指定と当て方」）。
 * テキストの中の1つの語だけの読みを、原文を変えずに直す。語は、表記・順番・前後の文字で指定し、
 * 解析で得た語の列へ見つけ直して当てる。形態素解析そのものは計算部の外が行い、ここは語の列を受け取る純粋な処理だけを持つ。
 */

/** 前後の文字の長さ（コードポイント）。 */
export const WORD_CONTEXT_LENGTH = 4;

/** 語の指定。 */
export interface WordAnchor {
  /** 語の表記（漢字を含む） */
  readonly surface: string;
  /** 解析で得た語の列のうち、表記が同じ語を前から数えた順番（0始まり） */
  readonly order: number;
  /** 原文で語の直前にある、最大 `WORD_CONTEXT_LENGTH` 文字。原文の先頭に近くて足りない時は、ある分だけ（空もある） */
  readonly before: string;
  /** 原文で語の直後にある、最大 `WORD_CONTEXT_LENGTH` 文字 */
  readonly after: string;
}

/** テキストごとに持つ、語ごとの直し。 */
export interface WordReadingCorrection extends WordAnchor {
  /** 直した読み（ひらがなと長音だけ） */
  readonly reading: string;
}

export type WordReadingCorrections = readonly WordReadingCorrection[];

export const NO_WORD_READING_CORRECTIONS: WordReadingCorrections = Object.freeze([]);

/** 直しが当たった語。表記・順番・前後の文字は、保存した直しの値ではなく、当たった語のもの。 */
export interface AppliedWordCorrection extends WordAnchor {
  readonly reading: string;
}

/** 語ごとの直しの当て方の結果。 */
export interface ResolvedWordCorrections {
  /** 直しを当てた語の番号（語の列の添字）→ 読み。`convertToReading` と `mapBoundariesToReading` へ渡す */
  readonly readings: ReadonlyMap<number, string>;
  /** 直しが当たった語。語の出現順 */
  readonly applied: readonly AppliedWordCorrection[];
  /** 当たった語と、それに当てた保存した直し。語の出現順で、`applied` と同じ並び */
  readonly storedOfApplied: readonly WordReadingCorrection[];
  /** 当たる語が無かった直し（保存した値のまま）。直しの並びの順 */
  readonly unfound: readonly WordReadingCorrection[];
}

/** 語ごとの直しが無い時、または語の列が無い時の結果。 */
export const NO_RESOLVED_WORD_CORRECTIONS: ResolvedWordCorrections = Object.freeze({
  readings: new Map<number, string>(),
  applied: Object.freeze([]),
  storedOfApplied: Object.freeze([]),
  unfound: Object.freeze([]),
});

/** 直しの識別の並び。表記・順番・前の文字・後の文字の順で、文字列は文字コード順。 */
function compareCorrections(a: WordAnchor, b: WordAnchor): number {
  if (a.surface !== b.surface) return a.surface < b.surface ? -1 : 1;
  if (a.order !== b.order) return a.order - b.order;
  if (a.before !== b.before) return a.before < b.before ? -1 : 1;
  if (a.after !== b.after) return a.after < b.after ? -1 : 1;
  return 0;
}

/** 2つの直しが同じ語の指定か（読みは見ない）。 */
export function sameWordAnchor(a: WordAnchor, b: WordAnchor): boolean {
  return compareCorrections(a, b) === 0;
}

/** 直しを、当て方の手順が処理する並びにそろえる。 */
export function sortedWordCorrections(corrections: WordReadingCorrections): WordReadingCorrection[] {
  return [...corrections].sort(compareCorrections);
}

/** 語ごとの直しとして持てる読みか。表記ごとの直しと同じく、ひらがなと長音だけで1文字以上。 */
export function isWordCorrection(value: unknown): value is WordReadingCorrection {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.surface === 'string' &&
    containsKanji(candidate.surface) &&
    typeof candidate.order === 'number' &&
    Number.isInteger(candidate.order) &&
    candidate.order >= 0 &&
    typeof candidate.before === 'string' &&
    typeof candidate.after === 'string' &&
    [...candidate.before].length <= WORD_CONTEXT_LENGTH &&
    [...candidate.after].length <= WORD_CONTEXT_LENGTH &&
    typeof candidate.reading === 'string' &&
    isCorrectionReading(candidate.reading)
  );
}

/**
 * 直しの並びに、直しを足す・差し替える・消す。`remove`の指定の直しをすべて消し、`add`と同じ指定の直しも消してから`add`を足す
 * （同じ指定の直しは1つだけ持つ）。結果は当て方の手順の並びにそろえる。変化が無ければ同じ参照を返す。
 */
export function withWordReadingCorrection(
  corrections: WordReadingCorrections,
  remove: readonly WordAnchor[],
  add: WordReadingCorrection | undefined,
): WordReadingCorrections {
  const kept = corrections.filter(
    (entry) => !remove.some((target) => sameWordAnchor(entry, target)) && !(add !== undefined && sameWordAnchor(entry, add)),
  );
  const next = add === undefined ? kept : [...kept, add].sort(compareCorrections);
  if (next.length === corrections.length && next.every((entry, index) => entry === corrections[index] || sameCorrection(entry, corrections[index]!))) {
    return corrections;
  }
  return next;
}

function sameCorrection(a: WordReadingCorrection, b: WordReadingCorrection): boolean {
  return sameWordAnchor(a, b) && a.reading === b.reading;
}

/** 語の位置（原文のUTF-16の位置）。 */
interface TokenRange {
  readonly from: number;
  readonly to: number;
}

/** 語の列から、原文でのUTF-16の位置を求める。語の位置が原文と合わない時は、`convertToReading`と同じ例外を投げる。 */
function tokenRanges(sourceText: string, tokens: readonly ReadingToken[]): TokenRange[] {
  const bytes = new TextEncoder().encode(sourceText);
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const ranges: TokenRange[] = [];
  let bytePosition = 0;
  let charPosition = 0;
  for (const token of tokens) {
    if (token.byteStart < bytePosition || token.byteEnd < token.byteStart || token.byteEnd > bytes.length) {
      throw new Error(TOKEN_POSITION_MISMATCH);
    }
    const from = charPosition + decoder.decode(bytes.subarray(bytePosition, token.byteStart)).length;
    const original = decoder.decode(bytes.subarray(token.byteStart, token.byteEnd));
    if (original !== token.surface) throw new Error(TOKEN_SURFACE_MISMATCH);
    ranges.push({ from, to: from + original.length });
    bytePosition = token.byteEnd;
    charPosition = from + original.length;
  }
  return ranges;
}

/** 位置の直前のコードポイントを、最大`WORD_CONTEXT_LENGTH`個取る。位置はコードポイントの境目。 */
function charsBefore(text: string, position: number): string {
  // 4コードポイントはUTF-16で最大8単位。境目から戻るので、取った断片の先頭が対の途中でも、後ろの4コードポイントは欠けない
  const slice = text.slice(Math.max(0, position - WORD_CONTEXT_LENGTH * 2), position);
  return Array.from(slice).slice(-WORD_CONTEXT_LENGTH).join('');
}

function charsAfter(text: string, position: number): string {
  const slice = text.slice(position, position + WORD_CONTEXT_LENGTH * 2);
  return Array.from(slice).slice(0, WORD_CONTEXT_LENGTH).join('');
}

/**
 * 漢字を含む語それぞれの指定を求める。漢字を含まない語はundefined。結果は語の列と同じ並びで、同じ添字が同じ語を指す。
 * 語の位置が原文と合わない時は例外を投げる。
 */
export function anchorTokens(sourceText: string, tokens: readonly ReadingToken[]): (WordAnchor | undefined)[] {
  const ranges = tokenRanges(sourceText, tokens);
  const counts = new Map<string, number>();
  return tokens.map((token, index) => {
    if (!containsKanji(token.surface)) return undefined;
    const order = counts.get(token.surface) ?? 0;
    counts.set(token.surface, order + 1);
    const range = ranges[index]!;
    return { surface: token.surface, order, before: charsBefore(sourceText, range.from), after: charsAfter(sourceText, range.to) };
  });
}

function anchorKey(anchor: WordAnchor): string {
  return JSON.stringify([anchor.surface, anchor.before, anchor.after]);
}

/**
 * 語ごとの直しを、解析で得た語の列へ当てる。手順は仕様 §4.6のとおり。
 * 直しを（表記・順番・前の文字・後の文字）の順に1つずつ処理し、表記が同じで前後の文字が完全に一致する語のうち、
 * まだほかの直しに当てていない語から、順番の差が最小の語（同じなら順番が小さい方）を選ぶ。候補が無ければ見つからない。
 * 直しが無い時は、語の列を読まずに空の結果を返す。
 */
export function resolveWordCorrections(
  sourceText: string,
  tokens: readonly ReadingToken[],
  corrections: WordReadingCorrections,
): ResolvedWordCorrections {
  if (corrections.length === 0) return NO_RESOLVED_WORD_CORRECTIONS;
  const anchors = anchorTokens(sourceText, tokens);
  const candidates = new Map<string, { readonly index: number; readonly anchor: WordAnchor }[]>();
  anchors.forEach((anchor, index) => {
    if (anchor === undefined) return;
    const key = anchorKey(anchor);
    const list = candidates.get(key);
    if (list === undefined) candidates.set(key, [{ index, anchor }]);
    else list.push({ index, anchor });
  });

  const taken = new Set<number>();
  const found: { readonly index: number; readonly anchor: WordAnchor; readonly stored: WordReadingCorrection }[] = [];
  const unfound: WordReadingCorrection[] = [];
  for (const stored of sortedWordCorrections(corrections)) {
    let best: { readonly index: number; readonly anchor: WordAnchor } | undefined;
    for (const candidate of candidates.get(anchorKey(stored)) ?? []) {
      if (taken.has(candidate.index)) continue;
      // 候補は出現順（順番が小さい順）に並ぶので、差が同じ時は先に見つけた順番の小さい方が残る
      if (best === undefined || Math.abs(candidate.anchor.order - stored.order) < Math.abs(best.anchor.order - stored.order)) best = candidate;
    }
    if (best === undefined) {
      unfound.push(stored);
      continue;
    }
    taken.add(best.index);
    found.push({ ...best, stored });
  }
  found.sort((a, b) => a.index - b.index);
  return {
    readings: new Map(found.map((entry) => [entry.index, entry.stored.reading])),
    applied: found.map((entry) => ({ ...entry.anchor, reading: entry.stored.reading })),
    storedOfApplied: found.map((entry) => entry.stored),
    unfound,
  };
}

/** 読みを見て直す対象の、語の1つの出現。 */
export interface ReadingOccurrence extends WordAnchor {
  /** 語の列での添字 */
  readonly tokenIndex: number;
  /** 辞書が返した読み（ひらがな）。辞書に読みが無ければundefined */
  readonly dictionaryReading: string | undefined;
  /** この語に当たっている、保存した語ごとの直し。無ければundefined */
  readonly stored: WordReadingCorrection | undefined;
}

/**
 * 漢字を含む語の出現を、出現の順に並べる。読みを直す画面が、同じ表記の語を場所ごとに選ぶために使う。
 * 語の位置が原文と合わない時は例外を投げる。
 */
export function listReadingOccurrences(sourceText: string, tokens: readonly ReadingToken[], resolved: ResolvedWordCorrections): ReadingOccurrence[] {
  const storedByToken = new Map<number, WordReadingCorrection>();
  const indices = [...resolved.readings.keys()].sort((a, b) => a - b);
  for (const [position, index] of indices.entries()) storedByToken.set(index, resolved.storedOfApplied[position]!);
  const occurrences: ReadingOccurrence[] = [];
  anchorTokens(sourceText, tokens).forEach((anchor, index) => {
    if (anchor === undefined) return;
    occurrences.push({ ...anchor, tokenIndex: index, dictionaryReading: dictionaryReadingOf(tokens[index]!), stored: storedByToken.get(index) });
  });
  return occurrences;
}
