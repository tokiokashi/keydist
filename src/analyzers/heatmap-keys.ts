import { visibleGeometryKeys } from '#input/layouts/physical-keys.ts';
import type { Layout } from '#input/layouts/types.ts';
import { drawnKeySpans, type DrawnKeySpan } from '#input/shapes/drawn-key-spans.ts';
import { isPresetGeometryKind, LEFT_COLUMN_KEYS, presetGeometryTopology, SHIFT_KEY, type Geometry, type Key } from '#input/shapes/geometry.ts';

/** ヒートマップの図のキー1個分の大きさ（描画の座標系）。 */
export const HEATMAP_KEY_SIZE = 30;

/** 描くキーの範囲の外側の余白。 */
export const HEATMAP_PAD = 6;

/** 配列が使うかどうかに関係なく、ヒートマップの図に常に描くキー。左端の列と左右のShift。 */
const ALWAYS_DRAWN_KEYS: readonly string[] = [...LEFT_COLUMN_KEYS, SHIFT_KEY.L, SHIFT_KEY.R];

/** 図に描く1キー。`left`・`width`は文字キー1個分の幅（u）を単位にした描く範囲。 */
export interface HeatmapDrawnKey {
  readonly key: Key;
  readonly left: number;
  readonly width: number;
  /** 配列が使わないために、枠だけで描くキー。押下数は0で、選択もツールチップも持たない。 */
  readonly unused: boolean;
}

/** 実寸の幅で描くのは、組み込みのrow-staggeredの物理配列だけ（自作の物理配列は段ずれが揃う保証が無いため1uに詰める）。 */
function drawsActualRowStart(geometry: Geometry): boolean {
  return isPresetGeometryKind(geometry.id) && presetGeometryTopology(geometry.id) === 'row-staggered';
}

/**
 * ヒートマップの図に描くキー。配列が使うキーに加えて、左端の列のキーと左右のShiftを、物理配列が持つ限り常に描く。
 * 物理配列が持たないキーは補わない。
 */
export function heatmapDrawnKeys(layout: Pick<Layout, 'canonicalInputs'>, geometry: Geometry): readonly HeatmapDrawnKey[] {
  const visible = visibleGeometryKeys(layout, geometry);
  const visibleIds = new Set(visible.map((key) => key.id));
  const keys = [...visible];
  for (const id of ALWAYS_DRAWN_KEYS) {
    const key = geometry.keys.get(id);
    if (key !== undefined && !visibleIds.has(id)) keys.push(key);
  }
  const spans = drawnKeySpans(keys, { actualRowStart: drawsActualRowStart(geometry) });
  return keys.map((key) => {
    const span: DrawnKeySpan = spans.get(key.id)!;
    return { key, left: span.left, width: span.width, unused: !visibleIds.has(key.id) };
  });
}

/** 描くキーの範囲（描画の座標系）。原点を必ず含む。 */
export interface HeatmapBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** 描くキーを全部含む範囲。 */
export function heatmapBounds(keys: readonly HeatmapDrawnKey[]): HeatmapBounds {
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  for (const item of keys) {
    const x = item.left * HEATMAP_KEY_SIZE;
    const y = item.key.y * HEATMAP_KEY_SIZE;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + item.width * HEATMAP_KEY_SIZE);
    maxY = Math.max(maxY, y + HEATMAP_KEY_SIZE);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * 並べた図の全部で共通にする描く範囲。各図の範囲の和にするので、キーを持たない部分は空白のまま描く。
 * 色の尺度の最大値（`sharedMaxCount`）と同じく、計算できた図の範囲だけを渡す。図が無ければ `undefined`。
 */
export function sharedHeatmapBounds(bounds: readonly HeatmapBounds[]): HeatmapBounds | undefined {
  if (bounds.length === 0) return undefined;
  return {
    minX: Math.min(...bounds.map((item) => item.minX)),
    minY: Math.min(...bounds.map((item) => item.minY)),
    maxX: Math.max(...bounds.map((item) => item.maxX)),
    maxY: Math.max(...bounds.map((item) => item.maxY)),
  };
}

/** `<svg>` の `viewBox` の値。範囲の外側に余白を足す。 */
export function heatmapViewBox(bounds: HeatmapBounds): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  return {
    x: bounds.minX - HEATMAP_PAD / 2,
    y: bounds.minY - HEATMAP_PAD / 2,
    width: bounds.maxX - bounds.minX + HEATMAP_PAD,
    height: bounds.maxY - bounds.minY + HEATMAP_PAD,
  };
}
