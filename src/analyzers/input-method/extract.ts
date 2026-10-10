import { defineSingleAnalyzer, type SingleAnalyzerDefinition } from '#analyzers/contract.ts';
import { plainDisciplineContext } from '#analyzers/discipline-material.ts';
import { DEFAULT_INPUT_METHOD_OPTIONS, inputMethodOptions, type InputMethodOptions } from './options.ts';

/**
 * 入力方法の抽出。修飾の一覧・キーを選んで出る文字を調べる図・コンボの一覧と配列図は、
 * 配列の定義から出す（`layout-breakdown.ts`・`key-pattern-selection.ts`）ので、テキストを打った結果から取り出す値は無い。
 */
export type InputMethodExtracted = Readonly<Record<string, never>>;

/** engine（`engine/cache.ts` の `getExtraction`）が呼ぶ、Analyzer契約の実体。 */
export const inputMethodDefinition: SingleAnalyzerDefinition<InputMethodOptions, InputMethodExtracted> = defineSingleAnalyzer({
  id: 'input-method',
  options: inputMethodOptions,
  extract: () => ({}),
  optionsDiscipline: {
    sample: DEFAULT_INPUT_METHOD_OPTIONS,
    alternates: DEFAULT_INPUT_METHOD_OPTIONS,
    context: plainDisciplineContext,
  },
});
