import { countCharsAfterPreparation, type PreparationScope } from './evaluation-text.ts';
import type { TextLanguage } from './language.ts';
import type { AppliedWordCorrection } from './word-reading.ts';

/**
 * 漢字を読みに直す段（仕様 §4.6の1段目）。形態素解析そのものは計算部の外（`platform/reading/`）が行い、
 * ここは解析の結果（語の列）から、評価に渡す読みのテキストを作る純粋な処理だけを持つ。
 */

/** 解析の結果の1語。 */
export interface ReadingToken {
  /** 原文での表記 */
  readonly surface: string;
  /** 原文（UTF-8）でのバイト位置。`byteStart` 以上 `byteEnd` 未満 */
  readonly byteStart: number;
  readonly byteEnd: number;
  /** 辞書の読み（カタカナ）。辞書に読みが無い語はnull */
  readonly reading: string | null;
  /** 辞書に無い語（未知語）か */
  readonly isUnknown: boolean;
  /**
   * 活用する語（動詞・形容詞）の語幹の長さ（表記のコードポイント数）。語幹と活用語尾の間でコンボを止めるのに使う（仕様 §4.3）。
   * 活用語尾が無い語・語幹が取れない語・活用しない語は持たない。語幹は、表記と辞書の原形の共通の先頭部分
   */
  readonly stemLength?: number;
}

/** 漢字。CJK統合漢字と `々` を含む（`々` は文字のスクリプトが漢字）。 */
const KANJI = /\p{Script=Han}/u;

/** 辞書の読みとして受け取る文字（カタカナと長音）。 */
const KATAKANA_READING = /^[ァ-ヶー]+$/u;

export function isKanjiChar(char: string): boolean {
  return KANJI.test(char);
}

export function containsKanji(text: string): boolean {
  return KANJI.test(text);
}

/**
 * 読みに直す対象のテキストか。日本語（言語の判定が日本語）で、漢字を含むものだけ。
 * 漢字を含まないテキストと英語のテキストは、解析を呼ばない。
 */
export function needsReading(text: string, language: TextLanguage): boolean {
  return language === 'ja' && containsKanji(text);
}

