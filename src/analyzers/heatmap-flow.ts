import type { BigramVector } from './bigram-vectors.ts';
import { flowEdgePath, flowLineWidth, scaleKeyboardFlowWeight, type FlowPoint } from './keyboard-flow-lines.ts';

/**
 * ヒートマップの図に重ねる2打鍵の線の、位置と太さの決め方（純粋な計算）。
 * 組の数え方・色・曲線の形・太さの尺度はKeyboard Flowと共有する（`keyboard-flow-lines.ts`）。
 * ここに置くのは、ヒートマップの図の座標系（`heatmap-keys.ts`）に合わせる部分だけ。
 */

/** 線の太さ（描画の座標系）の下限と、組数の尺度が1の時に足す分。キー1個分が30の図で、Bigram Flowの図と同じ見え方になる大きさ。 */
const FLOW_WIDTH_BASE = 0.25;
const FLOW_WIDTH_RANGE = 3.2;

/**
 * 持ち上げる量の限界を、Bigram Flowの図の座標系に対する比で表す。
 * ヒートマップの図はキー1個分が30、Bigram Flowの図はキー1個分が58。
 */
const FLOW_BEND_SCALE = 30 / 58;

/**
 * 線の太さ（描画の座標系）。太さは組数に比例させ、尺度の最大値 `maxWeight` は図の全部で共通にする。
 * `zoom` は画面上のSVG幅 / 描画の座標系の幅。縮んだ図でも、線は画面上で一定の太さを下回らない。
 */
export function heatmapFlowStrokeWidth(weight: number, maxWeight: number, zoom: number): number {
  return flowLineWidth(FLOW_WIDTH_BASE + FLOW_WIDTH_RANGE * scaleKeyboardFlowWeight(weight, maxWeight, 'linear'), zoom);
}

/** 図に描く線1本。 */
export interface HeatmapFlowSegment {
  readonly vector: BigramVector;
  readonly start: FlowPoint;
  readonly end: FlowPoint;
  readonly path: string;
}

/** 押したキー（コンボは複数）の、図に描いたキーの中心の平均。図に描いたキーが1つも無ければ `undefined`。 */
function endpointOf(keyIds: readonly string[], centers: ReadonlyMap<string, FlowPoint>): FlowPoint | undefined {
  const points = keyIds.flatMap((id) => {
    const point = centers.get(id);
    return point === undefined ? [] : [point];
  });
  if (points.length === 0) return undefined;
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

/**
 * 線の組を、図に描いたキーの中心を端にした線へ変える。太い線を先に、細い線を後（前面）に並べる。
 * 端のキーが図に描かれていない組は、描かない。
 */
export function heatmapFlowSegments(vectors: readonly BigramVector[], centers: ReadonlyMap<string, FlowPoint>): readonly HeatmapFlowSegment[] {
  const segments: HeatmapFlowSegment[] = [];
  for (const vector of vectors) {
    const start = endpointOf(vector.fromKeyIds, centers);
    const end = endpointOf(vector.toKeyIds, centers);
    if (start === undefined || end === undefined) continue;
    segments.push({ vector, start, end, path: flowEdgePath(start, end, FLOW_BEND_SCALE) });
  }
  return segments.sort((a, b) => b.vector.weight - a.vector.weight || a.vector.id.localeCompare(b.vector.id));
}
