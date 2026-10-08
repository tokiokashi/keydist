/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 * `definition.tsx` を読み込まずに名前だけ読めるよう、ReactにもCSSにも依存させない。
 */
export const FINGER_DISTANCE_PANE_META = {
  name: '指ごとの距離',
  description: '同じテキストを打った時の、指ごとの移動距離と押下数を左右の手に分けて並べる。隣り合う指の間隔のばらつき（標準偏差）も出す。',
} as const;
