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

export interface ReadingConversion {
  /** 読みに直したテキスト */
  readonly text: string;
  /** 読みに置き換えた語の数 */
  readonly replacedWords: number;
}

/**
 * 解析の結果から、漢字を含む語を読み（ひらがな）に置き換えたテキストを作る。
 *
 * 語を連結せず、語のバイト位置で原文を切る。解析は半角の空白・改行・タブを語として返さないので、
 * 語を連結すると原文に戻らない。語と語の間に残った文字は、そのまま残す。
 *
 * 置き換えるのは、表記に漢字を含み、辞書の読みがカタカナと長音だけの語。未知語・読みが無い語・
 * `々` だけの語（読みが `々`）は表記のまま残し、配列が打てない文字として数える。
 * 漢字を含まない語（全角数字を含む）は、辞書が読みを返しても置き換えない。
 *
 * 語のバイト位置が原文と食い違う時は例外を投げる（呼び出し側は読みに直せなかったものとして扱う）。
 */
export function convertToReading(text: string, tokens: readonly ReadingToken[]): ReadingConversion {
  const bytes = new TextEncoder().encode(text);
  // 先頭のBOM（U+FEFF）を読み飛ばさない。原文の文字として残す
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let out = '';
  let position = 0;
  let replacedWords = 0;
  for (const token of tokens) {
    if (token.byteStart < position || token.byteEnd < token.byteStart || token.byteEnd > bytes.length) {
      throw new Error('語の位置が原文と合わない');
    }
    out += decoder.decode(bytes.subarray(position, token.byteStart));
    const original = decoder.decode(bytes.subarray(token.byteStart, token.byteEnd));
    if (original !== token.surface) throw new Error('語の表記が原文と合わない');
    if (!token.isUnknown && token.reading !== null && KANJI.test(token.surface) && KATAKANA_READING.test(token.reading)) {
      out += katakanaToHiragana(token.reading);
      replacedWords++;
    } else {
      out += original;
    }
    position = token.byteEnd;
  }
  out += decoder.decode(bytes.subarray(position));
  return { text: out, replacedWords };
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
}
