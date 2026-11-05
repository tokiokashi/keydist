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
 * 画面の凡例には「名前（単位）」を、キャプション・点の読み取り・図の見方の文には単位を除いた名前を使う。
 * 軸の名前だけは、何あたりかを表す部分を落とした短い名前（`shortName`）を使える。何あたりかは図の下のキャプションが持つため。
 */
export type AxisUnit = 'u' | '%' | '1/u';

interface AxisNameSpec {
  /**
   * 量の名前。単位は含めない。「かな」はテキストの言語で出し分ける（英語のテキストでは「字」）。
   * 省くと比較表の列名を使う。列名がすでに量を言い表している列（「同指率」「Bigram数（物理キー）」など）だけ省く。
   */
  readonly name?: (kana: KanaUnit) => string;
  readonly unit?: AxisUnit;
  /**
   * 軸の名前に使う短い名前。単位は含めない。`name`から「1かなの」「1アクションの」「1uの」など何あたりかを表す部分を落とした名前を宣言する。
   * 宣言の無い列は`name`のまま軸に出す。
   */
  readonly shortName?: string;
}

/** 押したキーの数。比較表には1かなあたりの列しか無いので、関係式で総数の形の名前が要る時はこれを使う。 */
export const KEY_COUNT_NAME = 'キー数';

const SPECS: Readonly<Record<ComparisonColumnId, AxisNameSpec>> = {
  actions: {},
  totalUnits: { name: () => '総移動距離', unit: 'u' },
  meanPerStroke: { name: () => '1アクションの距離', unit: 'u', shortName: '距離' },
  perCharUnits: { name: (k) => `1${k}の距離`, unit: 'u', shortName: '距離' },
  perCharSteps: { name: (k) => `1${k}のアクション数`, shortName: 'アクション数' },
  perCharPresses: { name: (k) => `1${k}の${KEY_COUNT_NAME}`, shortName: 'キー数' },
  perActionPresses: { name: () => `1アクションの${KEY_COUNT_NAME}`, shortName: 'キー数' },
  perPressUnits: { name: () => '1キーの距離', unit: 'u', shortName: '距離' },
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
  perMovedPressUnits: { name: () => '移動ありキー1つの距離', unit: 'u', shortName: '距離' },
  textCharsPerAction: { name: () => '1アクションの文字数', shortName: '文字数' },
  actionsPerUnit: { name: () => '1uのアクション数', unit: '1/u', shortName: 'アクション数' },
  textCharsPerUnit: { name: () => '1uの文字数', unit: '1/u', shortName: '文字数' },
  unitsPerTextChar: { name: () => '1文字の距離', unit: 'u', shortName: '距離' },
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

/** 軸の名前に出す、単位つきの短い名前。短い名前を宣言していない列は`axisTitle`と同じ。 */
export function axisShortTitle(column: ComparisonColumnId, language: TextLanguage): string {
  const short = SPECS[column].shortName;
  if (short === undefined) return axisTitle(column, language);
  const unit = axisUnit(column);
  return unit === undefined ? short : `${short}（${unit}）`;
}

/** 軸の名前に短い名前を使う列か。 */
export function hasShortAxisName(column: ComparisonColumnId): boolean {
  return SPECS[column].shortName !== undefined;
}
