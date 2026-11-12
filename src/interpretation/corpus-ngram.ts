import { evaluationBoundaries, prepareEvaluationText } from '#input/text/evaluation-text.ts';
import { isKanjiChar } from '#input/text/reading.ts';
import { countNgramsInRuns, type NgramTables } from './ngram-table.ts';

/**
 * コーパスの、文節の読みの系列とかなの系列のn-gramの表と、統計が足りているかの量（定義は `docs/corpus-ngram.md`）。
 * 配列の定義と品詞を参照しない。
 */

/** 文節の読みの系列の鍵で、単位をつなぐ文字。前処理が制御文字を取り除くので、読みには現れない。 */
export const BUNSETSU_KEY_SEPARATOR = '\u0000';

/** 統計が足りているとする、文脈が1回だけの割合の上限。 */
export const CONTEXT_SINGLETON_LIMIT = 0.1;

/** 系列を切った文字の数。 */
export interface SequenceCuts {
  /** 空白と改行 */
  readonly whitespace: number;
  /** 読みに直らずに残った漢字 */
  readonly unreadableKanji: number;
}

export interface CorpusSequences {
  /** かなの系列。走りごとのコードポイントの列 */
  readonly kana: readonly (readonly string[])[];
  /** 文節の読みの系列。走りごとの、文節の読みの列 */
  readonly bunsetsu: readonly (readonly string[])[];
  /** 前処理の後の文字数（切った文字を含む） */
  readonly chars: number;
  readonly cuts: SequenceCuts;
}

const WHITESPACE = /\s/u;

/**
 * 読みのテキストと、その上の文節の区切り（コードポイントの位置。先頭と末尾を含まない）から、2つの系列を作る。
 * 前処理は、配列を参照せずに決まる段だけを当てる（`docs/corpus-ngram.md` の「入力」）。
 */
export function buildCorpusSequences(readingText: string, readingBoundaries: readonly number[]): CorpusSequences {
  const scope = { language: 'ja', keepSymbols: false, keepAlphanumerics: false } as const;
  const prepared = prepareEvaluationText(readingText, { ...scope, layoutHasChar: () => false, uncoveredPositions: () => [] });
  const boundaries = new Set(evaluationBoundaries(readingText, readingBoundaries, scope));
  const chars = [...prepared];

  const kana: string[][] = [];
  const bunsetsu: string[][] = [];
  let kanaRun: string[] = [];
  let bunsetsuRun: string[] = [];
  let unit = '';
  let whitespace = 0;
  let unreadableKanji = 0;
  const endUnit = (): void => {
    if (unit !== '') bunsetsuRun.push(unit);
    unit = '';
  };
  const endRun = (): void => {
    endUnit();
    if (kanaRun.length > 0) kana.push(kanaRun);
    if (bunsetsuRun.length > 0) bunsetsu.push(bunsetsuRun);
    kanaRun = [];
    bunsetsuRun = [];
  };
  for (const [index, char] of chars.entries()) {
    const space = WHITESPACE.test(char);
    if (space || isKanjiChar(char)) {
      if (space) whitespace++;
      else unreadableKanji++;
      endRun();
      continue;
    }
    if (boundaries.has(index)) endUnit();
    unit += char;
    kanaRun.push(char);
  }
  endRun();
  return { kana, bunsetsu, chars: chars.length, cuts: { whitespace, unreadableKanji } };
}

/** 次数 `r` の表についての、統計が足りているかの量。 */
export interface OrderSufficiency {
  readonly order: number;
  /** 出現数 `N` */
  readonly occurrences: number;
  /** 並びの種類 */
  readonly grams: number;
  /** 1回だけの並びの数 */
  readonly singletonGrams: number;
  /** 文脈の種類 */
  readonly contexts: number;
  /** 文脈が1回だけの数 `N₁` */
  readonly singletonContexts: number;
  /** `N₁ / N`。出現が無ければundefined */
  readonly contextSingletonRatio: number | undefined;
  /** 1回だけの並びの数 / `N`。出現が無ければundefined */
  readonly gramSingletonRatio: number | undefined;
}

/** 鍵の先頭から、最後の1単位を除いた文字列（文脈）。0次の鍵は空文字列になる。 */
function contextOf(key: string, separator: string): string {
  if (separator === '') {
    const chars = [...key];
    chars.pop();
    return chars.join('');
  }
  const cut = key.lastIndexOf(separator);
  return cut === -1 ? '' : key.slice(0, cut);
}

/** 次数ごとの量。`separator` は、表を数えた時の鍵の区切り。 */
export function ngramSufficiency(tables: NgramTables, separator = ''): OrderSufficiency[] {
  return tables.map((table, order) => {
    let occurrences = 0;
    let singletonGrams = 0;
    const contextCounts = new Map<string, number>();
    for (const [key, count] of table) {
      occurrences += count;
      if (count === 1) singletonGrams++;
      const context = contextOf(key, separator);
      contextCounts.set(context, (contextCounts.get(context) ?? 0) + count);
    }
    let singletonContexts = 0;
    for (const count of contextCounts.values()) if (count === 1) singletonContexts++;
    return {
      order,
      occurrences,
      grams: table.size,
      singletonGrams,
      contexts: contextCounts.size,
      singletonContexts,
      contextSingletonRatio: occurrences === 0 ? undefined : singletonContexts / occurrences,
      gramSingletonRatio: occurrences === 0 ? undefined : singletonGrams / occurrences,
    };
  });
}

/**
 * 統計が足りている最大の次数。0次から順に見て、文脈が1回だけの割合が `limit` 以下の間の最後の次数。
 * 出現が無い次数（割合が決まらない）で止める。0次が決まらない（表が空）時はundefined。
 */
export function sufficientOrder(rows: readonly OrderSufficiency[], limit = CONTEXT_SINGLETON_LIMIT): number | undefined {
  let last: number | undefined;
  for (const row of rows) {
    if (row.contextSingletonRatio === undefined || row.contextSingletonRatio > limit) break;
    last = row.order;
  }
  return last;
}

export interface CorpusNgramTables {
  readonly sequences: CorpusSequences;
  readonly kana: { readonly tables: NgramTables; readonly sufficiency: readonly OrderSufficiency[] };
  readonly bunsetsu: { readonly tables: NgramTables; readonly sufficiency: readonly OrderSufficiency[] };
}

/** 2つの系列の0次から `maxOrder` 次までの表と、次数ごとの量。 */
export function buildCorpusNgramTables(readingText: string, readingBoundaries: readonly number[], maxOrder: number): CorpusNgramTables {
  const sequences = buildCorpusSequences(readingText, readingBoundaries);
  const kanaTables = countNgramsInRuns(sequences.kana, maxOrder);
  const bunsetsuTables = countNgramsInRuns(sequences.bunsetsu, maxOrder, BUNSETSU_KEY_SEPARATOR);
  return {
    sequences,
    kana: { tables: kanaTables, sufficiency: ngramSufficiency(kanaTables) },
    bunsetsu: { tables: bunsetsuTables, sufficiency: ngramSufficiency(bunsetsuTables, BUNSETSU_KEY_SEPARATOR) },
  };
}
