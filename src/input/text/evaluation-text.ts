import type { TextLanguage } from './language.ts';

/**
 * 評価に渡すテキストを作る前処理（仕様 §4.6）。日本語のテキストにだけ当て、英語のテキストは何も変えない。
 *
 * 1. 半角の `,` `.` を、配列が見出しとして直接持たない時だけ `、` `。` に書き換える
 * 2. 記号を取り除く。既定は `、` `。` だけを残し、`keepSymbols` なら記号をすべて残す
 *
 * 記号は、Unicodeの文字・結合文字・数字・空白のどれでもない文字。
 */

export interface EvaluationTextOptions {
  readonly language: TextLanguage;
  /** 記号をすべて残すか（条件 `keepSymbols`）。 */
  readonly keepSymbols: boolean;
  /** 配列が、その1文字を見出しとして直接持つか。半角の `,` `.` を書き換えるかの判定に使う。 */
  readonly layoutHasChar: (char: string) => boolean;
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
  for (const char of text) {
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
