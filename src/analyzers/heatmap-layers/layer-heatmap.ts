import type { Layer } from '#input/layouts/layers.ts';
import type { LayerPresentationRole } from '#input/layouts/types.ts';

export interface LayerColorData {
  /** ツールチップにも使う実際のキー押下数 */
  keyCounts: ReadonlyMap<string, number>;
  /** 実際に層操作として押した回数 */
  triggerKeyCounts: ReadonlyMap<string, number>;
  /** 層トリガーを複数同時押下したときの、そのトリガーの回数 */
  pairedTriggerKeyCounts: ReadonlyMap<string, number>;
}

/** 修飾面のトリガーは、詳細表示でも通常の層操作キーとして除外する。 */
function keepsPairedTriggers(role: LayerPresentationRole | undefined): boolean {
  return role !== 'modifier';
}

/** ヒートマップ（レイヤー）の色用押下数を作る。実測値は `data.keyCounts` のまま残す。 */
export function normalizedLayerColors(
  layer: Layer,
  data: LayerColorData,
): Map<string, number> {
  return normalizedRoleColors(layer.role, data);
}

/** 層の表示区分から色用押下数を作る。表示用の `Layer` を持たない抽出が使う。 */
export function normalizedRoleColors(
  role: LayerPresentationRole | undefined,
  data: LayerColorData,
): Map<string, number> {
  const colorCounts = new Map(data.keyCounts);
  for (const [key, count] of data.triggerKeyCounts) {
    const remaining = (colorCounts.get(key) ?? 0) - count;
    if (remaining > 0) colorCounts.set(key, remaining);
    else colorCounts.delete(key);
  }
  if (!keepsPairedTriggers(role)) return colorCounts;
  for (const [key, count] of data.pairedTriggerKeyCounts) {
    colorCounts.set(key, (colorCounts.get(key) ?? 0) + count);
  }
  return colorCounts;
}
