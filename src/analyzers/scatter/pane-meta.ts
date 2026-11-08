import type { TextLanguage } from '#input/text/language.ts';
import { WIDE_RECOMMENDED_WIDTH_REM } from '../recommended-width.ts';
import { scatterPresetDescriptions, SCATTER_PRESET_IDS, scatterPresetLabels } from './axes.ts';

/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 * Reactにもcssにも依存させない（routeの `<title>` やサイドバーが名前だけを読むため）。
 */
export const SCATTER_PANE_META = {
  name: '散布図',
  description: '選んだ配列やSetupで同じテキストを打った時の2つの数値の関係を、配列ごとの点で描きます。',
  /** 見出しのⓘから開く説明。解析設定や対象に依らない固定の文だけを置く。 */
  help: (language: TextLanguage) => ({
    notes: [
      '点は配列かSetupごとに1つで、値はテキスト全体を打った時の値です。軸の数値は比較表の列と同じです。',
      '解析設定の「表示する図」で複数を選ぶと、選んだ図を並べます。軸の線形と対数の選択と、自由選択の横軸と縦軸は、全ての図で共通です。点の色と形、軸と細い線の量の説明は、図ごとの「図の見方」にあります。',
      '軸の2つの数値から決まる別の数値がある組には、その数値が同じになる位置を細い線で結び、線の上に値を書きます。数値の名前は凡例に示します。押下1回の移動距離のように、配列ごとに違う回数で割った距離の線は、同じテキストを打つ時の距離と取り違えやすいので引きません。',
      '解析設定で軸を対数にすると、細い線が2軸の積か比で決まる図（細い線が平行な直線になる図）で、横軸と縦軸の両方を対数で描きます。値に0以下がある図と、細い線が直線にならない図は、線形で描きます。',
    ],
    listLabel: '選べる図',
    items: SCATTER_PRESET_IDS.map((id) => ({ name: scatterPresetLabels(language)[id], description: scatterPresetDescriptions(language)[id] })),
  }),
  /** 図を3列まで並べられる幅（`figure-layout.ts`）。既定の幅では2列までしか収まらない。 */
  recommendedWidthRem: WIDE_RECOMMENDED_WIDTH_REM,
  /** 本体の縦の下限 [rem]。図と読み取りの行が収まる高さ。 */
  minBodyHeightRem: 20,
} as const;
