/**
 * 比較表の列の名前と説明。列の定義（`options.ts`）と、見出しのⓘから開く説明（`pane-meta.ts`）の両方が読む。
 *
 * `options.ts`から分けて置くのは、`pane-meta.ts`がReactにもCSSにもvalibotにも依存させないため
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
  'singleTapLayerRate',
  'singleTapRate',
  'singleKeyRate',
  'sameFinger',
  'sameFingerRate',
  'adjacentMean',
  'adjacentStdDev',
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
export const COMPARISON_UNIT_NOTE = '距離の単位 u は、キーの幅を1とした距離。';

export const COMPARISON_COLUMN_TEXT: Readonly<Record<ComparisonColumnId, ComparisonColumnText>> = {
  actions: {
    label: '動作数',
    description: 'テキストを打つのに要したアクション（打鍵のまとまり）の総数。同時押しは1アクションと数える。',
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
    description: '入力1文字あたりの総移動距離（u/文字）。文字数はローマ字展開やコンボ結合の前の原文で数えるので、打鍵数を減らした効果がこの値に残る。',
  },
  perCharSteps: {
    label: '動作数/文字',
    description: '入力1文字あたりのアクション数。コンボなどでまとめて打つほど小さくなる。',
  },
  perCharPresses: {
    label: '押下/文字',
    description: '入力1文字あたりのキーを押す回数。コンボでまとめても減らない。',
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
    description: '同じ手で隣り合う2本の指の距離が、ホームに置いた時の間隔よりどれだけ開いたかの平均。6組の平均で、ホームより近いと負になる（u）。',
  },
  adjacentStdDev: {
    label: '指間σ',
    description: '隣り合う2本の指の距離のばらつき（標準偏差）。6組の平均（u）。',
  },
} as const;
