import { WIDE_RECOMMENDED_WIDTH_REM } from '../recommended-width.ts';
import { COMPARISON_COLUMN_IDS, COMPARISON_COLUMN_TEXT, COMPARISON_UNIT_NOTE } from './column-text.ts';

/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 *
 * `definition.tsx`（本体・解析設定のcomponentとCSSを持つ）から分けて置くのは、routeの`<title>`が
 * 名前を読むためだけに`definition.tsx`をimportすると、Analyzerのcomponent・CSS・描画ライブラリが
 * 全ページの初期読み込みに入ってしまうため。ここはReactにもCSSにも依存させない。
 */
export const COMPARISON_PANE_META = {
  name: '比較表',
  description: '選んだ配列やSetupで同じテキストを打った時の、指の移動距離などの数値を表に並べます。基準を選ぶと、基準に対する割合も出せます。',
  /**
   * 見出しのⓘから開く説明。全列の説明を列名と組で出す（今表示している列には絞らない。
   * 解析設定に依らない固定の文なので、Workspaceのペインの見出し（解析設定を持たない枠）からも開ける）。
   */
  help: {
    notes: [COMPARISON_UNIT_NOTE],
    listLabel: '列の説明',
    items: COMPARISON_COLUMN_IDS.map((id) => ({ name: COMPARISON_COLUMN_TEXT[id].label, description: COMPARISON_COLUMN_TEXT[id].description })),
  },
  /** 列が多く横に並ぶので、他より広く取る。 */
  recommendedWidthRem: WIDE_RECOMMENDED_WIDTH_REM,
} as const;
