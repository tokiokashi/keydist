import { defineSingleAnalyzer, type SingleAnalyzerDefinition } from '#analyzers/contract.ts';
import { plainDisciplineContext } from '#analyzers/discipline-material.ts';
import { DEFAULT_KEYMAP_OPTIONS, keymapOptions, type KeymapOptions } from './options.ts';

/**
 * キーマップの抽出。修飾の一覧・キーを選んで出る文字を調べる図・コンボの一覧と配列図は、
 * 配列の定義から出す（`layout-breakdown.ts`・`key-pattern-selection.ts`）ので、テキストを打った結果から取り出す値は無い。
 */
export type KeymapExtracted = Readonly<Record<string, never>>;

/** engine（`engine/cache.ts` の `getExtraction`）が呼ぶ、Analyzer契約の実体。 */
export const keymapDefinition: SingleAnalyzerDefinition<KeymapOptions, KeymapExtracted> = defineSingleAnalyzer({
  id: 'keymap',
  options: keymapOptions,
  extract: () => ({}),
  optionsDiscipline: {
    sample: DEFAULT_KEYMAP_OPTIONS,
    alternates: DEFAULT_KEYMAP_OPTIONS,
    context: plainDisciplineContext,
  },
});
