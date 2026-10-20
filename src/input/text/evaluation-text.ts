import type { TextLanguage } from './language.ts';

/**
 * 評価に渡すテキストを作る前処理（仕様 §4.6）。日本語のテキストにだけ当て、英語のテキストは何も変えない。
 *
 * 1. 全角の片仮名（`ァ`〜`ヴ`）を、配列が見出しとして持たない部分だけひらがなに書き換える
 * 2. 半角の `,` `.` を、配列が見出しとして直接持たない時だけ `、` `。` に書き換える
 * 3. 記号を取り除く。既定は `、` `。` だけを残し、`keepSymbols` なら記号をすべて残す
 *
 * 漢字を読みに直す段（仕様 §4.6の1段目）はこの関数の前に済んでいる。
 * 記号は、Unicodeの文字・結合文字・数字・空白のどれでもない文字。
 */

export interface EvaluationTextOptions {
  readonly language: TextLanguage;
  /** 記号をすべて残すか（条件 `keepSymbols`）。 */
  readonly keepSymbols: boolean;
  /** 配列が、その1文字を見出しとして直接持つか。半角の `,` `.` を書き換えるかの判定に使う。 */
  readonly layoutHasChar: (char: string) => boolean;
  /**
   * 配列が、その文字列を見出しとして持つか。ローマ字のテーブルの見出しを含む。
   * 片仮名を含む見出し（`ヴ` `ヴァ` `ヴぇい` など）をひらがなに書き換えずに残すかの判定に使う。
   */
  readonly layoutHasHeading: (heading: string) => boolean;
  /** 片仮名を含む見出しのうち最長のもののコードポイント数。見出しが無ければ0。 */
  readonly maxKatakanaHeadingLength: number;
}

/** ひらがなに対応する全角の片仮名（`ァ`〜`ヴ`）。`ヵ` `ヶ` `ヷ`〜`ヺ` と半角の片仮名は含まない。 */
const CONVERTIBLE_KATAKANA = /[\u30A1-\u30F4]/u;

/** 片仮名とひらがなの文字コードの差。 */
const KATAKANA_TO_HIRAGANA_OFFSET = 0x60;

/** 書き換える対象の片仮名を含むか。配列の見出しのうち、書き換えの判定に関わるものを選ぶのに使う。 */
export function hasConvertibleKatakana(text: string): boolean {
  return CONVERTIBLE_KATAKANA.test(text);
}

function convertKatakanaChar(char: string): string {
  return CONVERTIBLE_KATAKANA.test(char) ? String.fromCodePoint(char.codePointAt(0)! - KATAKANA_TO_HIRAGANA_OFFSET) : char;
}

/**
 * 片仮名をひらがなに書き換える。配列が見出しとして持つ片仮名の文字列は、書き換えずに残す。
 * 見出しは仕様 §4.3と同じく最長一致で、原文の上で切り出す。
 * 1文字ずつ判定すると、`ヴァ` を見出しに持つ配列でも `ヴ` と `ァ` に割れて見出しに当たらなくなる。
 */
function katakanaToHiraganaOutsideHeadings(text: string, options: EvaluationTextOptions): string {
  if (!hasConvertibleKatakana(text)) return text;
  const chars = [...text];
  let out = '';
  for (let i = 0; i < chars.length; ) {
    let kept = 0;
    for (let length = Math.min(options.maxKatakanaHeadingLength, chars.length - i); length >= 1; length--) {
      const candidate = chars.slice(i, i + length).join('');
      if (hasConvertibleKatakana(candidate) && options.layoutHasHeading(candidate)) {
        kept = length;
        out += candidate;
        break;
      }
    }
    if (kept > 0) {
      i += kept;
      continue;
    }
    out += convertKatakanaChar(chars[i]!);
    i++;
  }
  return out;
}

const NOT_SYMBOL = /[\p{L}\p{M}\p{N}\s]/u;

/** 記号か（文字・結合文字・数字・空白のどれでもない）。 */
export function isSymbolChar(char: string): boolean {
  return !NOT_SYMBOL.test(char);
}

/** 既定の範囲で残す記号。 */
const DEFAULT_KEPT_SYMBOLS: ReadonlySet<string> = new Set(['、', '。']);

const HALFWIDTH_PUNCTUATION: Readonly<Record<string, string>> = {
  ',': '、',
  '.': '。',
};

export function prepareEvaluationText(text: string, options: EvaluationTextOptions): string {
  if (options.language !== 'ja') return text;
  let out = '';
  for (const char of katakanaToHiraganaOutsideHeadings(text, options)) {
    const punctuation = HALFWIDTH_PUNCTUATION[char];
    if (punctuation !== undefined) {
      // 配列が直接持つ半角はそのまま打つ。持たなければ、既定の範囲に入る `、` `。` として打つ
      out += options.layoutHasChar(char) ? char : punctuation;
      continue;
    }
    if (options.keepSymbols || !isSymbolChar(char) || DEFAULT_KEPT_SYMBOLS.has(char)) out += char;
  }
  return out;
}
