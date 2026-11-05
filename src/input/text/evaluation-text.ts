import type { TextLanguage } from './language.ts';

/**
 * 評価に渡すテキストを作る前処理（仕様 §4.6）。日本語のテキストにだけ当て、英語のテキストは何も変えない。
 *
 * 2. 半角の `,` `.` を、配列が見出しとして直接持たない時だけ `、` `。` に書き換える
 * 3. 記号を取り除く。既定は `、` `。`（2.で書き換えた `,` `.` を含む）と、配列が見出しとして直接持つ半角の `,` `.` だけを残し、
 *    `keepSymbols` なら記号をすべて残す
 * 4. 全角の片仮名（`ァ`〜`ヴ`）を、配列が見出しとして持たない部分だけひらがなに書き換える。
 *    見出しの切り出しが `generateTrace` と同じテキスト（2.と3.の後）の上で行われるよう、最後に当てる
 *
 * 漢字を読みに直す段（仕様 §4.6の1段目）はこの関数の前に済んでいる。以下の番号は仕様 §4.6の段の番号。
 * 記号は、Unicodeの文字・結合文字・数字・空白のどれでもない文字。
 */

export interface EvaluationTextOptions {
  readonly language: TextLanguage;
  /** 記号をすべて残すか（条件 `keepSymbols`）。 */
  readonly keepSymbols: boolean;
  /** 配列が、その1文字を見出しとして直接持つか。半角の `,` `.` を書き換えるかの判定に使う。 */
  readonly layoutHasChar: (char: string) => boolean;
  /**
   * 渡したテキストを、`generateTrace` と同じ切り出しで見出しに当てた時に、どの見出しにも入らない文字の位置（コードポイント）。
   * 片仮名の書き換えが、残す片仮名を決めるのに使う。
   */
  readonly uncoveredPositions: (text: string) => readonly number[];
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
 *
 * 見出しに入る片仮名は、`generateTrace` が見出しを切り出す処理そのものに決めさせる。まず原文のまま切り出し、
 * どの見出しにも入らない片仮名をひらがなに書き換える。書き換えると隣の切り出しが変わるので、
 * 書き換えた後のテキストでもう一度切り出し、新しく見出しに入らなくなった片仮名を書き換える。
 * 書き換える一方なので、繰り返すと止まる。
 * 1文字ずつ判定すると、`ヴァ` を見出しに持つ配列でも `ヴ` と `ァ` に割れて見出しに当たらなくなる。
 */
function katakanaToHiraganaByHeadings(text: string, uncoveredPositions: (text: string) => readonly number[]): string {
  const chars = [...text];
  for (;;) {
    const targets = uncoveredPositions(chars.join('')).filter((position) => CONVERTIBLE_KATAKANA.test(chars[position]!));
    if (targets.length === 0) return chars.join('');
    for (const position of targets) chars[position] = convertKatakanaChar(chars[position]!);
  }
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

/**
 * 日本語のテキストの前処理（2.と3.）の後も、その1文字が残るか。半角の `,` `.` は書き換えられても1文字のまま残る。
 * 前処理で文字が減るのは、記号を取り除く段だけ。
 */
function remainsAfterPreparation(char: string, keepSymbols: boolean): boolean {
  return HALFWIDTH_PUNCTUATION[char] !== undefined || keepSymbols || !isSymbolChar(char) || DEFAULT_KEPT_SYMBOLS.has(char);
}

/**
 * 日本語のテキストの一部分が、前処理（記号の範囲の処理）の後に何字残るか（コードポイント）。
 * 読みに置き換えた語の、表記の字数を数えるのに使う（仕様 §11.5の `W`）。
 */
export function countCharsAfterPreparation(text: string, keepSymbols: boolean): number {
  let count = 0;
  for (const char of text) if (remainsAfterPreparation(char, keepSymbols)) count++;
  return count;
}

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
  return hasConvertibleKatakana(out) ? katakanaToHiraganaByHeadings(out, options.uncoveredPositions) : out;
}

/**
 * 読みのテキストの区切り（コードポイントの位置）を、評価に渡すテキストのコードポイントの位置へ写す。
 * 前処理（`prepareEvaluationText`）で文字が減るのは、記号を取り除く段だけ（半角の `,` `.` の書き換えと片仮名の書き換えは1文字を1文字に直す）。
 * そこで、区切りより前に残る文字の数を、区切りの新しい位置にする。
 * 先頭・末尾に来た区切りと、取り除いた記号に挟まれて重なった区切りは除く。結果は昇順で重複しない。
 * 日本語以外のテキストは前処理が何も変えないので、区切りをそのまま返す。
 */
export function evaluationBoundaries(
  readingText: string,
  boundaries: readonly number[],
  options: Pick<EvaluationTextOptions, 'language' | 'keepSymbols'>,
): number[] {
  const chars = [...readingText];
  const kept: number[] = [0];
  for (const char of chars) {
    const keeps = options.language !== 'ja' || remainsAfterPreparation(char, options.keepSymbols);
    kept.push(kept[kept.length - 1]! + (keeps ? 1 : 0));
  }
  const total = kept[kept.length - 1]!;
  const mapped = new Set<number>();
  for (const boundary of boundaries) {
    if (boundary < 0 || boundary > chars.length) continue;
    const position = kept[boundary]!;
    if (position > 0 && position < total) mapped.add(position);
  }
  return [...mapped].sort((a, b) => a - b);
}
