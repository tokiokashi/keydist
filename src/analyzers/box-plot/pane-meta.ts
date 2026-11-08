import type { SegmentationOrigin } from '#input/text/segmentation.ts';
import { sharedMetricText } from '../metric-labels.ts';
import { WIDE_RECOMMENDED_WIDTH_REM } from '../recommended-width.ts';
import type { BoxPlotSource } from './extract.ts';

/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 * Reactにもcssにも依存させない（routeの `<title>` やサイドバーが名前だけを読むため）。
 */

// 文節の区切りは日本語のテキストだけで求めるので、単位の呼び名は日本語のテキストのもの
const DISTANCE = sharedMetricText('ja').perCharUnits;

/** 量の名前（図の下のキャプション）。 */
export const BOX_PLOT_QUANTITY_NAME = `文節ごとの${DISTANCE.label}`;

/** 縦軸の名前。 */
export const BOX_PLOT_AXIS_TITLE = `${DISTANCE.label}（${DISTANCE.unit}）`;

const ORIGIN_DESCRIPTION: Readonly<Record<SegmentationOrigin, string>> = {
  dictionary: '漢字を辞書で読みに直した語の境目へ寄せています。',
  'kana-only': '原文に漢字が無いので、かなの文をそのまま区切っています。',
  'dictionary-unavailable': '辞書を読み込めなかったので、漢字を読みに直さず区切っています。',
};

/** 図の見方に足す、区切りの分割器と出どころ（抽出が持つ値なので、本体が足す）。 */
export function boxPlotSourceItems(source: BoxPlotSource): readonly { readonly name: string; readonly description: string }[] {
  return [
    { name: '分割器', description: `${source.splitter.name} ${source.splitter.version}です。` },
    { name: '区切りの出どころ', description: ORIGIN_DESCRIPTION[source.origin] },
  ];
}

export const BOX_PLOT_PANE_META = {
  name: '箱ひげ図',
  description:
    'テキストを文節に区切り、選んだ配列やSetupで同じテキストを打った時の、文節ごとの1かな換算の移動距離の分布を、配列ごとの箱ひげ図で横に並べます。日本語のテキストでだけ値を出します。',
  /** 見出しのⓘから開く説明。解析設定や対象に依らない固定の文だけを置く。 */
  help: {
    notes: [
      `量は、${BOX_PLOT_QUANTITY_NAME} [${DISTANCE.unit}] です。1つの文節を打つ時の指の移動距離を、その文節のかな数で割った値です。`,
      '文節頭を含み、打てない文字もかな数に数えます。',
      '分位点は補間しません。中央値は、文節の数が偶数なら中央の2つの平均です。',
      '縦軸は0から始め、全配列で共通です。',
    ],
    listLabel: '図の読み方',
    items: [
      { name: '箱', description: '25%点から75%点です。' },
      { name: '箱の中の線', description: '中央値です。' },
      { name: 'ひげ', description: '10%点から90%点です。ひげの外の値は描きません。' },
    ],
  },
  /** 縦の箱が横に並ぶ幅。 */
  recommendedWidthRem: WIDE_RECOMMENDED_WIDTH_REM,
} as const;
