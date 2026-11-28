import { sharedMetricText } from '../metric-labels.ts';
import { WIDE_RECOMMENDED_WIDTH_REM } from '../recommended-width.ts';

/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 * Reactにもcssにも依存させない（routeの `<title>` やサイドバーが名前だけを読むため）。
 */

// 文節の読みの表は日本語だけなので、単位の呼び方は日本語のもの
const PER_KANA = sharedMetricText('ja').perCharUnits;

/** 総移動距離の列の名前。 */
export const TOTAL_DISTANCE_LABEL = '総移動距離';
export const TOTAL_DISTANCE_UNIT = 'u';

/** 結果の表の列の名前。画面の幅が狭くても読める短さにする。 */
export const PER_KANA_COLUMN_LABEL = '1かなあたり';
export const UNTYPED_COLUMN_LABEL = '打てない文字';

export const PER_KANA_DISTANCE_UNIT = PER_KANA.unit;

/** 文節の移動距離の分布の図（割らない値）。 */
export const DISTANCE_FIGURE = {
  /** 図のキャプション（量の名前） */
  caption: '文節ごとの移動距離',
  axisTitle: `移動距離（${TOTAL_DISTANCE_UNIT}）`,
  unit: TOTAL_DISTANCE_UNIT,
  scaleKey: 'ngram-table:segment-distance',
} as const;

/** 文節の移動距離をかな数で割った値の分布の図。 */
export const PER_KANA_FIGURE = {
  caption: `文節ごとの${PER_KANA.label}`,
  axisTitle: `${PER_KANA.label}（${PER_KANA.unit}）`,
  unit: PER_KANA.unit,
  scaleKey: 'ngram-table:segment-distance-per-kana',
} as const;

/** 表の元のテキストの名前。条件の要約の札と図の見方の項目で同じにする。 */
export const SOURCE_TEXT_LABEL = '表の元のテキスト';

/** 表を読み込めなかった時の文。 */
export const NO_TABLE_MESSAGE = '表を読み込めなかったので、値を出しません。';

export const NGRAM_TABLE_PANE_META = {
  name: '文節の表による解析',
  description:
    '標準のコーパスを文節に区切って数えた読みの並びを、選んだ配列やSetupで打った時の指の移動距離を、出現回数で重み付けして出します。総移動距離、入力1かなあたりの移動距離、文節ごとの移動距離の分布を見られます。',
  /** 見出しのⓘから開く説明。解析設定や対象に依らない固定の文だけを置く。 */
  help: {
    notes: [
      '表の項目を1つずつ、すべての指をホームポジションに置いた状態から打ち、最後の文節の移動距離を、出現回数の重みで足します。最後の文節より前の文節は、指の位置を作るために打つだけで、距離に数えません。',
      '評価に渡すテキストは使いません。テキストの選択は、この解析の値を変えません。',
      '先読みは文節で数えます。条件の「先読みN」（かなで数える）は使いません。0次の表では、先読みを変えても値は変わりません。',
      `文節の長さはかなで数えます。1かなあたりの移動距離は、移動距離の合計を、文節のかな数の合計で割った値です。`,
      '統計は1つの作品から数えたもので、日本語の文章一般の値ではありません。',
    ],
    listLabel: '結果の表の列',
    items: [
      { name: TOTAL_DISTANCE_LABEL, description: '表の全項目の、最後の文節の移動距離を、出現回数の重みで足した値です。' },
      { name: PER_KANA_COLUMN_LABEL, description: '総移動距離を、入力したかなの数で割った値です。' },
      { name: UNTYPED_COLUMN_LABEL, description: 'この配列で打てなかった文字の数です。' },
    ],
  },
  /** 縦の箱が横に並ぶ幅。 */
  recommendedWidthRem: WIDE_RECOMMENDED_WIDTH_REM,
} as const;

/** 分布の図のⓘから開く説明。2つの図で共通の部分と、図ごとの部分を並べる。 */
export function figureHelp(kind: 'distance' | 'perKana'): {
  readonly notes: readonly string[];
  readonly listLabel: string;
  readonly items: readonly { readonly name: string; readonly description: string }[];
} {
  return {
    notes: [],
    listLabel: '図の読み方',
    items: [
      { name: '箱', description: '25%点から75%点です。出現回数で重み付けして数えます。' },
      { name: '箱の中の線', description: '中央値です。' },
      { name: 'ひげ', description: '10%点から90%点までの範囲です。範囲の外の値は描きません。' },
      kind === 'distance'
        ? { name: '文節の移動距離', description: '文節の移動距離そのままです。長い文節ほど大きくなるので、長さの違いと打ちやすさの違いが混ざります。' }
        : { name: '1かな換算', description: '文節の移動距離を、その文節のかな数で割った値です。1かなの文節は、値が1つの打鍵に偏ります。' },
    ],
  };
}
