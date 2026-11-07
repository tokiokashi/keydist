import type { TextLanguage } from '#input/text/language.ts';
import { type KanaScript, kanaUnitOf } from './unit-words.ts';

/**
 * 複数のAnalyzerが縦軸に描く指標のうち、名前と単位が同じ指標の表示の文字。
 * 値の定義は `interpretation/` が持ち、ここは画面に出す文字だけを持つ（Analyzerどうしは互いをimportできないので、ここに置く）。
 * 入力かな数で割る指標の呼び名は、テキストの言語で出し分ける（英語のテキストでは「字」。`unit-words.ts`）。
 * `script`は日本語のテキストの単位の語の書き方で、散布図だけが「カナ」で読む。
 */
export interface SharedMetricText {
  readonly label: string;
  readonly unit: string;
}

export interface SharedMetricTexts {
  readonly perCharUnits: SharedMetricText;
  readonly perCharSteps: SharedMetricText;
  readonly meanPerStroke: SharedMetricText;
  readonly perPressUnits: SharedMetricText;
  readonly sameFingerRate: SharedMetricText;
}

export function sharedMetricText(language: TextLanguage, script: KanaScript = 'hiragana'): SharedMetricTexts {
  const k = kanaUnitOf(language, script);
  return {
    perCharUnits: { label: `1${k}で動く距離`, unit: `u/${k}` },
    perCharSteps: { label: `1${k}を打つアクション数`, unit: `アクション/${k}` },
    meanPerStroke: { label: '1アクションで動く距離', unit: 'u/アクション' },
    perPressUnits: { label: '1キーで動く距離', unit: 'u/キー' },
    sameFingerRate: { label: '同指率', unit: '%' },
  };
}
