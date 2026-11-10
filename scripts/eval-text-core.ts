// 同梱する評価テキストを、原文から作る規則。取得や書き出しは持たない（generate-eval-texts.tsが使う）。
// 青空文庫の記法の除去はaozora-core.tsが受け持つ。ここは、Wikipediaの記事から本文の段落を選ぶ規則と、
// 評価に渡す字数を予算にして文の単位で取る規則を持つ。
import { isAlphanumericChar, isSymbolChar } from '../src/input/text/evaluation-text.ts';

/** この行から後ろは本文でない節（出典・関連項目・外部リンクなど）。Wikipediaの記事は節の見出しが1行で入っている。 */
const TAIL_HEADINGS: ReadonlySet<string> = new Set([
  '脚注',
  '注釈',
  '出典',
  '関連項目',
  '参考文献',
  '外部リンク',
  '参照',
  '脚注・出典',
  '注釈・出典',
  '脚注・参考文献',
  '参考資料',
  '文献',
  '関連文献',
  '注・出典',
  '脚注と出典',
]);

/** 段落として残す最短の字数。見出し・箇条書き・表の行を外すための下限。 */
const MIN_PARAGRAPH_CHARS = 40;

/** 数式や表の記法が残った行を外すための印。 */
const MARKUP_RESIDUE = /[\\{}|<>]/;

/** 先頭の語が欠けた段落を外すための印。取得元のデータは、記事の書式の部品を展開した時に語が欠けることがある。 */
const BROKEN_START = /^(?:は、|とは、|[がをにのへ。、）])/;

/** 中身が欠けた空の鉤括弧。この括弧を含む段落は、語が欠けているので外す。 */
const EMPTY_QUOTES = /「」|『』/;

/** 語が欠けた跡の印。空白が2つ以上続く所と、空白の直後に読点か閉じ括弧が来る所。この跡を含む段落は外す。 */
const GAP_RESIDUE = /\s{2,}|\s[、）]/;

/**
 * 記事の書式の部品を展開した時に欠けた語の跡を整える。中身が読点と空白だけの括弧を取り除き、括弧の中の読点の余りを詰める。
 * 括弧の外の文は変わらない。
 */
export function tidyWikipediaLine(line: string): string {
  return line
    .replace(/[（(][、，,\s]*[）)]/g, '')
    .replace(/、+）/g, '）')
    .replace(/（、+/g, '（')
    .replace(/、{2,}/g, '、');
}

/**
 * Wikipediaの記事の本文から、地の文の段落を選ぶ。
 *
 * 40字未満の行と句点の無い行（見出し・箇条書き・表の行）、数式や表の記法が残った行、語が欠けた行（先頭の語・鉤括弧の中身・空白の跡）を除き、
 * 脚注や関連項目などの節の見出しから後ろを捨てる。英字と数字は原文のまま残す。
 */
export function wikipediaParagraphs(raw: string): string[] {
  const paragraphs: string[] = [];
  for (const line of raw.replace(/\r\n?/g, '\n').split('\n')) {
    const trimmed = line.trim();
    if (TAIL_HEADINGS.has(trimmed)) break;
    const text = tidyWikipediaLine(trimmed);
    if ([...text].length < MIN_PARAGRAPH_CHARS || !text.includes('。')) continue;
    if (MARKUP_RESIDUE.test(text) || BROKEN_START.test(text) || EMPTY_QUOTES.test(text) || GAP_RESIDUE.test(text)) continue;
    paragraphs.push(text);
  }
  return paragraphs;
}

/** 青空文庫の本文から、空でない段落（行）を取り出す。段落の先頭の全角空白は取り除く。 */
export function aozoraParagraphs(converted: string): string[] {
  return converted
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

const OPENING = '「『（(〔［【';
const CLOSING = '」』）)〕］】';

/** 段落を文に分ける。句点の後で切るが、括弧や鉤括弧の中の句点では切らない。 */
export function splitSentences(paragraph: string): string[] {
  const sentences: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of paragraph) {
    current += char;
    if (OPENING.includes(char)) depth++;
    else if (CLOSING.includes(char)) depth = Math.max(0, depth - 1);
    else if (char === '。' && depth === 0) {
      sentences.push(current);
      current = '';
    }
  }
  if (current !== '') sentences.push(current);
  return sentences;
}

/** 文の位置。段落の番号と、段落の中の文の番号。 */
export interface SentenceRef {
  readonly paragraph: number;
  readonly sentence: number;
}

export interface Passage {
  /** 取った文。段落の境目は `\n` で表す。 */
  readonly text: string;
  /** 取った文の数。 */
  readonly sentences: number;
  /** 取った範囲の、評価に渡す字数。 */
  readonly evalChars: number;
  /** 次に取る位置（段落ごとの文の通し番号）。続きを別の取り出しに使う。 */
  readonly next: number;
}

/**
 * 段落の列から、文の通し番号 `from` 以降を、評価に渡す字数が `budget` に近くなるまで取る。
 * 文の途中では切らない。次の文を足すと予算から遠ざかる所で止めるので、取った字数は予算を上下する。
 * 1文は必ず取る。続きが足りなければ取れた分だけを返す。
 */
export function takePassage(paragraphs: readonly string[], from: number, budget: number, evalChars: (sentence: string) => number): Passage {
  const flat: { paragraph: number; text: string }[] = [];
  paragraphs.forEach((paragraph, index) => {
    for (const text of splitSentences(paragraph)) flat.push({ paragraph: index, text });
  });
  let total = 0;
  let cursor = from;
  const chunks: string[] = [];
  let lastParagraph = -1;
  while (cursor < flat.length) {
    const item = flat[cursor]!;
    const chars = evalChars(item.text);
    if (cursor > from && total + chars / 2 >= budget) break;
    if (chunks.length > 0 && item.paragraph !== lastParagraph) chunks.push('\n');
    chunks.push(item.text);
    lastParagraph = item.paragraph;
    total += chars;
    cursor++;
  }
  return { text: chunks.join(''), sentences: cursor - from, evalChars: total, next: cursor };
}

/** 読みに直した後のテキストのうち、既定の条件で評価に渡す字数。記号は `、` `。` と半角の `,` `.` だけを残し、英字と数字は取り除く。 */
export function defaultEvalChars(reading: string): number {
  let count = 0;
  for (const char of reading) {
    if (/\s/u.test(char)) {
      count++;
      continue;
    }
    if (isAlphanumericChar(char)) continue;
    if (isSymbolChar(char) && !'、。,.'.includes(char)) continue;
    count++;
  }
  return count;
}
