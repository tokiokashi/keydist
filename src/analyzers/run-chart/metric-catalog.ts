import type { TextLanguage } from '#input/text/language.ts';
import { sharedMetricText } from '../metric-labels.ts';
import { kanaUnitOf } from '../unit-words.ts';
import { SPAN_METRIC_IDS, type SpanMetricId } from '#interpretation/span-metrics.ts';

/**
 * Run Chartで縦軸に描ける指標の表示の決まり。
 *
 * 値の定義（範囲ごとの分子と分母）は `interpretation/span-metrics.ts` が持ち、ここは名前と単位と桁だけを持つ。
 * 名前と単位は、N感度の指標の一覧と同じ指標では同じ文字にそろえる（`analyzers/metric-labels.ts` を共有する）。
 * 入力かな数で割る指標の呼び名は、テキストの言語で出し分ける（英語のテキストでは「字」）。
 * 指標どうしを合成した値や順位は作らない。
 */
export const RUN_CHART_METRIC_IDS = SPAN_METRIC_IDS;
export type RunChartMetricId = SpanMetricId;

export const DEFAULT_RUN_CHART_METRIC: RunChartMetricId = 'perCharUnits';

export interface RunChartMetricDef {
  /** 選択肢と縦軸の見出しに出す指標名。 */
  readonly label: string;
  /** 実測値の単位。率は `%`。 */
  readonly unit: string;
  /** 単位が%の率か。抽出は割合（0〜1）のまま持ち、表示の時に100倍する。 */
  readonly percent: boolean;
  /** 吹き出しと読み上げの実測値の小数桁。 */
  readonly digits: number;
  /** 縦軸の目盛りの小数桁。 */
  readonly tickDigits: number;
}

function buildMetrics(language: TextLanguage): Readonly<Record<RunChartMetricId, RunChartMetricDef>> {
  const shared = sharedMetricText(language);
  const k = kanaUnitOf(language);
  return {
    perCharUnits: { ...shared.perCharUnits, percent: false, digits: 3, tickDigits: 2 },
    meanPerStroke: { ...shared.meanPerStroke, percent: false, digits: 3, tickDigits: 2 },
    sameFingerRate: { ...shared.sameFingerRate, percent: true, digits: 1, tickDigits: 1 },
    perCharSteps: { label: `1${k}あたりのアクション数`, unit: `アクション/${k}`, percent: false, digits: 3, tickDigits: 2 },
  };
}

const METRICS_BY_LANGUAGE: Readonly<Record<TextLanguage, Readonly<Record<RunChartMetricId, RunChartMetricDef>>>> = {
  ja: buildMetrics('ja'),
  en: buildMetrics('en'),
};

/** テキストの言語に合わせた指標の名前と単位。 */
export function runChartMetrics(language: TextLanguage): Readonly<Record<RunChartMetricId, RunChartMetricDef>> {
  return METRICS_BY_LANGUAGE[language];
}

/** 抽出の値（割合のまま）を、画面に出す単位の値にする。率かどうかは言語に依らない。 */
export function displayValue(metric: RunChartMetricId, value: number): number {
  return METRICS_BY_LANGUAGE.ja[metric].percent ? value * 100 : value;
}

/** 表の数字の小数桁。桁は言語に依らない。 */
export function metricDigits(metric: RunChartMetricId): number {
  return METRICS_BY_LANGUAGE.ja[metric].digits;
}

/** 数字に単位を付ける。英字で始まる単位（u/かな）は空白を挟み、%と日本語の単位は続けて書く。 */
function withUnit(text: string, unit: string): string {
  return /^[A-Za-z]/.test(unit) ? `${text} ${unit}` : `${text}${unit}`;
}

/** 単位を付けた値の文字。`value` は抽出の値（割合のまま）。 */
export function formatMetricValue(metric: RunChartMetricId, value: number, language: TextLanguage, digits?: number): string {
  const def = runChartMetrics(language)[metric];
  return withUnit(displayValue(metric, value).toFixed(digits ?? def.digits), def.unit);
}

/** 縦軸の見出し。 */
export function axisTitle(metric: RunChartMetricId, windowChars: number, language: TextLanguage): string {
  const def = runChartMetrics(language)[metric];
  return `${def.label} [${def.unit}]（直近${windowChars}${kanaUnitOf(language)}）`;
}
