import type { Layer } from '#input/layouts/layers.ts';

export interface LayerColorData {
  /** ツールチップにも使う実際のキー押下数 */
  keyCounts: ReadonlyMap<string, number>;
  /** 実際に層操作として押した回数 */
  triggerKeyCounts: ReadonlyMap<string, number>;
  /** 層トリガーを複数同時押下したときの、そのトリガーの回数 */
  pairedTriggerKeyCounts: ReadonlyMap<string, number>;
}

/** 修飾面のトリガーは、詳細表示でも通常の層操作キーとして除外する。 */
function keepsPairedTriggers(layer: Layer): boolean {
  return layer.role !== 'modifier';
}

/** 層別ヒートマップの色用押下数を作る。実測値は `data.keyCounts` のまま残す。 */
export function normalizedLayerColors(
  layer: Layer,
  data: LayerColorData,
): Map<string, number> {
  const colorCounts = new Map(data.keyCounts);
  for (const [key, count] of data.triggerKeyCounts) {
    const remaining = (colorCounts.get(key) ?? 0) - count;
    if (remaining > 0) colorCounts.set(key, remaining);
    else colorCounts.delete(key);
  }
  if (!keepsPairedTriggers(layer)) return colorCounts;
  for (const [key, count] of data.pairedTriggerKeyCounts) {
    colorCounts.set(key, (colorCounts.get(key) ?? 0) + count);
  }
  return colorCounts;
}
