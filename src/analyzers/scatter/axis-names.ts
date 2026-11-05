import type { TextLanguage } from '#input/text/language.ts';
import { comparisonColumnText, type ComparisonColumnId } from '../comparison-column-text.ts';
import { kanaUnitOf, type KanaUnit } from '../unit-words.ts';

/**
 * 散布図の軸の名前と単位。軸に取れる比較表の列ごとに、量を言葉で言った名前と単位を宣言する。
 * 比較表の見出しは短さを優先して単位を付けない（`comparison-column-text.ts`）ので、図の軸にはこちらの名前を使う。
 * 列を足した時は、ここに宣言が無いと型エラーになる。
 *
 * 単位は、距離を測る列が`u`、値に`%`が付く率の列が`%`、1uあたりの量が`1/u`。
 * 個数と、個数どうしの比は無次元なので単位を付けない。
 * 画面の軸・凡例には「名前（単位）」を、キャプション・点の読み取り・図の見方の文には単位を除いた名前を使う。
 */
export type AxisUnit = 'u' | '%' | '1/u';

interface AxisNameSpec {
  /**
   * 量の名前。単位は含めない。「かな」はテキストの言語で出し分ける（英語のテキストでは「字」）。
   * 省くと比較表の列名を使う。列名がすでに量を言い表している列（「同指率」「Bigram数（物理キー）」など）だけ省く。
   */
  readonly name?: (kana: KanaUnit) => string;
  readonly unit?: AxisUnit;
}

/** 押したキーの数。比較表には1かなあたりの列しか無いので、関係式で総数の形の名前が要る時はこれを使う。 */
export const KEY_COUNT_NAME = 'キー数';

const SPECS: Readonly<Record<ComparisonColumnId, AxisNameSpec>> = {
  actions: {},
  totalUnits: { name: () => '総移動距離', unit: 'u' },
  meanPerStroke: { name: () => '1アクションの距離', unit: 'u' },
  perCharUnits: { name: (k) => `1${k}の距離`, unit: 'u' },
  perCharSteps: { name: (k) => `1${k}のアクション数` },
  perCharPresses: { name: (k) => `1${k}の${KEY_COUNT_NAME}` },
  perActionPresses: { name: () => `1アクションの${KEY_COUNT_NAME}` },
  perPressUnits: { name: () => '1キーの距離', unit: 'u' },
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
  perMovedPressUnits: { name: () => '移動ありキー1つの距離', unit: 'u' },
  textCharsPerAction: { name: () => '1アクションの文字数' },
  actionsPerUnit: { name: () => '1uのアクション数', unit: '1/u' },
  textCharsPerUnit: { name: () => '1uの文字数', unit: '1/u' },
  unitsPerTextChar: { name: () => '1文字の距離', unit: 'u' },
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
  return SPECS[column].name?.(kanaUnitOf(language)) ?? comparisonColumnText(language)[column].label;
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
