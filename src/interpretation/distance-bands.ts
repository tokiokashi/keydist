import type { Trace } from '#trace/generate.ts';
import { buildSpanIndex } from './span-metrics.ts';

/**
 * 1文字ごとの移動距離を、1キー分の距離（1u）に丸めた区分に分けて数える（定義は `docs/segment-metrics.md`「1かなごとの移動距離の割合」）。
 * 距離モデルの値は変えない。`SpanIndex` が文字位置に帰属させた距離（`distanceAt`）を、区分に振り分けて数え直すだけにする。
 */

/**
 * 区分の境目 [u]。1キー分の距離の半分の刻みで、どの物理配列でも同じ値を使う。
 * 距離 `d` は、`d < 0.5`、`0.5 ≤ d < 1.5`、`1.5 ≤ d < 2.5`、`2.5 ≤ d` の4つに分かれる。境目ちょうどの値は上の区分に入る。
 */
export const DISTANCE_BAND_EDGES = [0.5, 1.5, 2.5] as const;

/** 区分の数。 */
export const DISTANCE_BAND_COUNT = DISTANCE_BAND_EDGES.length + 1;

/** 距離 `d` [u] の区分の番号（0が最も小さい区分）。 */
export function distanceBandOf(distance: number): number {
  let band = 0;
  for (const edge of DISTANCE_BAND_EDGES) if (distance >= edge) band++;
  return band;
}

export interface DistanceBandCounts {
  /** 区分ごとの文字数（距離の小さい区分から）。和は `typed` */
  readonly counts: readonly number[];
  /** 数えた文字の数（打てた文字の数。割合の分母） */
  readonly typed: number;
  /** 打てない文字の数（数えていない） */
  readonly skipped: number;
}

/**
 * 文字位置ごとの距離を区分に数える。打鍵できなかった文字（`Trace.skippedPositions`）は数えない。
 * 打てない文字の距離は0なので、数えると最も小さい区分の割合が大きく見える。
 * ローマ字配列で一部の英字だけ打てたかなも、打てなかった英字の分の距離を持たないので数えない。
 */
export function distanceBandCounts(distanceAt: ArrayLike<number>, skippedPositions: readonly number[]): DistanceBandCounts {
  const skippedSet = new Set(skippedPositions.filter((position) => position >= 0 && position < distanceAt.length));
  const counts = new Array<number>(DISTANCE_BAND_COUNT).fill(0);
  let typed = 0;
  for (let position = 0; position < distanceAt.length; position++) {
    if (skippedSet.has(position)) continue;
    counts[distanceBandOf(distanceAt[position]!)]!++;
    typed++;
  }
  return { counts, typed, skipped: skippedSet.size };
}

export function traceDistanceBandCounts(trace: Trace): DistanceBandCounts {
  return distanceBandCounts(buildSpanIndex(trace).distanceAt, trace.skippedPositions);
}

/** 区分ごとの割合（0〜1）。打てた文字が0なら `undefined`（0として扱わない）。 */
export function distanceBandShares(counted: DistanceBandCounts): readonly number[] | undefined {
  return counted.typed === 0 ? undefined : counted.counts.map((count) => count / counted.typed);
}
