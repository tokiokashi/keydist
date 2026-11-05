import type { TextLanguage } from '#input/text/language.ts';
import { kanaUnitOf } from './unit-words.ts';

/**
 * 複数のAnalyzerが縦軸に描く指標のうち、名前と単位が同じ指標の表示の文字。
 * 値の定義は `interpretation/` が持ち、ここは画面に出す文字だけを持つ（Analyzerどうしは互いをimportできないので、ここに置く）。
 * 入力かな数で割る指標の呼び名は、テキストの言語で出し分ける（英語のテキストでは「字」。`unit-words.ts`）。
 */
export interface SharedMetricText {
  readonly label: string;
  readonly unit: string;
}

export interface SharedMetricTexts {
  readonly perCharUnits: SharedMetricText;
  readonly meanPerStroke: SharedMetricText;
  readonly sameFingerRate: SharedMetricText;
}

export function sharedMetricText(language: TextLanguage): SharedMetricTexts {
  const k = kanaUnitOf(language);
  return {
    perCharUnits: { label: `1${k}あたりの距離`, unit: `u/${k}` },
    meanPerStroke: { label: '1アクションあたりの距離', unit: 'u/アクション' },
    sameFingerRate: { label: '同指率', unit: '%' },
  };
}
