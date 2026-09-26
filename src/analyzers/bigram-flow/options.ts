import type { BigramSource, FingerClass } from './bigram-vectors.ts';
import type { MovementScaleMode } from './movement-profile-scale.ts';

export type KeyboardFlowWeightScale = 'linear' | 'sqrt' | 'log';
export type KeyboardFlowLayerOrder = 'weight' | 'same-hand-top' | 'cross-hand-top';
export type KeyboardFlowHoverScale = 'key' | 'global';

export interface BigramFlowDisplayConfig {
  source: BigramSource;
  selectedFingers: readonly FingerClass[];
  lineScale: KeyboardFlowWeightScale;
  layerOrder: KeyboardFlowLayerOrder;
  hoverScale: KeyboardFlowHoverScale;
  movementScaleMode: MovementScaleMode;
  polarBandwidth: number;
  polarGain: number;
}

export const DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG: BigramFlowDisplayConfig = {
  source: 'actual',
  selectedFingers: [],
  lineScale: 'linear',
  layerOrder: 'weight',
  hoverScale: 'key',
  movementScaleMode: 'fit',
  polarBandwidth: 5,
  polarGain: 1,
};

export interface KeyboardFlowVectorLike {
  readonly id: string;
  readonly weight: number;
  readonly distance: number;
  readonly hand: 'left' | 'right' | 'cross';
}

export interface KeyboardFlowOutgoingVectorLike {
  readonly weight: number;
  readonly fromKeyIds: readonly string[];
}

/**
 * hoveredKeyId始点のedgeに限定した最大weightを求める。
 * ホバー中の太さ基準を「そのキーだけ」にする時の分母になる。
 */
export function computeOutgoingMaxWeight(
  vectors: readonly KeyboardFlowOutgoingVectorLike[],
  hoveredKeyId: string | null,
): number {
  if (hoveredKeyId === null) return 0;
  let max = 0;
  for (const vector of vectors) {
    if (!vector.fromKeyIds.includes(hoveredKeyId)) continue;
    if (vector.weight > max) max = vector.weight;
  }
  return max;
}

/**
 * strokeWidthの計算に使う最大weightを、ホバー状態と設定から決める。
 * 「そのキーだけ」設定でも、hoveredKeyIdが始点でないedge（=非表示側で減光中）は
 * 全体基準のまま揺れないようにする。
 */
export function resolveKeyboardFlowMaxWeight(
  vector: KeyboardFlowOutgoingVectorLike,
  globalMaxWeight: number,
  keyMaxWeight: number,
  hoverScale: KeyboardFlowHoverScale,
  hoveredKeyId: string | null,
): number {
  if (hoverScale !== 'key' || hoveredKeyId === null) return globalMaxWeight;
  if (!vector.fromKeyIds.includes(hoveredKeyId)) return globalMaxWeight;
  return keyMaxWeight;
}

export function scaleKeyboardFlowWeight(
  weight: number,
  maxWeight: number,
  scale: KeyboardFlowWeightScale,
): number {
  if (maxWeight <= 0 || weight <= 0) return 0;
  const ratio = Math.min(1, weight / maxWeight);
  if (scale === 'sqrt') return Math.sqrt(ratio);
  if (scale === 'log') return Math.log1p(weight) / Math.log1p(maxWeight);
  return ratio;
}

function layerRank(
  hand: KeyboardFlowVectorLike['hand'],
  order: KeyboardFlowLayerOrder,
): number {
  if (order === 'same-hand-top') return hand === 'cross' ? 0 : 1;
  if (order === 'cross-hand-top') return hand === 'cross' ? 1 : 0;
  return 0;
}

/**
 * SVGは後から描いたpathが前面になる。
 * group priority -> weight降順 -> stable id の順で並べ、各group内は太い線を先に描き、
 * 細い線を最後（最前面）に描く。太いedgeが細いedgeを覆い隠さないようにするため。
 */
export function orderKeyboardFlowVectors<T extends KeyboardFlowVectorLike>(
  vectors: readonly T[],
  order: KeyboardFlowLayerOrder,
): readonly T[] {
  return [...vectors]
    .filter((vector) => vector.distance >= 1e-6)
    .sort((a, b) =>
      layerRank(a.hand, order) - layerRank(b.hand, order)
      || b.weight - a.weight
      || a.id.localeCompare(b.id));
}
