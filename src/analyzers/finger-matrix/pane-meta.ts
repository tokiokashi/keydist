import { WIDE_RECOMMENDED_WIDTH_REM } from '../recommended-width.ts';
import { FINGER_MATRIX_SURFACE_TEXT } from './surface-text.ts';
import { FINGER_MATRIX_SURFACE_IDS } from './options.ts';

/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 * `definition.tsx` を読み込まずに名前だけ読めるよう、ReactにもCSSにも依存させない。
 */
export const FINGER_MATRIX_PANE_META = {
  name: '指ごとの比較',
  description: '配列ごとに、指ごとの押下数・移動距離・同指連続などの値を表で並べて比べます。見る量は解析設定で切り替えます。',
  /**
   * 見出しのⓘから開く説明。全ての見る量の説明を名前と組で出す（今の見る量には絞らない。
   * 解析設定に依らない固定の文なので、Workspaceのペインの見出しからも開ける）。
   */
  help: {
    notes: [
      '距離の単位uは、キーの幅を1とした距離。',
      '押下数と移動距離は、入力1文字あたりに直した値を表に出します。',
    ],
    listLabel: '見る量の説明',
    items: FINGER_MATRIX_SURFACE_IDS.map((id) => ({
      name: FINGER_MATRIX_SURFACE_TEXT[id].label,
      description: FINGER_MATRIX_SURFACE_TEXT[id].description,
    })),
  },
  /** 指の列が10本並ぶので、他より広く取る。 */
  recommendedWidthRem: WIDE_RECOMMENDED_WIDTH_REM,
} as const;
