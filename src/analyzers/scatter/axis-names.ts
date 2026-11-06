import type { TextLanguage } from '#input/text/language.ts';
import { comparisonColumnText, type ComparisonColumnId } from '../comparison-column-text.ts';
import { sharedMetricText } from '../metric-labels.ts';
import { type KanaScript, kanaUnitOf, type KanaUnit } from '../unit-words.ts';

/**
 * 散布図の軸の名前と単位。軸に取れる比較表の列ごとに、量を言葉で言った名前と単位を宣言する。
 * 比較表の見出しは短さを優先して単位を付けない（`comparison-column-text.ts`）ので、図の軸にはこちらの名前を使う。
 * 列を足した時は、ここに宣言が無いと型エラーになる。
 *
 * 単位は、距離を測る列が`u`、値に`%`が付く率の列が`%`、1uあたりの量が`1/u`。
 * 個数と、個数どうしの比は無次元なので単位を付けない。
 * 画面の凡例には「名前（単位）」を、キャプション・点の読み取り・図の見方の文には単位を除いた名前を使う。
 * 軸の名前だけは、狭い軸に収まるよう「量/何あたり」の形に縮めた名前（`axisLabel`）を使える。
 */
export type AxisUnit = 'u' | '%' | '1/u';

/**
 * 散布図の画面で、日本語のテキストの単位の語を書く字の種類。散布図の量の名前は「1カナあたりの〜」のように単位の語がひらがなの文に入るので、
 * 前後のひらがなと区別できるようカタカナで書く。比較表の列名・説明を読む時も、この書き方で読む。
 */
export const SCATTER_KANA_SCRIPT: KanaScript = 'katakana';

interface AxisNameSpec {
  /**
   * 量の名前。単位は含めない。単位の語「カナ」はテキストの言語で出し分ける（英語のテキストでは「字」）。
   * 省くと比較表の列名を使う。列名がすでに量を言い表している列（「同指率」「Bigram数（物理キー）」など）だけ省く。
   */
  readonly name?: (kana: KanaUnit, language: TextLanguage) => string;
  readonly unit?: AxisUnit;
  /**
   * 軸の名前に使う縮めた名前。単位は含めない。「量/何あたり」の形で、何あたりかを残す。「カナ」は`name`と同じくテキストの言語で出し分ける。比較表の列名と同じ文になる列は、列名をそのまま使う。
   * 宣言の無い列は`name`のまま軸に出す。
   */
  readonly axisLabel?: (kana: KanaUnit, language: TextLanguage) => string;
}

/** 押したキーの数。比較表には1かなあたりの列しか無いので、関係式で総数の形の名前が要る時はこれを使う。 */
export const KEY_COUNT_NAME = 'キー数';

const SPECS: Readonly<Record<ComparisonColumnId, AxisNameSpec>> = {
  actions: {},
  totalUnits: { name: () => '総移動距離', unit: 'u' },
  meanPerStroke: {
    name: (_k, language) => sharedMetricText(language, SCATTER_KANA_SCRIPT).meanPerStroke.label,
    unit: 'u',
    axisLabel: () => '距離/アクション',
  },
  perCharUnits: { name: (_k, language) => sharedMetricText(language, SCATTER_KANA_SCRIPT).perCharUnits.label, unit: 'u', axisLabel: (k) => `距離/${k}` },
  perCharSteps: {
    name: (_k, language) => sharedMetricText(language, SCATTER_KANA_SCRIPT).perCharSteps.label,
    axisLabel: (_k, language) => comparisonColumnText(language, SCATTER_KANA_SCRIPT).perCharSteps.label,
  },
  perCharPresses: { name: (k) => `1${k}あたりの${KEY_COUNT_NAME}`, axisLabel: (k) => `${KEY_COUNT_NAME}/${k}` },
  perActionPresses: { name: () => `1アクションあたりの${KEY_COUNT_NAME}`, axisLabel: () => `${KEY_COUNT_NAME}/アクション` },
  perPressUnits: { name: (_k, language) => sharedMetricText(language, SCATTER_KANA_SCRIPT).perPressUnits.label, unit: 'u', axisLabel: () => '距離/キー' },
  singleTapLayerRate: { unit: '%' },
  singleTapRate: { unit: '%' },
  singleKeyRate: { unit: '%' },
  sameFinger: { name: () => '同指の回数' },
  sameFingerRate: { unit: '%' },
  adjacentMean: { name: () => '隣り合う指の間隔の広がり', unit: 'u' },
  adjacentStdDev: { name: () => '隣り合う指の間隔のばらつき', unit: 'u' },
  rightHandDistanceShare: { unit: '%' },
  rightHandPressShare: { unit: '%' },
  movedPressShare: { unit: '%' },
  perMovedPressUnits: { name: () => '移動ありキー1つあたりの距離', unit: 'u', axisLabel: () => '距離/移動ありキー' },
  textCharsPerAction: { name: () => '1アクションあたりの文字数', axisLabel: () => '文字数/アクション' },
  actionsPerUnit: { name: () => '1uあたりのアクション数', unit: '1/u', axisLabel: () => 'アクション数/距離' },
  textCharsPerUnit: { name: () => '1uあたりの文字数', unit: '1/u', axisLabel: () => '文字数/距離' },
  unitsPerTextChar: { name: () => '1文字あたりの距離', unit: 'u', axisLabel: () => '距離/文字' },
  physicalBigramCombinations: {},
  logicalBigramCombinations: {},
  alternationCoverage: { unit: '%' },
  sameHandContinuationRate: { unit: '%' },
  handSwitches: { name: () => '手の切り替えの回数' },
  handContinuations: { name: () => '同じ手の続きの回数' },
  bothHandPairShare: { unit: '%' },
  bothHandStrokes: { name: () => '両手のアクション数' },
  alternationRuns: {},
  alternationMeanLength: {},
  alternationMaxLength: {},
};

/** 量の名前。単位は含めない。キャプション・点の読み取り・図の見方の文で使う。 */
export function axisName(column: ComparisonColumnId, language: TextLanguage): string {
  return SPECS[column].name?.(kanaUnitOf(language, SCATTER_KANA_SCRIPT), language) ?? comparisonColumnText(language, SCATTER_KANA_SCRIPT)[column].label;
}

/** 列の単位。無次元の列は`undefined`。 */
export function axisUnit(column: ComparisonColumnId): AxisUnit | undefined {
  return SPECS[column].unit;
}

/** 軸の名前と凡例に出す、単位つきの名前。単位が無い列は名前だけ。 */
export function axisTitle(column: ComparisonColumnId, language: TextLanguage): string {
  const unit = axisUnit(column);
  const name = axisName(column, language);
  return unit === undefined ? name : `${name}（${unit}）`;
}

/** 軸の名前に出す、単位つきの名前。縮めた名前を宣言していない列は`axisTitle`と同じ。 */
export function axisPlotTitle(column: ComparisonColumnId, language: TextLanguage): string {
  const label = SPECS[column].axisLabel;
  if (label === undefined) return axisTitle(column, language);
  const unit = axisUnit(column);
  const name = label(kanaUnitOf(language, SCATTER_KANA_SCRIPT), language);
  return unit === undefined ? name : `${name}（${unit}）`;
}
