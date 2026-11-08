import type { TextLanguage } from '#input/text/language.ts';
import { WIDE_RECOMMENDED_WIDTH_REM } from '../recommended-width.ts';
import { kanaUnitOf } from '../unit-words.ts';
import { bandLabels } from './figure-model.ts';

/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 * Reactにもcssにも依存させない（routeの `<title>` やサイドバーが名前だけを読むため）。
 */

/** 図の下に出す、量の名前。単位の語はテキストの言語で変わる。 */
export function bandChartQuantityName(language: TextLanguage): string {
  return `1${kanaUnitOf(language)}ごとの移動距離の割合`;
}

export const BAND_CHART_PANE_META = {
  name: '帯グラフ',
  description:
    '選んだ配列やSetupで同じテキストを打った時の1かなごとの移動距離を、1キー分の距離に丸めた区分に分け、区分ごとの割合を配列ごとの1本の帯で並べます。',
  /** 見出しのⓘから開く説明。解析設定や対象に依らない固定の文だけを置く。 */
  help: (language: TextLanguage) => {
    const unit = kanaUnitOf(language);
    const labels = bandLabels();
    return {
      notes: [
        `量は、${bandChartQuantityName(language)}です。テキストの1${unit}を打つ時の指の移動距離 [u] を4つの区分に分けて数え、打てた${unit}に占める区分ごとの割合で帯を区切ります。`,
        `区分の境目は0.5u、1.5u、2.5uです。1キー分の距離が1uなので、境目はその半分の刻みです。どの物理配列でも同じ値を使い、境目ちょうどの距離は上の区分に入ります。`,
        `打てない文字は数えません。打てない文字は距離が0で、数えると最も小さい区分の割合が大きく見えるためです。ローマ字入力で一部の英字だけ打てた${unit}も、数えません。打てない文字の数は、配列ごとに図の下に出します。`,
        `帯の色は1色の濃淡で、距離の大きい区分ほど強い色にしています（ライトでは濃く、ダークでは明るくなります）。帯の中の数は整数に丸めた割合で、区分の幅が狭く入らない時は書きません。`,
      ],
      listLabel: '区分',
      items: labels.map((name) => ({ name, description: `1${unit}の移動距離が${name}の${unit}の割合です。` })),
    };
  },
  /** 名前と帯が横に並ぶ幅。 */
  recommendedWidthRem: WIDE_RECOMMENDED_WIDTH_REM,
} as const;
