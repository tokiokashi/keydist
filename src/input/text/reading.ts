import type { TextLanguage } from './language.ts';

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

export interface ReadingConversion {
  /** 読みに直したテキスト */
  readonly text: string;
  /** 読みに置き換えた語の数（辞書の読みと直した読みの合計） */
  readonly replacedWords: number;
  /** 直しが当たった表記と読み。表記の順に並べる。テキストに現れなかった直しは含まない */
  readonly appliedCorrections: readonly ReadingCorrectionEntry[];
}

/**
 * 解析の結果から、漢字を含む語を読み（ひらがな）に置き換えたテキストを作る。
 *
 * 語を連結せず、語のバイト位置で原文を切る。解析は半角の空白・改行・タブを語として返さないので、
 * 語を連結すると原文に戻らない。語と語の間に残った文字は、そのまま残す。
 *
 * 置き換えるのは、表記に漢字を含み、直しがあるか辞書の読みがカタカナと長音だけの語。
 * 利用者の直し（`corrections`）は表記が一致する語すべての読みを置き換え、辞書の読みの有無を問わない
 * （未知語・読みが無い語・`々`だけの語にも当たる）。直しの無い未知語・読みが無い語・`々`だけの語は
 * 表記のまま残し、配列が打てない文字として数える。
 * 漢字を含まない語（全角数字を含む）は、辞書が読みを返しても、直しがあっても置き換えない。
 *
 * 語のバイト位置が原文と食い違う時は例外を投げる（呼び出し側は読みに直せなかったものとして扱う）。
 */
export function convertToReading(
  text: string,
  tokens: readonly ReadingToken[],
  corrections: ReadingCorrections = NO_READING_CORRECTIONS,
): ReadingConversion {
  const bytes = new TextEncoder().encode(text);
  // 先頭のBOM（U+FEFF）を読み飛ばさない。原文の文字として残す
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let out = '';
  let position = 0;
  let replacedWords = 0;
  const applied = new Set<string>();
  for (const token of tokens) {
    if (token.byteStart < position || token.byteEnd < token.byteStart || token.byteEnd > bytes.length) {
      throw new Error('語の位置が原文と合わない');
    }
    out += decoder.decode(bytes.subarray(position, token.byteStart));
    const original = decoder.decode(bytes.subarray(token.byteStart, token.byteEnd));
    if (original !== token.surface) throw new Error('語の表記が原文と合わない');
    const hasKanji = KANJI.test(token.surface);
    if (hasKanji && Object.hasOwn(corrections, token.surface)) {
      out += corrections[token.surface];
      applied.add(token.surface);
      replacedWords++;
    } else if (!token.isUnknown && token.reading !== null && hasKanji && KATAKANA_READING.test(token.reading)) {
      out += katakanaToHiragana(token.reading);
      replacedWords++;
    } else {
      out += original;
    }
    position = token.byteEnd;
  }
  out += decoder.decode(bytes.subarray(position));
  const appliedCorrections = [...applied].sort().map((surface) => ({ surface, reading: corrections[surface]! }));
  return { text: out, replacedWords, appliedCorrections };
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
    if (!token.isUnknown && token.reading !== null && KATAKANA_READING.test(token.reading)) {
      const reading = katakanaToHiragana(token.reading);
      entry.readings.set(reading, (entry.readings.get(reading) ?? 0) + 1);
    }
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
   * 直しが当たった表記と読み（表記の順）。直していなければ空。辞書を読み込めなかった数値は直しを当てないので空。
   * 同じ数でも中身の違う直しを区別するため、数ではなく対応そのものを持つ。
   */
  readonly corrections: readonly ReadingCorrectionEntry[];
}
