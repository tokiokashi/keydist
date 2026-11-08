import { sharedMetricText } from '../metric-labels.ts';
import { WIDE_RECOMMENDED_WIDTH_REM } from '../recommended-width.ts';

/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 * Reactにもcssにも依存させない（routeの `<title>` やサイドバーが名前だけを読むため）。
 */

// 文節の区切りは日本語のテキストだけで求めるので、単位の呼び名は日本語のテキストのもの
const DISTANCE = sharedMetricText('ja').perCharUnits;

/** 量の名前（図の下のキャプション）。 */
export const BOX_PLOT_QUANTITY_NAME = `文節ごとの${DISTANCE.label}`;

/** 横軸の名前。 */
export const BOX_PLOT_AXIS_TITLE = `${DISTANCE.label}（${DISTANCE.unit}）`;

export const BOX_PLOT_PANE_META = {
  name: '箱ひげ図',
  description:
    'テキストを文節に区切り、選んだ配列やSetupで同じテキストを打った時の、文節ごとの1かな換算の移動距離の分布を、配列ごとの1つの箱ひげ図で並べます。日本語のテキストでだけ値を出します。',
  /** 見出しのⓘから開く説明。解析設定や対象に依らない固定の文だけを置く。 */
  help: {
    notes: [
      `量は、${BOX_PLOT_QUANTITY_NAME} [${DISTANCE.unit}] です。1つの文節を打つ時の指の移動距離を、その文節のかな数で割った値を、全文節で集めて分布にします。`,
      '文節ごとの1かな換算の移動距離は、文節頭を含み、打てない文字もかな数に数えます。文節ごとの統計の表の同じ名前の列と同じ値です。',
      '分位点は、文節の値を小さい順に並べた時の順位の値で、値の間を補間しません。中央値は、文節の数が偶数の時、中央の2つの平均です。',
      '距離の目盛りは0から始め、図の中の全配列で共通です。評価に渡すテキストが他の対象と違う対象は、自分のテキストと区切りから求めます。',
    ],
    listLabel: '図の読み方',
    items: [
      { name: '箱', description: '文節ごとの値の25%点から75%点です。' },
      { name: '箱の中の線', description: '文節ごとの値の中央値です。' },
      { name: 'ひげ', description: '文節ごとの値の10%点から90%点です。ひげの外の値は描きません。' },
      { name: '文節の数', description: '値を求めた文節の数です。図の下に出します。' },
    ],
  },
  /** 名前と箱が横に並ぶ幅。 */
  recommendedWidthRem: WIDE_RECOMMENDED_WIDTH_REM,
} as const;
