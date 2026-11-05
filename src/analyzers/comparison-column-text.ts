import type { TextLanguage } from '#input/text/language.ts';
import { inputUnitNoteOf, kanaUnitOf } from './unit-words.ts';

/**
 * 比較表の列の名前・説明・表示形式。比較表の列の定義（`comparison/options.ts`）と、見出しのⓘから開く説明（`comparison/pane-meta.ts`）に加え、
 * 同じ列を軸に取る散布図（`scatter/`）が読む。Analyzerどうしは互いをimportできないので、`analyzers/`直下に置く。
 *
 * 解析設定の定義（`options.ts`）から分けて置くのは、`pane-meta.ts`がReactにもCSSにもvalibotにも依存させないため
 * （routeの`<title>`やサイドバーが名前を読むだけで、解析設定の定義が初期読み込みに入らないようにする）。
 * 列の説明は、指標の定義（spec §11）とREADMEの「出力」の言い方に合わせ、内部の語を使わない。
 */
export const COMPARISON_COLUMN_IDS = [
  'actions',
  'totalUnits',
  'meanPerStroke',
  'perCharUnits',
  'perCharSteps',
  'perCharPresses',
  'perActionPresses',
  'perPressUnits',
  'singleTapLayerRate',
  'singleTapRate',
  'singleKeyRate',
  'sameFinger',
  'sameFingerRate',
  'adjacentMean',
  'adjacentStdDev',
  'rightHandDistanceShare',
  'rightHandPressShare',
  'rightLeftPerPressRatio',
  'movedPressShare',
  'perMovedPressUnits',
  'textCharsPerAction',
  'actionsPerUnit',
  'textCharsPerUnit',
  'unitsPerTextChar',
  'physicalBigramCombinations',
  'logicalBigramCombinations',
  'alternationCoverage',
  'sameHandContinuationRate',
  'handSwitches',
  'handContinuations',
  'bothHandPairShare',
  'bothHandStrokes',
  'alternationRuns',
  'alternationMeanLength',
  'alternationMaxLength',
] as const;

export type ComparisonColumnId = (typeof COMPARISON_COLUMN_IDS)[number];

export interface ComparisonColumnText {
  /**
   * 見出しの短い名前。見出しには単位を付けない（単位は見出しのⓘから開く説明に書く）。
   * 率の列は値の側に `%` が付き、`u/アクション`・`u/かな` は名前が単位を含む。
   * 「かな」はテキストの言語で出し分ける（英語のテキストでは「字」。`unit-words.ts`）。
   */
  readonly label: string;
  /** この列の説明。見出しのⓘから開く説明に、列名と組で出す。 */
  readonly description: string;
}

/** 説明の先頭に出す、距離の単位の説明。 */
export const COMPARISON_UNIT_NOTE = '距離の単位uは、キーの幅を1とした距離。';

