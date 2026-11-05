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
   * 率の列は値の側に `%` が付き、`u/打鍵`・`u/文字` は名前が単位を含む。
   */
  readonly label: string;
  /** この列の説明。見出しのⓘから開く説明に、列名と組で出す。 */
  readonly description: string;
}

/** 説明の先頭に出す、距離の単位の説明。 */
export const COMPARISON_UNIT_NOTE = '距離の単位uは、キーの幅を1とした距離。';

export const COMPARISON_COLUMN_TEXT: Readonly<Record<ComparisonColumnId, ComparisonColumnText>> = {
  actions: {
    label: '動作数',
    description: 'テキストを打つのに要したアクション（打鍵のまとまり）の総数。同時押しは1アクションと数えます。',
  },
  totalUnits: {
    label: '距離',
    description: '全指の総移動距離（u）。',
  },
  meanPerStroke: {
    label: 'u/打鍵',
    description: '1打鍵あたりの平均移動距離（u/打鍵）。',
  },
  perCharUnits: {
    label: 'u/文字',
    description:
      '入力1文字あたりの総移動距離（u/文字）。文字数はローマ字展開やコンボ結合の前の原文で数えるので、打鍵数を減らした効果がこの値に残ります。',
  },
  perCharSteps: {
    label: '動作数/文字',
    description: '入力1文字あたりのアクション数。コンボなどでまとめて打つほど小さくなります。',
  },
  perCharPresses: {
    label: '押下数/文字',
    description: '入力1文字あたりのキーを押す回数。コンボでまとめても減りません。',
  },
  perActionPresses: {
    label: '押下数/動作',
    description: '1アクションで押すキーの数。コンボや同時押しでまとめて打つほど大きくなります。',
  },
  perPressUnits: {
    label: 'u/押下',
    description: '1回の押下あたりの移動距離（u/押下）。距離が0の押下（ホームキーや親指キー）も数に入れます。',
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
    description: '同指連続回数を打鍵数で割った割合（%）。',
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
    label: '右手押下率',
    description: '右手（親指を含む5本）の押下数を、全押下数で割った割合（%）。左手は100%から引いた値。',
  },
  rightLeftPerPressRatio: {
    label: '右手u/押下比',
    description:
      '右手（親指を含む5本）の1回の押下あたりの移動距離を、左手の1回の押下あたりの移動距離で割った比。1より大きいと右手の方が1回の押下で長く動きます。どちらかの手の押下が無い時と、左手の移動距離が0の時は値がありません。',
  },
  movedPressShare: {
    label: '動いた押下率',
    description:
      '押下キー数のうち、指が動いた（移動距離が0より大きい）押下で押したキーの数の割合（%）。移動距離が0の押下（同じ指が続かない時のホームキー、同じキーの連続など）は入りません。',
  },
  perMovedPressUnits: {
    label: 'u/動いた押下',
    description:
      '指が動いた押下1回あたりの移動距離（u/押下）。総移動距離を、動いた押下で押したキーの数で割った値。動いた押下率と掛け合わせるとu/押下になります。',
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
      '左右の手が交互に変わる3打鍵以上の連続に含まれる打鍵が、全打鍵のうちどれだけを占めるか（%）。前置・後置のシフトのキーも1打鍵と数えます。両手で押す打鍵は連続を切ります。',
  },
  sameHandContinuationRate: {
    label: '同じ手の続きの割合',
    description:
      '片手で打つ隣り合う2打鍵のうち、同じ手が続いた組の割合（%）。手が切り替わる組と同じ手が続く組の合計で割り、両手で押す打鍵を含む組は数えません。',
  },
  handSwitches: {
    label: '手の切り替え',
    description: '隣り合う2打鍵がどちらも片手で、左右の手が切り替わった組の数。両手で押す打鍵を含む組は数えません。',
  },
  handContinuations: {
    label: '同じ手の続き',
    description: '隣り合う2打鍵がどちらも片手で、同じ手が続いた組の数。両手で押す打鍵を含む組は数えません。',
  },
  bothHandPairShare: {
    label: '両手の打鍵を含む組の割合',
    description:
      '隣り合う2打鍵の組のうち、少なくとも一方が両手で押す打鍵である組の割合（%）。手の切り替え、同じ手の続き、両手の打鍵を含む組の合計で割り、押す手が無い打鍵を含む組は数えません。',
  },
  bothHandStrokes: {
    label: '両手の打鍵',
    description: '左右の手が同時に押す打鍵の数。両手で文字を出す打鍵と、片手は切り替えのキーだけを押す打鍵を合わせて数えます。',
  },
  alternationRuns: {
    label: '交互打鍵の連続の数',
    description: '左右の手が交互に変わる、3打鍵以上の連続の数。両手で押す打鍵は連続を切ります。',
  },
  alternationMeanLength: {
    label: '交互打鍵の連続の平均の長さ',
    description: '交互打鍵の連続1件あたりの打鍵数の平均。連続が1件も無い時は値がありません。',
  },
  alternationMaxLength: {
    label: '交互打鍵の連続の最長の長さ',
    description: '交互打鍵の連続のうち、最も長いものの打鍵数。連続が1件も無い時は値がありません。',
  },
} as const;

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
