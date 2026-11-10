import { LAYOUTS, LAYOUTS_JA, type Layout } from '#input/layouts/index.ts';
import { containsKanji } from '#input/text/reading.ts';
import { sampleText, SAMPLE_TEXTS, type TextLanguage } from '#input/text/samples.ts';
import { KANA_TEST_TEXT } from '../test/kana-test-text.ts';

/**
 * 回帰の記録に載せる、漢字を含まない日本語のテキストのid。同梱のテキストは漢字を含み、読みに直す段（辞書）が要るので、
 * 辞書を使わずに日本語の配列を通すためのかな文（`KANA_TEST_TEXT`）をこのidで持つ。
 */
export const KANA_REGRESSION_SAMPLE_ID = 'kana';

/** 回帰の記録のケースが指すテキスト。前処理（空白畳み込み）は同梱のテキストと同じ。 */
export function regressionText(language: TextLanguage, sampleId: string): string {
  return language === 'ja' && sampleId === KANA_REGRESSION_SAMPLE_ID ? KANA_TEST_TEXT : sampleText(language, sampleId);
}

/** 既定条件で回帰の記録に載せるケースの組。 */
export interface DefaultConditionCase {
  language: TextLanguage;
  layout: Layout;
  sampleId: string;
}

/**
 * 既定条件で測る「組み込み配列 × 適用可能なサンプル」の組の全部。
 * 回帰の記録の生成と、記録に全部載っているかの検査が同じ一覧を読む。
 * 漢字を含む日本語の同梱のテキストは、読みに直す段（辞書が要る）を通してから評価するので含めず、かな文（`KANA_REGRESSION_SAMPLE_ID`）で日本語の配列を通す。
 */
export function defaultConditionCases(): DefaultConditionCase[] {
  const cases: DefaultConditionCase[] = [];
  for (const layout of LAYOUTS) {
    for (const sampleId of Object.keys(SAMPLE_TEXTS.en)) cases.push({ language: 'en', layout, sampleId });
  }
  const kanaSampleIds = [KANA_REGRESSION_SAMPLE_ID, ...Object.keys(SAMPLE_TEXTS.ja).filter((sampleId) => !containsKanji(sampleText('ja', sampleId)))];
  for (const layout of LAYOUTS_JA) {
    for (const sampleId of kanaSampleIds) cases.push({ language: 'ja', layout, sampleId });
  }
  return cases;
}

/** 回帰の記録でのケースのid。手書きの非既定ケースは末尾に `:<note>` が付くので、このidとは一致しない。 */
export function defaultConditionCaseId(c: DefaultConditionCase): string {
  return `${c.language}:${c.layout.id}:${c.sampleId}`;
}
