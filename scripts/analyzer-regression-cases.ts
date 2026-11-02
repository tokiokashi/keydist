import { LAYOUTS, LAYOUTS_JA, type Layout } from '#input/layouts/index.ts';
import { containsKanji } from '#input/text/reading.ts';
import { sampleText, SAMPLE_TEXTS, type TextLanguage } from '#input/text/samples.ts';

/** 既定条件で回帰の記録に載せるケースの組。 */
export interface DefaultConditionCase {
  language: TextLanguage;
  layout: Layout;
  sampleId: string;
}

/**
 * 既定条件で測る「組み込み配列 × 適用可能なサンプル」の組の全部。
 * 回帰の記録の生成と、記録に全部載っているかの検査が同じ一覧を読む。
 * 漢字を含む日本語サンプルは、読みに直す段（辞書が要る）を通してから評価するので含めない。
 */
export function defaultConditionCases(): DefaultConditionCase[] {
  const cases: DefaultConditionCase[] = [];
  for (const layout of LAYOUTS) {
    for (const sampleId of Object.keys(SAMPLE_TEXTS.en)) cases.push({ language: 'en', layout, sampleId });
  }
  const kanaSampleIds = Object.keys(SAMPLE_TEXTS.ja).filter((sampleId) => !containsKanji(sampleText('ja', sampleId)));
  for (const layout of LAYOUTS_JA) {
    for (const sampleId of kanaSampleIds) cases.push({ language: 'ja', layout, sampleId });
  }
  return cases;
}

/** 回帰の記録でのケースの id。手書きの非既定ケースは末尾に `:<note>` が付くので、この id とは一致しない。 */
export function defaultConditionCaseId(c: DefaultConditionCase): string {
  return `${c.language}:${c.layout.id}:${c.sampleId}`;
}
