import { SCATTER_PRESET_DESCRIPTIONS, SCATTER_PRESET_IDS, SCATTER_PRESET_LABELS } from './axes.ts';
import { SCATTER_KIND_ORDER, SCATTER_KIND_STYLES } from './kinds.ts';

/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 * Reactにもcssにも依存させない（routeの `<title>` やサイドバーが名前だけを読むため）。
 */
export const SCATTER_PANE_META = {
  name: '散布図',
  description:
    '選んだ配列やSetupで同じテキストを打った時の2つの数値の関係を、配列ごとの点で描きます。軸の2つの数値から決まる別の数値が同じになる位置は、細い線で示します。',
  /** 見出しのⓘから開く説明。解析設定や対象に依らない固定の文だけを置く。 */
  help: {
    notes: [
      '点は配列かSetupごとに1つで、値はテキスト全体を打った時の値です。軸の数値は比較表の列と同じです。',
      `点は配列の種類で${SCATTER_KIND_ORDER.map((kind) => `${SCATTER_KIND_STYLES[kind].label}（${SCATTER_KIND_STYLES[kind].colorName}の${SCATTER_KIND_STYLES[kind].shapeName}）`).join('・')}に分けて重ねます。`,
      '細い線は、軸の2つの数値から決まる別の数値が、同じになる位置を結んでいます。線の端に、その数値の名前と値を書いています。',
    ],
    listLabel: '用意する組み合わせ',
    items: SCATTER_PRESET_IDS.map((id) => ({ name: SCATTER_PRESET_LABELS[id], description: SCATTER_PRESET_DESCRIPTIONS[id] })),
  },
  /** 本体の縦の下限 [rem]。図と読み取りの行が収まる高さ。 */
  minBodyHeightRem: 20,
} as const;
