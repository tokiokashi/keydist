import type { TextLanguage } from '#input/text/language.ts';
import { scatterPresetDescriptions, SCATTER_PRESET_IDS, scatterPresetLabels } from './axes.ts';
import { SCATTER_KIND_ORDER, SCATTER_KIND_STYLES } from './kinds.ts';

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
      `点は配列の種類で${SCATTER_KIND_ORDER.map((kind) => `${SCATTER_KIND_STYLES[kind].label}（${SCATTER_KIND_STYLES[kind].colorName}の${SCATTER_KIND_STYLES[kind].shapeName}）`).join('・')}に分けて重ねます。`,
      '軸の2つの数値から決まる別の数値がある組には、その数値が同じになる位置を細い線で結び、線の上に値を書きます。数値の名前は凡例に示します。1キーあたりの距離のように、配列ごとに違う回数で割った距離の線は、同じテキストを打つ時の距離と取り違えやすいので引きません。',
      '右手キー率か右手距離率を軸に取った図は、50%の位置に左右が均等になる線を引きます。',
    ],
    listLabel: '用意する組み合わせ',
    items: SCATTER_PRESET_IDS.map((id) => ({ name: scatterPresetLabels(language)[id], description: scatterPresetDescriptions(language)[id] })),
  }),
  /** 本体の縦の下限 [rem]。図と読み取りの行が収まる高さ。 */
  minBodyHeightRem: 20,
} as const;
