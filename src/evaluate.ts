import { ALL_FINGERS, dist, type Finger, type Geometry, type Key, type Point } from './geometry.ts';
import { buildCharMap, type Layout } from './layouts/index.ts';

export interface Options {
  /** 窓幅 N（打鍵単位）。この打鍵数までは指を残したとみなす */
  windowSize: number;
  /**
   * 同指連続（g=0）で打鍵先がその指のホームキー自身のとき、移動を加算するか。
   * false にすると距離 0 として扱う。
   */
  sfbHomeCost: boolean;
}

export const DEFAULT_OPTIONS: Options = {
  windowSize: 3,
  sfbHomeCost: true,
};

/** 1 打鍵の記録 */
export interface Stroke {
  /** 通し番号 */
  index: number;
  char: string;
  key: Key;
  finger: Finger;
  /** 前回打鍵からの間隔（間に挟まった他の打鍵数） */
  gap: number;
  /** この打鍵で計上された移動距離 [u] */
  distance: number;
  /** 打鍵直前の全指位置 */
  positions: Record<Finger, Point>;
}

export interface Trace {
  strokes: Stroke[];
  /** 配列に存在せず打鍵できなかった文字数 */
  skipped: number;
}

/**
 * 仕様 §8。テキストを打鍵列へ展開し、各打鍵の移動距離を求める。
 *
 * g = 0        → d_stay               （同指連続。戻る時間がない）
 * 1 ≤ g ≤ N    → min(d_stay, d_home)  （残す選択肢が比較に入る）
 * g > N        → d_home               （復帰済み）
 *
 * ホームへの復帰移動そのものは計上しない（§6 R2）。
 */
export function evaluate(
  text: string,
  layout: Layout,
  geometry: Geometry,
  options: Options = DEFAULT_OPTIONS,
): Trace {
  const charMap = buildCharMap(layout);

  const prev = {} as Record<Finger, Point>;
  const last = {} as Record<Finger, number>;
  for (const finger of ALL_FINGERS) {
    prev[finger] = geometry.homes[finger];
    last[finger] = Number.NEGATIVE_INFINITY;
  }

  const strokes: Stroke[] = [];
  let skipped = 0;
  let index = 0;

  for (const raw of text) {
    const char = raw.toLowerCase();
    const target = charMap.get(char);
    if (!target) {
      skipped++;
      continue;
    }

    const key =
      target.kind === 'thumb' ? geometry.thumbs[target.side] : geometry.grid[target.row][target.col];
    const finger = key.finger;
    const home = geometry.homes[finger];

    const gap = index - last[finger] - 1;
    const dStay = dist(prev[finger], key);
    const dHome = dist(home, key);

    let distance: number;
    if (gap === 0) {
      distance = !options.sfbHomeCost && key.x === home.x && key.y === home.y ? 0 : dStay;
    } else if (gap <= options.windowSize) {
      distance = Math.min(dStay, dHome);
    } else {
      distance = dHome;
    }

    strokes.push({
      index,
      char,
      key,
      finger,
      gap,
      distance,
      positions: snapshot(prev, last, index, geometry, options.windowSize),
    });

    prev[finger] = key;
    last[finger] = index;
    index++;
  }

  return { strokes, skipped };
}

/**
 * 仕様 §9。打鍵 i の時点での全指位置。
 * 経過が N 以下なら前回打鍵したキー、超えていればホーム。
 */
function snapshot(
  prev: Record<Finger, Point>,
  last: Record<Finger, number>,
  index: number,
  geometry: Geometry,
  windowSize: number,
): Record<Finger, Point> {
  const out = {} as Record<Finger, Point>;
  for (const finger of ALL_FINGERS) {
    const elapsed = index - last[finger] - 1;
    out[finger] = elapsed <= windowSize ? prev[finger] : geometry.homes[finger];
  }
  return out;
}