function buildColumnText(language: TextLanguage): Readonly<Record<ComparisonColumnId, ComparisonColumnText>> {
  const k = kanaUnitOf(language);
  const countNote = inputUnitNoteOf(language);
  // 文字数は、漢字仮名交じりのテキストの字で数える。英語のテキストでは入力字数と同じ
  const textCharNote =
    '文字は漢字仮名交じりのテキストの字で数え、漢字を読みに直した語は読みでなく表記の字数で数えます。英語のテキストでは字の数と同じです。';
  return {
    actions: {
      label: 'アクション数',
      description: 'テキストを打つのに要したアクション（打鍵のまとまり）の総数。同時押しは1アクションと数えます。',
    },
    totalUnits: {
      label: '距離',
      description: '全指の総移動距離（u）。',
    },
    meanPerStroke: {
      label: 'u/アクション',
      description: '1アクションあたりの平均移動距離（u/アクション）。',
    },
    perCharUnits: {
      label: `u/${k}`,
      description: `入力1${k}あたりの総移動距離（u/${k}）。${countNote}この数はローマ字展開やコンボ結合の前で数えるので、アクション数を減らした効果がこの値に残ります。`,
    },
    perCharSteps: {
      label: `アクション数/${k}`,
      description: `入力1${k}あたりのアクション数。コンボなどでまとめて打つほど小さくなります。`,
    },
    perCharPresses: {
      label: `キー数/${k}`,
      description: `入力1${k}あたりに押すキーの数。同時押しは押したキーの数だけ数えます。コンボでまとめても減りません。`,
    },
    perActionPresses: {
      label: 'キー数/アクション',
      description: '1アクションで押すキーの数。コンボや同時押しでまとめて打つほど大きくなります。',
    },
    perPressUnits: {
      label: 'u/キー',
      description: '押したキー1つあたりの移動距離（u/キー）。距離が0のキー（ホームキーや親指キー）も数に入れます。',
    },
    singleTapLayerRate: {
      label: '単打面率',
      description: '出力する全文字のうち、単打面に配置された文字の割合（%）。',
    },
    singleTapRate: {
      label: '単打率',
      description: '全アクションのうち、単打面の文字を出すアクションの割合（%）。',
    },
    singleKeyRate: {
      label: '1キー率',
      description: '全アクションのうち、新たに押すキーが1つだけのアクションの割合（%）。',
    },
    sameFinger: {
      label: '同指',
      description: '同じ指で違うキーを続けて打った回数。',
    },
    sameFingerRate: {
      label: '同指率',
      description: '同指連続回数をアクション数で割った割合（%）。',
    },
    adjacentMean: {
      label: '指間平均',
      description: '同じ手で隣り合う2本の指の距離が、ホームに置いた時の間隔よりどれだけ開いたかの平均。6組の平均で、ホームより近いと負になります（u）。',
    },
    adjacentStdDev: {
      label: '指間σ',
      description: '隣り合う2本の指の距離のばらつき（標準偏差）。6組の平均（u）。',
    },
    rightHandDistanceShare: {
      label: '右手距離率',
      description: '右手（親指を含む5本）の総移動距離を、全指の総移動距離で割った割合（%）。左手は100%から引いた値。',
    },
    rightHandPressShare: {
      label: '右手キー率',
      description: '右手（親指を含む5本）が押したキーの数を、押した全部のキーの数で割った割合（%）。左手は100%から引いた値。',
    },
    rightLeftPerPressRatio: {
      label: '右手u/キー比',
      description:
        '右手（親指を含む5本）の押したキー1つあたりの移動距離を、左手の押したキー1つあたりの移動距離で割った比。1より大きいと右手の方が1キーで長く動きます。どちらかの手のキーが無い時と、左手の移動距離が0の時は値がありません。',
    },
    movedPressShare: {
      label: '移動ありキー率',
      description:
        '押したキーの数のうち、指が動いた（移動距離が0より大きい）時に押したキー（移動ありキー）の数の割合（%）。移動距離が0の時に押したキー（同じ指が続かない時のホームキー、同じキーの連続など）は入りません。',
    },
    perMovedPressUnits: {
      label: 'u/移動ありキー',
      description:
        '移動ありキー1つあたりの移動距離（u/キー）。総移動距離を、移動ありキーの数で割った値。移動ありキー率と掛け合わせるとu/キーになります。',
    },
    textCharsPerAction: {
      label: '文字/アクション',
      description: `1アクションで出せる文字の数（コスパとも呼ばれる量）。${textCharNote}かな漢字変換の操作はアクションに数えません。アクション数が0の時は値がありません。`,
    },
    actionsPerUnit: {
      label: 'アクション/u',
      description:
        '1uの距離を動く間に行うアクションの数。アクション数を総移動距離で割った値で、大きいほど距離あたりに多くのアクションを行います。総移動距離が0の時は値がありません。',
    },
    textCharsPerUnit: {
      label: '文字/u',
      description: `1uの距離を動く間に出せる文字の数。${textCharNote}文字数を総移動距離で割った値で、総移動距離が0の時は値がありません。`,
    },
    unitsPerTextChar: {
      label: 'u/文字',
      description: `テキストの1文字を打つのに動く距離（u/文字）。${textCharNote}総移動距離を文字数で割った値で、文字数が0の時は値がありません。`,
    },
    physicalBigramCombinations: {
      label: 'Bigram数（物理キー）',
      description:
        'テキストを打った時に現れた、続けて打つ2回の打鍵の組が何種類あるか。文字を出したキーだけで区別し、シフトの違いは区別しません。前置・後置のシフトは、そのシフトで打つ文字と合わせて1回の打鍵と数えます。A→BとB→Aは別の組で、親指のキーも数えます。',
    },
    logicalBigramCombinations: {
      label: 'Bigram数（シフト込み）',
      description:
        'テキストを打った時に現れた、続けて打つ2回の打鍵の組が何種類あるか。シフトなどのレイヤーを切り替えるキーも含めて区別し、左右のシフトと左右の親指シフトも別と数えます。前置・後置のシフトは、そのシフトで打つ文字と合わせて1回の打鍵と数えます。A→BとB→Aは別の組で、親指のキーも数えます。',
    },
    alternationCoverage: {
      label: '交互打鍵の連続の割合',
      description:
        '左右の手が交互に変わる3アクション以上の連続に含まれるアクションが、全アクションのうちどれだけを占めるか（%）。前置・後置のシフトのキーも1アクションと数えます。両手で押すアクションは連続を切ります。',
    },
    sameHandContinuationRate: {
      label: '同じ手の続きの割合',
      description:
        '片手で打つ隣り合う2アクションのうち、同じ手が続いた組の割合（%）。手が切り替わる組と同じ手が続く組の合計で割り、両手で押すアクションを含む組は数えません。',
    },
    handSwitches: {
      label: '手の切り替え',
      description: '隣り合う2アクションがどちらも片手で、左右の手が切り替わった組の数。両手で押すアクションを含む組は数えません。',
    },
    handContinuations: {
      label: '同じ手の続き',
      description: '隣り合う2アクションがどちらも片手で、同じ手が続いた組の数。両手で押すアクションを含む組は数えません。',
    },
    bothHandPairShare: {
      label: '両手のアクションを含む組の割合',
      description:
        '隣り合う2アクションの組のうち、少なくとも一方が両手で押すアクションである組の割合（%）。手の切り替え、同じ手の続き、両手のアクションを含む組の合計で割り、押す手が無いアクションを含む組は数えません。',
    },
    bothHandStrokes: {
      label: '両手のアクション',
      description: '左右の手が同時に押すアクションの数。両手で文字を出すアクションと、片手は切り替えのキーだけを押すアクションを合わせて数えます。',
    },
    alternationRuns: {
      label: '交互打鍵の連続の数',
      description: '左右の手が交互に変わる、3アクション以上の連続の数。両手で押すアクションは連続を切ります。',
    },
    alternationMeanLength: {
      label: '交互打鍵の連続の平均の長さ',
      description: '交互打鍵の連続1件あたりのアクション数の平均。連続が1件も無い時は値がありません。',
    },
    alternationMaxLength: {
      label: '交互打鍵の連続の最長の長さ',
      description: '交互打鍵の連続のうち、最も長いもののアクション数。連続が1件も無い時は値がありません。',
    },
  };
}