/** カタカナの読みをひらがなにする。`ー` はそのまま。 */
export function katakanaToHiragana(text: string): string {
  return text.replace(/[ァ-ヶ]/gu, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

/**
 * テキストごとに持つ、利用者が直した読み。表記 → 読み（ひらがなと長音だけ）。
 * 表記は漢字を含む語の表記に限る（`isCorrectableSurface`）。
 */
export type ReadingCorrections = Readonly<Record<string, string>>;

/** 直しが当たった表記と、置き換えた読み。 */
export interface ReadingCorrectionEntry {
  readonly surface: string;
  readonly reading: string;
}

export const NO_READING_CORRECTIONS: ReadingCorrections = Object.freeze({});

/** 利用者が打てる読み。ひらがなと長音だけで、1文字以上。 */
const CORRECTION_READING = /^[ぁ-ゖー]+$/u;

export function isCorrectionReading(reading: string): boolean {
  return CORRECTION_READING.test(reading);
}

/** 直しを当てられる表記か。漢字を含む語に限る（かな・全角数字などの語には当てない）。 */
export function isCorrectableSurface(surface: string): boolean {
  return KANJI.test(surface);
}

/** 直しを、表記の順に並べた表記と読みの対応にする。 */
export function correctionEntries(corrections: ReadingCorrections): ReadingCorrectionEntry[] {
  return Object.keys(corrections)
    .sort()
    .map((surface) => ({ surface, reading: corrections[surface]! }));
}

/** 表記の直しを足す・差し替える。`reading`がundefinedなら直しを消す。変化が無ければ同じ参照を返す。 */
export function withReadingCorrection(corrections: ReadingCorrections, surface: string, reading: string | undefined): ReadingCorrections {
  const has = Object.hasOwn(corrections, surface);
  if (reading === undefined) {
    if (!has) return corrections;
    const { [surface]: _drop, ...rest } = corrections;
    return rest;
  }
  if (has && corrections[surface] === reading) return corrections;
  return { ...corrections, [surface]: reading };
}

/** 語の位置・表記が原文と合わない時の例外の文。`convertToReading` と、区切りを写す処理（`segmentation.ts`）が同じ文を使う。 */
export const TOKEN_POSITION_MISMATCH = '語の位置が原文と合わない';
export const TOKEN_SURFACE_MISMATCH = '語の表記が原文と合わない';

/**
 * 読みに置き換えた語の、表記の字数から読みの字数を引いた数の合計（仕様 §11.5の `W` = 入力かな数 + この値）。
 * 表記の字数は、記号と英数字の範囲の処理（仕様 §4.6の3.と4.）の後に残る字だけを数えるので、範囲の条件（`keepSymbols`・`keepAlphanumerics`）の組ごとに持つ。
 */
export interface NotationExcess {
  /** 既定の範囲（どちらも偽） */
  readonly base: number;
  /** 記号をすべて残す範囲（`keepSymbols`だけが真） */
  readonly symbols: number;
  /** 英字と数字を残す範囲（`keepAlphanumerics`だけが真） */
  readonly alphanumerics: number;
  /** 記号をすべて残し、英字と数字も残す範囲（どちらも真） */
  readonly both: number;
}

export const NO_NOTATION_EXCESS: NotationExcess = Object.freeze({ base: 0, symbols: 0, alphanumerics: 0, both: 0 });

/** 範囲の条件に合う値。 */
export function notationExcessFor(excess: NotationExcess, scope: PreparationScope): number {
  if (scope.keepSymbols) return scope.keepAlphanumerics ? excess.both : excess.symbols;
  return scope.keepAlphanumerics ? excess.alphanumerics : excess.base;
}

export interface ReadingConversion {
  /** 読みに直したテキスト */
  readonly text: string;
  /** 読みに置き換えた語の数（辞書の読みと直した読みの合計） */
  readonly replacedWords: number;
  /** 表記ごとの直しが当たった表記と読み。表記の順に並べる。テキストに現れなかった直しと、語ごとの直しに取られた語だけの表記は含まない */
  readonly appliedCorrections: readonly ReadingCorrectionEntry[];
  /** 置き換えた語の、表記の字数と読みの字数の差の合計 */
  readonly notationExcess: NotationExcess;
}

/** 語ごとの直しを当てた語が無い時の、語の番号と読みの対応。 */
export const NO_WORD_READINGS: ReadonlyMap<number, string> = new Map();

/**
 * 語を置き換える読み。置き換えない語はundefined。`corrected` は利用者の直しを当てたか。
 * `convertToReading` と、原文の位置を読みのテキストの位置へ写す処理（`segmentation.ts`）が同じ判定を使う。
 */
export function replacementFor(
  token: ReadingToken,
  corrections: ReadingCorrections,
  wordReading?: string,
): { readonly text: string; readonly source: 'word' | 'surface' | 'dictionary' } | undefined {
  const hasKanji = KANJI.test(token.surface);
  if (hasKanji && wordReading !== undefined) return { text: wordReading, source: 'word' };
  if (hasKanji && Object.hasOwn(corrections, token.surface)) return { text: corrections[token.surface]!, source: 'surface' };
  const dictionary = dictionaryReadingOf(token);
  return dictionary === undefined ? undefined : { text: dictionary, source: 'dictionary' };
}

/** 辞書が返した読み（ひらがな）。漢字を含む語で、辞書の読みがカタカナと長音だけの時に限る。それ以外はundefined。 */
export function dictionaryReadingOf(token: ReadingToken): string | undefined {
  if (!KANJI.test(token.surface)) return undefined;
  if (token.isUnknown || token.reading === null || !KATAKANA_READING.test(token.reading)) return undefined;
  return katakanaToHiragana(token.reading);
}

/**
 * 解析の結果から、漢字を含む語を読み（ひらがな）に置き換えたテキストを作る。
 *
 * 語を連結せず、語のバイト位置で原文を切る。解析は半角の空白・改行・タブを語として返さないので、
 * 語を連結すると原文に戻らない。語と語の間に残った文字は、そのまま残す。
 *
 * 置き換えるのは、表記に漢字を含み、直しがあるか辞書の読みがカタカナと長音だけの語。
 * 利用者の直し（`corrections`）は表記が一致する語すべての読みを置き換え、辞書の読みの有無を問わない
 * （未知語・読みが無い語・`々`だけの語にも当たる）。語ごとの直し（`wordReadings`。語の番号 → 読み。`word-reading.ts`が求める）は
 * 当たった1語だけの読みを置き換え、同じ語の表記ごとの直しより優先する。直しの無い未知語・読みが無い語・`々`だけの語は
 * 表記のまま残し、配列が打てない文字として数える。
 * 漢字を含まない語（全角数字を含む）は、辞書が読みを返しても、直しがあっても置き換えない。
 *
 * 語のバイト位置が原文と食い違う時は例外を投げる（呼び出し側は読みに直せなかったものとして扱う）。
 */
export function convertToReading(
  text: string,
  tokens: readonly ReadingToken[],
  corrections: ReadingCorrections = NO_READING_CORRECTIONS,
  wordReadings: ReadonlyMap<number, string> = NO_WORD_READINGS,
): ReadingConversion {
  const bytes = new TextEncoder().encode(text);
  // 先頭のBOM（U+FEFF）を読み飛ばさない。原文の文字として残す
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let out = '';
  let position = 0;
  let replacedWords = 0;
  const excess = { base: 0, symbols: 0, alphanumerics: 0, both: 0 };
  const applied = new Set<string>();
  for (const [index, token] of tokens.entries()) {
    if (token.byteStart < position || token.byteEnd < token.byteStart || token.byteEnd > bytes.length) {
      throw new Error(TOKEN_POSITION_MISMATCH);
    }
    out += decoder.decode(bytes.subarray(position, token.byteStart));
    const original = decoder.decode(bytes.subarray(token.byteStart, token.byteEnd));
    if (original !== token.surface) throw new Error(TOKEN_SURFACE_MISMATCH);
    const replacement = replacementFor(token, corrections, wordReadings.get(index));
    if (replacement === undefined) {
      out += original;
    } else {
      out += replacement.text;
      const readingLength = [...replacement.text].length;
      excess.base += countCharsAfterPreparation(original, { keepSymbols: false, keepAlphanumerics: false }) - readingLength;
      excess.symbols += countCharsAfterPreparation(original, { keepSymbols: true, keepAlphanumerics: false }) - readingLength;
      excess.alphanumerics += countCharsAfterPreparation(original, { keepSymbols: false, keepAlphanumerics: true }) - readingLength;
      excess.both += countCharsAfterPreparation(original, { keepSymbols: true, keepAlphanumerics: true }) - readingLength;
      if (replacement.source === 'surface') applied.add(token.surface);
      replacedWords++;
    }
    position = token.byteEnd;
  }
  out += decoder.decode(bytes.subarray(position));
  const appliedCorrections = [...applied].sort().map((surface) => ({ surface, reading: corrections[surface]! }));
  return { text: out, replacedWords, appliedCorrections, notationExcess: excess };
}

/** 読みを見て直す対象の語（表記ごと）。 */
export interface ReadingWord {
  readonly surface: string;
  /** テキストでの出現数 */
  readonly count: number;
  /** 辞書が返した読み（ひらがな）。出現数の多い順で、重複しない。辞書に読みが無ければ空 */
  readonly dictionaryReadings: readonly string[];
}

/**
 * 解析の結果から、漢字を含む語を表記ごとにまとめる。出現の順に並べる。
 * 辞書の読みは、読みを置き換える語（`convertToReading`と同じ条件）のものだけを数える。
 */
export function listReadingWords(tokens: readonly ReadingToken[]): ReadingWord[] {
  const bySurface = new Map<string, { count: number; readings: Map<string, number> }>();
  for (const token of tokens) {
    if (!KANJI.test(token.surface)) continue;
    let entry = bySurface.get(token.surface);
    if (entry === undefined) {
      entry = { count: 0, readings: new Map() };
      bySurface.set(token.surface, entry);
    }
    entry.count++;
    const reading = dictionaryReadingOf(token);
    if (reading !== undefined) entry.readings.set(reading, (entry.readings.get(reading) ?? 0) + 1);
  }
  return [...bySurface].map(([surface, entry]) => ({
    surface,
    count: entry.count,
    dictionaryReadings: [...entry.readings].sort((a, b) => b[1] - a[1]).map(([reading]) => reading),
  }));
}

/**
 * 数値に付ける、読みの条件（仕様 §12.3）。漢字を含む日本語のテキストを評価した数値だけが持つ。
 * 読みは辞書と解析器の版で変わるので、どちらの版で読みに直したか（直せなかったか）を数値と一緒に運ぶ。
 */
export interface ReadingConditions {
  /** `converted` は漢字を読みに直して評価した。`unavailable` は辞書を読み込めず、漢字を読みに直さずに評価した。 */
  readonly status: 'converted' | 'unavailable';
  /** 読みの辞書。画面に出す名前と版 */
  readonly dictionary: { readonly name: string; readonly version: string };
  /** 解析器。スナップショットと書き出しにだけ入れる（画面には出さない） */
  readonly library: { readonly name: string; readonly version: string };
  /**
   * 表記ごとの直しが当たった表記と読み（表記の順）。直していなければ空。辞書を読み込めなかった数値は直しを当てないので空。
   * 同じ数でも中身の違う直しを区別するため、数ではなく対応そのものを持つ。
   */
  readonly corrections: readonly ReadingCorrectionEntry[];
  /**
   * 語ごとの直しが当たった語（語の出現順）。表記・順番・前後の文字は当たった語のもの。
   * 当たった直しが無ければ項目ごと持たない（直していない数値のスナップショットとキャッシュのキーを、直しの機能が無い時と同じにするため）。
   */
  readonly wordCorrections?: readonly AppliedWordCorrection[];
}
