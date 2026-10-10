import { classifyPresentationFaces, faceDisplayCells, orderedPresentationLayers, type Layer } from '#input/layouts/layers.ts';
import { SINGLE_LAYER_ID, type Layout } from '#input/layouts/types.ts';

/**
 * ヒートマップとヒートマップ（レイヤー）が同じ図（`heatmap-diagram.tsx`）を描くための、
 * 純粋な計算。Analyzerどうしは互いをimportしないので、2つが共有するものをここに置く。
 */

/** 色の尺度。仕様 §11.10の線形・対数。 */
export type HeatmapColorScale = 'linear' | 'log';

/** 配列が宣言した層を、元の面の出現順に並べる。層の宣言が無い配列は、全キーを1枚にする。 */
export function presentationLayersOf(layout: Layout): Layer[] {
  const layers = orderedPresentationLayers(classifyPresentationFaces(layout));
  if (layers.length === 0) layers.push({ id: SINGLE_LAYER_ID, role: 'layer', order: 0, faces: [] });
  return layers;
}

/** 層が持つキーの刻印。層が面を持たない（単打だけの）時は配列の刻印を使う。 */
export function layerLegends(layer: Layer, layout: Layout): Map<string, string> {
  if (layer.faces.length === 0) return new Map(layout.legends);
  const cells = new Map<string, string>();
  for (const face of layer.faces) {
    for (const [key, label] of faceDisplayCells(face)) {
      const previous = cells.get(key);
      cells.set(key, previous === undefined ? label : `${previous} / ${label}`);
    }
  }
  return cells;
}

/** ヒートマップの図の刻印。単打の層（無ければ最初の層）の刻印を使う。 */
export function baseLayerLegends(layout: Layout): Map<string, string> {
  const presentation = presentationLayersOf(layout);
  const base = presentation.find((layer) => layer.id === SINGLE_LAYER_ID) ?? presentation[0]!;
  return layerLegends(base, layout);
}

/** 色の強度 `t`（0〜1）。仕様 §11.10の線形・対数。 */
export function heatIntensity(count: number, maxCount: number, scale: HeatmapColorScale): number {
  const max = Math.max(1, maxCount);
  return scale === 'log' ? Math.log1p(count) / Math.log1p(max) : count / max;
}
