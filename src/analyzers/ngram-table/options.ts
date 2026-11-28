import * as v from 'valibot';
import { defineOption, defineOptions, integerUrlCodec, picklistUrlCodec } from '#analyzers/options.ts';
import { BUNSETSU_LOOKAHEAD } from '#interpretation/ngram-table-analysis.ts';

/**
 * 表による解析の解析設定（定義は `spec/distance-model.md` §13）。
 *
 * - `order` は表の次数。言語の側をどこまで再現するかを表す。選べる次数は表の元のテキストが決める（§13.5）ので、
 *   ここは次数の上限（同梱する表を作る時に統計を確かめる最大の次数）までの整数とし、選べるかの判定は表を読んだペインが行う。
 *   既定は選べる次数の最大で、同梱の表（今は0次だけが選べる）が変わったら既定も変わる。値は、同梱の表の既定の次数と一致することをテストが確かめる
 * - `lookahead` は文節で数える先読み `N`（§13.3）。打つ人がどこまで先を読むかを表す。表の次数とは独立に選べ、選べる範囲と既定は次数で変えない
 *
 * - `source` は表の元。標準のコーパスか、アプリで選んだテキスト（利用者のテキスト）から作った表かを選ぶ。
 *   表の元が変わると、選べる次数と既定の次数が変わりうる（§13.5）ので、保存した次数が選べない時は、その表の既定の次数で解析する
 *
 * 3つとも出力される数値が動く項目で、今このAnalyzerだけが読むので、このAnalyzerの解析設定に置く（AGENTS.md「置き場」）。
 * 今の解析の `N`（かなで数える先読み。条件の「先読みN」）とは別の項目で、どちらも他方を変えない。
 */

/** 解析設定で持てる表の次数の上限。同梱する表を作る時に統計を確かめる最大の次数（`scripts/generate-corpus-ngram-table.ts`）と同じ。 */
export const MAX_TABLE_ORDER = 5;

export const DEFAULT_TABLE_ORDER = 0;

/** 表の元。`corpus` は同梱する標準のコーパス、`text` はアプリで選んだテキスト。 */
export const TABLE_SOURCES = ['corpus', 'text'] as const;
export type TableSourceChoice = (typeof TABLE_SOURCES)[number];

export const DEFAULT_TABLE_SOURCE: TableSourceChoice = 'corpus';

/** 表の元の選択肢の名前。 */
export const TABLE_SOURCE_LABELS: Readonly<Record<TableSourceChoice, string>> = {
  corpus: '標準のコーパス',
  text: '選んだテキスト',
};

export const ngramTableOptions = defineOptions({
  source: defineOption<TableSourceChoice>({
    schema: v.picklist(TABLE_SOURCES),
    default: DEFAULT_TABLE_SOURCE,
    affects: 'extract',
    url: picklistUrlCodec('source', TABLE_SOURCES),
    label: '表の元',
  }),
  order: defineOption<number>({
    schema: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_TABLE_ORDER)),
    default: DEFAULT_TABLE_ORDER,
    affects: 'extract',
    url: integerUrlCodec('order', 0, MAX_TABLE_ORDER),
    label: '表の次数',
  }),
  lookahead: defineOption<number>({
    schema: v.pipe(v.number(), v.integer(), v.minValue(BUNSETSU_LOOKAHEAD.min), v.maxValue(BUNSETSU_LOOKAHEAD.max)),
    default: BUNSETSU_LOOKAHEAD.default,
    affects: 'extract',
    url: integerUrlCodec('lookahead', BUNSETSU_LOOKAHEAD.min, BUNSETSU_LOOKAHEAD.max),
    label: '文節の先読み',
  }),
});

export type NgramTableOptions = typeof ngramTableOptions.defaultOptions;

export const DEFAULT_NGRAM_TABLE_OPTIONS: NgramTableOptions = ngramTableOptions.defaultOptions;

/** 入れ忘れ防止テスト（`optionsDiscipline`）用の、既定値と異なる妥当な値の組。 */
export const ALTERNATE_NGRAM_TABLE_OPTIONS: NgramTableOptions = { source: 'text', order: 1, lookahead: 3 };