const COLUMN_TEXT_BY_LANGUAGE: Readonly<Record<TextLanguage, Readonly<Record<ComparisonColumnId, ComparisonColumnText>>>> = {
  ja: buildColumnText('ja'),
  en: buildColumnText('en'),
};

/** テキストの言語に合わせた列の名前と説明。 */
export function comparisonColumnText(language: TextLanguage): Readonly<Record<ComparisonColumnId, ComparisonColumnText>> {
  return COLUMN_TEXT_BY_LANGUAGE[language];
}

const fixed =
  (digits: number) =>
  (value: number): string =>
    value.toFixed(digits);
const percent = (value: number): string => `${value.toFixed(1)}%`;
const count = (value: number): string => `${value}`;

/**
 * 列ごとの表示形式（一律ルールではなく列の宣言に持たせる）。値をそのまま渡すと表示用の文字列を返す。
 * **率（rate）は率として読める表示にする**（個数・距離の列に小数第1位+%を付けたり、率の列を整数で丸めて情報を削ったりしない）。
 * 丸め・%表記はここに閉じ、値そのものは変えない。
 */
export const COMPARISON_COLUMN_FORMAT: Readonly<Record<ComparisonColumnId, (value: number) => string>> = {
  actions: count,
  totalUnits: fixed(0),
  meanPerStroke: fixed(3),
  perCharUnits: fixed(3),
  perCharSteps: fixed(3),
  perCharPresses: fixed(3),
  perActionPresses: fixed(3),
  perPressUnits: fixed(3),
  singleTapLayerRate: percent,
  singleTapRate: percent,
  singleKeyRate: percent,
  sameFinger: count,
  sameFingerRate: percent,
  adjacentMean: fixed(3),
  adjacentStdDev: fixed(3),
  rightHandDistanceShare: percent,
  rightHandPressShare: percent,
  rightLeftPerPressRatio: fixed(3),
  movedPressShare: percent,
  perMovedPressUnits: fixed(3),
  textCharsPerAction: fixed(3),
  actionsPerUnit: fixed(3),
  textCharsPerUnit: fixed(3),
  unitsPerTextChar: fixed(3),
  physicalBigramCombinations: count,
  logicalBigramCombinations: count,
  alternationCoverage: percent,
  sameHandContinuationRate: percent,
  handSwitches: count,
  handContinuations: count,
  bothHandPairShare: percent,
  bothHandStrokes: count,
  alternationRuns: count,
  alternationMeanLength: fixed(2),
  alternationMaxLength: count,
};
