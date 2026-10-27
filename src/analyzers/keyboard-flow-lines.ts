import { aggregateBigramVectors, buildBigramVectors, type BigramSource, type BigramVector, type VectorHand } from './bigram-vectors.ts';
import type { Stroke } from '#trace/generate.ts';

/**
 * 2打鍵の流れの線（Keyboard Flow）の、Analyzerどうしで共有する純粋な計算と描き方の決まり。
 * Bigram Flowの配列図とヒートマップの図が、同じ組・同じ色・同じ太さの尺度で線を描くために、
 * 組の数え方・色分け・線の幾何・太さの尺度をここに1つだけ置く。
 */

export type KeyboardFlowWeightScale = 'linear' | 'sqrt' | 'log';

/** 線の色。値は `--viz-flow-*`（テーマ）の変数。 */
export const FLOW_COLORS = {
  left: 'var(--viz-flow-left)',
  right: 'var(--viz-flow-right)',
  cross: 'var(--viz-flow-cross)',
  inward: 'var(--viz-flow-inward)',
  outward: 'var(--viz-flow-outward)',
  same: 'var(--viz-flow-cross)',
} as const;

/** 線の始点と終点の不透明度。始点が薄く終点が濃いので、向きが読める。 */
export const FLOW_GRADIENT_START_OPACITY = 0.16;
export const FLOW_GRADIENT_END_OPACITY = 0.96;

export interface KeyboardFlowVectorLike {
  readonly id: string;
  readonly weight: number;
  readonly distance: number;
  readonly hand: VectorHand;
}

/** 線の色の種類。指の2本を選んだ時の向き（`showRollDirection`）が無ければ、手で決まる。 */
export function edgeKind(vector: BigramVector, showRollDirection: boolean): keyof typeof FLOW_COLORS {
  if (showRollDirection && vector.fingerDirection !== undefined) return vector.fingerDirection;
  return vector.hand;
}

export interface FlowPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * 2点を結ぶ線のSVGのpath。往復で弧の側を反転させず、ほぼ全てを同じ側へ浅く持ち上げる。
 * 点の座標は描く側の座標系で、持ち上げる量はその座標系の長さで決まる。
 */
export function flowEdgePath(start: FlowPoint, end: FlowPoint, scale = 1): string {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);

  if (length < 0.01) return `M ${start.x} ${start.y}`;

  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const ux = dx / length;
  const uy = dy / length;

  let nx = -uy;
  let ny = ux;
  if (ny > 0 || (Math.abs(ny) < 0.15 && nx < 0)) {
    nx *= -1;
    ny *= -1;
  }
  // 持ち上げる量の限界は、座標系の大きさ `scale`（Bigram Flowの座標系を1とした比）に比例させる
  const bend = Math.min(8 * scale, Math.max(2.5 * scale, length * 0.025));
  const control = {
    x: mid.x + nx * bend,
    y: mid.y + ny * bend,
  };
  return `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
}

/** 太さの尺度。組数 `weight` を最大値 `maxWeight` に対する0〜1へ変える。 */
export function scaleKeyboardFlowWeight(weight: number, maxWeight: number, scale: KeyboardFlowWeightScale): number {
  if (maxWeight <= 0 || weight <= 0) return 0;
  const ratio = Math.min(1, weight / maxWeight);
  if (scale === 'sqrt') return Math.sqrt(ratio);
  if (scale === 'log') return Math.log1p(weight) / Math.log1p(maxWeight);
  return ratio;
}

/** 同一キーへ戻るrepeat（物理移動が無い）vectorを除く。KeyboardFlowの線・最大weightはこの集合だけを見る。 */
export function nonStationaryVectors<T extends KeyboardFlowVectorLike>(vectors: readonly T[]): readonly T[] {
  return vectors.filter((vector) => vector.distance >= 1e-6);
}

/**
 * 縮めた時に優先するのは線の見え方。線は画面上でこの太さを下回らないよう、
 * 縮尺が下がるほどユーザー座標の側で太くする。
 */
export const MIN_LINE_SCREEN_PX = 1.25;

/** 線の太さ（ユーザー座標）。`zoom` は 画面上のSVG幅 / ユーザー座標の幅。 */
export function flowLineWidth(baseWidth: number, zoom: number): number {
  if (!(zoom > 0)) return baseWidth;
  return Math.max(baseWidth, MIN_LINE_SCREEN_PX / zoom);
}

/** 指を絞らない時のKeyboard Flowが描く線。集約した組から、連打を除いたもの。 */
export interface KeyboardFlowLines {
  readonly vectors: readonly BigramVector[];
  /** `vectors` の組数の最大値。線が無ければ1 */
  readonly maxWeight: number;
}

/** 指を絞らない時のKeyboard Flowが描く線を、打鍵の列から数える。 */
export function keyboardFlowLines(strokes: readonly Stroke[], source: BigramSource): KeyboardFlowLines {
  const vectors = nonStationaryVectors(aggregateBigramVectors(buildBigramVectors(strokes, source)));
  return { vectors, maxWeight: Math.max(1, ...vectors.map((vector) => vector.weight)) };
}
