import type { TextLanguage } from '#input/text/language.ts';
import { sharedMetricText } from '../metric-labels.ts';

/**
 * N感度で縦軸に描ける指標の一覧と、その表示の決まり。
 *
 * 一覧は、組み込みの配列・サンプルテキストでN=0〜10を実行して、どれかの配列で値がNによって
 * 変わった指標だけを固定で並べたもの（`metric-catalog.test.ts`が同じ実行で一覧を検査する）。
 * アクション数・キー数・単打面率など、Nで変わらない指標は選択肢に出さない。自作の配列でだけ変わる指標でも、
 * 一覧に無ければ選べない。
 *
 * 値の定義は`interpretation/metrics.ts`の`computeTraceScalars`が持ち、ここは名前と単位と桁だけを持つ。
 * 指標どうしを合成した値や順位は作らない（AGENTS.md「優劣の判定・順位付け・合成スコアを作らない」）。
 */
export const N_SENSITIVITY_METRIC_IDS = [
  'totalUnits',
  'meanPerStroke',
  'perCharUnits',
  'perPressUnits',
  'sameFinger',
  'sameFingerRate',
  'rightHandDistanceShare',
  'rightHandPressShare',
  'adjacentMean',
  'adjacentStdDev',
] as const;

export type NSensitivityMetricId = (typeof N_SENSITIVITY_METRIC_IDS)[number];

export const DEFAULT_N_SENSITIVITY_METRIC: NSensitivityMetricId = 'totalUnits';

export interface NSensitivityMetricDef {
  /** 選択肢と縦軸の見出しに出す指標名。 */
  readonly label: string;
  /** 実測値の単位。率は`%`。 */
  readonly unit: string;
  /** 単位が%の率か。 */
  readonly percent: boolean;
  /**
   * 相対表示の描き方。ratio: N=0を100%とした比。delta: N=0との差。
   * 率は比の比にならないよう差（パーセントポイント）で描く。0や負になりうる値（指間平均）も、
   * 基準が0や負だと比が決まらないので差で描く。0以上の量は比で描く。
   */
  readonly relative: 'ratio' | 'delta';
  /** 表と吹き出しの実測値の小数桁。 */
  readonly digits: number;
  /** 実測値の縦軸の目盛りの小数桁。 */
  readonly tickDigits: number;
}

function buildMetrics(language: TextLanguage): Readonly<Record<NSensitivityMetricId, NSensitivityMetricDef>> {
  const shared = sharedMetricText(language);
  return {
    totalUnits: { label: '距離', unit: 'u', percent: false, relative: 'ratio', digits: 1, tickDigits: 0 },
    meanPerStroke: { ...shared.meanPerStroke, percent: false, relative: 'ratio', digits: 3, tickDigits: 2 },
    perCharUnits: { ...shared.perCharUnits, percent: false, relative: 'ratio', digits: 3, tickDigits: 2 },
    perPressUnits: { label: '1キーあたりの距離', unit: 'u/キー', percent: false, relative: 'ratio', digits: 3, tickDigits: 2 },
    sameFinger: { label: '同指', unit: '回', percent: false, relative: 'ratio', digits: 0, tickDigits: 0 },
    sameFingerRate: { ...shared.sameFingerRate, percent: true, relative: 'delta', digits: 1, tickDigits: 1 },
    rightHandDistanceShare: { label: '右手距離率', unit: '%', percent: true, relative: 'delta', digits: 1, tickDigits: 1 },
    rightHandPressShare: { label: '右手キー率', unit: '%', percent: true, relative: 'delta', digits: 1, tickDigits: 1 },
    adjacentMean: { label: '指間平均', unit: 'u', percent: false, relative: 'delta', digits: 3, tickDigits: 3 },
    adjacentStdDev: { label: '指間σ', unit: 'u', percent: false, relative: 'ratio', digits: 3, tickDigits: 3 },
  };
}

const METRICS_BY_LANGUAGE: Readonly<Record<TextLanguage, Readonly<Record<NSensitivityMetricId, NSensitivityMetricDef>>>> = {
  ja: buildMetrics('ja'),
  en: buildMetrics('en'),
};

/** テキストの言語に合わせた指標の名前と単位。「かな」は英語のテキストでは「字」になる（`unit-words.ts`）。 */
export function nSensitivityMetrics(language: TextLanguage): Readonly<Record<NSensitivityMetricId, NSensitivityMetricDef>> {
  return METRICS_BY_LANGUAGE[language];
}

/** 縦軸の値の種類。ratio: N=0を100%とした比。delta: N=0との差（率はpt、それ以外は指標の単位）。value: 実測値。 */
export type NSensitivityAxisKind = 'ratio' | 'delta' | 'value';

export function axisKindOf(metric: NSensitivityMetricId, scale: 'relative' | 'absolute'): NSensitivityAxisKind {
  if (scale === 'absolute') return 'value';
  return METRICS_BY_LANGUAGE.ja[metric].relative;
}

/**
 * 縦軸に描く値。ratioでN=0の値が0の時は比が決まらないので`null`。
 * 率の相対は、率の率にならないよう比ではなく差を取る。
 */
export function axisValue(kind: NSensitivityAxisKind, base: number, value: number): number | null {
  if (kind === 'value') return value;
  if (kind === 'delta') return value - base;
  return base === 0 ? null : (value / base) * 100;
}

/** 差（delta）の単位。率はパーセントポイント、それ以外は指標の単位。 */
export function deltaUnit(metric: NSensitivityMetricId, language: TextLanguage): string {
  const def = nSensitivityMetrics(language)[metric];
  return def.percent ? 'pt' : def.unit;
}

/** 縦軸の見せ方の選択肢「相対」に付ける説明。 */
export function relativeChoiceLabel(metric: NSensitivityMetricId, language: TextLanguage): string {
  return METRICS_BY_LANGUAGE.ja[metric].relative === 'delta' ? `相対（N=0との差 [${deltaUnit(metric, language)}]）` : '相対（N=0を100%）';
}

/** 数字に単位を付ける。英字で始まる単位（u・u/アクション）は空白を挟み、%と日本語の単位（回）は続けて書く。 */
export function withUnit(text: string, unit: string): string {
  return /^[A-Za-z]/.test(unit) ? `${text} ${unit}` : `${text}${unit}`;
}

/** 単位を付けた実測値の文字。 */
export function formatMetricValue(metric: NSensitivityMetricId, value: number, language: TextLanguage, digits?: number): string {
  const def = nSensitivityMetrics(language)[metric];
  return withUnit(value.toFixed(digits ?? def.digits), def.unit);
}

/** 縦軸の見出し。選んだ指標と、値の種類が読める文。 */
export function axisTitle(metric: NSensitivityMetricId, kind: NSensitivityAxisKind, language: TextLanguage): string {
  const def = nSensitivityMetrics(language)[metric];
  if (kind === 'ratio') return `${def.label}（N=0を100%）`;
  if (kind === 'delta') return `${def.label}（N=0との差 [${deltaUnit(metric, language)}]）`;
  return `${def.label} [${def.unit}]`;
}
