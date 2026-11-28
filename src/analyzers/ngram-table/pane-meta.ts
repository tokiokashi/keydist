import { sharedMetricText } from '../metric-labels.ts';
import { WIDE_RECOMMENDED_WIDTH_REM } from '../recommended-width.ts';
import type { TableSource } from '#interpretation/ngram-table-analysis.ts';
import type { NgramTableColophon } from '#interpretation/ngram-table-asset.ts';

/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 * Reactにもcssにも依存させない（routeの `<title>` やサイドバーが名前だけを読むため）。
 */

// 文節の読みの表は日本語だけなので、単位の呼び方は日本語のもの
const PER_KANA = sharedMetricText('ja').perCharUnits;

/** 総移動距離の列の名前。 */
export const TOTAL_DISTANCE_LABEL = '総移動距離';
export const TOTAL_DISTANCE_UNIT = 'u';

/** 入力1かなあたりの移動距離の列の名前。 */
export const PER_KANA_DISTANCE_LABEL = '入力1かなあたりの移動距離';
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
      '統計は1つの作品から数えたもので、日本語の文章一般の値として読みません。',
    ],
    listLabel: '図の読み方',
    items: [
      { name: '箱', description: '25%点から75%点です。出現回数で重み付けして数えます。' },
      { name: '箱の中の線', description: '中央値です。' },
      { name: 'ひげ', description: '10%点から90%点です。ひげの外の値は描きません。最小・最大・平均は、列を押すと表に出ます。' },
      { name: '割らない図', description: '文節の移動距離そのままです。長い文節ほど大きくなるので、長さの違いと打ちやすさの違いが混ざります。' },
      { name: '割った図', description: '文節の移動距離を、その文節のかな数で割った値です。1かなの文節は、値が1つの打鍵に偏ります。' },
    ],
  },
  /** 縦の箱が横に並ぶ幅。 */
  recommendedWidthRem: WIDE_RECOMMENDED_WIDTH_REM,
} as const;

/** 図の見方に足す、表の元のテキストの出どころ。青空文庫が残すことを希望している情報と、加えた変更を含む。 */
export function ngramTableSourceItems(basis: {
  readonly source: TableSource;
  readonly colophon: NgramTableColophon;
}): readonly { readonly name: string; readonly description: string }[] {
  const { source, colophon } = basis;
  return [
    { name: SOURCE_TEXT_LABEL, description: `${source.name}。${colophon.work}` },
    { name: '底本・入力・校正など', description: colophon.original.replaceAll('\n', ' ').replace(/\s+/g, ' ') },
    { name: '加えた変更', description: colophon.changes },
  ];
}
