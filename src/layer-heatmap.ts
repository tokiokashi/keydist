import type { Layer } from './layers.ts';

export interface LayerColorData {
  /** ツールチップにも使う実際のキー押下数 */
  keyCounts: ReadonlyMap<string, number>;
  /** 実際に層操作として押した回数 */
  triggerKeyCounts: ReadonlyMap<string, number>;
}

/** 相互シフトの両トリガーを表示上の通常押下として色に残すか。 */
function keepsReciprocalTriggers(layer: Layer): boolean {
  return layer.faces.length === 2 && layer.faces.every((face) => face.mode === 'simultaneous');
}

/** 層別ヒートマップの色用押下数を作る。実測値は `data.keyCounts` のまま残す。 */
export function normalizedLayerColors(
  layer: Layer,
  data: LayerColorData,
  normalizedTriggerCounts: ReadonlyMap<string, number> = data.triggerKeyCounts,
): Map<string, number> {
  const colorCounts = new Map(data.keyCounts);
  if (keepsReciprocalTriggers(layer)) return colorCounts;

  for (const [key, count] of normalizedTriggerCounts) {
    const remaining = (colorCounts.get(key) ?? 0) - count;
    if (remaining > 0) colorCounts.set(key, remaining);
    else colorCounts.delete(key);
  }
  return colorCounts;
}
