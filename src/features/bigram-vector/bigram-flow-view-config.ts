export type KeyboardFlowWeightScale = 'linear' | 'sqrt' | 'log';
export type KeyboardFlowLayerOrder = 'weight' | 'same-hand-top' | 'cross-hand-top';

export interface KeyboardFlowVectorLike {
  readonly id: string;
  readonly weight: number;
  readonly distance: number;
  readonly hand: 'left' | 'right' | 'cross';
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
 * group priority -> weight -> stable id の順で並べ、各group内は従来どおり
 * 細い線から太い線へ描画する。
 */
export function orderKeyboardFlowVectors<T extends KeyboardFlowVectorLike>(
  vectors: readonly T[],
  order: KeyboardFlowLayerOrder,
): readonly T[] {
  return [...vectors]
    .filter((vector) => vector.distance >= 1e-6)
    .sort((a, b) =>
      layerRank(a.hand, order) - layerRank(b.hand, order)
      || a.weight - b.weight
      || a.id.localeCompare(b.id));
}
