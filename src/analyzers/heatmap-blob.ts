/**
 * ヒートマップの「熱の塊」の描き方で使う、純粋な計算。
 * キーごとの色の強度（0〜1）を中心にした塊を重ね、重なった所は足さずに濃い方を取る。
 * 足すと、押下数の少ないキーが集まった所が押下数の多いキー1つより濃くなり、尺度の上限（強度1）も超えるため。
 */

/** 塊が届く距離 [キーの辺の長さの倍]。 */
export const HEAT_BLOB_RADIUS_KEYS = 1.6;

/** 強度を段に区切る数。段ごとに不透明度を変えた矩形で描き、ぼかしで滑らかにする。 */
export const HEAT_BLOB_LEVELS = 24;

/** 塊の中心と強度。 */
export interface HeatBlobSource {
  readonly x: number;
  readonly y: number;
  /** 中心での強度（0〜1）。0の塊は描かない */
  readonly intensity: number;
}

/** 塊の形。中心で1、`radius` で0になり、端の傾きが0に近いなめらかな山。 */
function falloff(distance: number, radius: number): number {
  if (distance >= radius) return 0;
  const t = 1 - (distance / radius) ** 2;
  return t * t;
}

/** 点 `(x, y)` の強度。塊ごとの強度のうち最大。 */
export function heatBlobIntensityAt(sources: readonly HeatBlobSource[], x: number, y: number, radius: number): number {
  let peak = 0;
  for (const source of sources) {
    if (source.intensity <= 0) continue;
    const value = source.intensity * falloff(Math.hypot(x - source.x, y - source.y), radius);
    if (value > peak) peak = value;
  }
  return peak;
}

/** 強度を段（0〜`HEAT_BLOB_LEVELS`）に丸める。 */
export function heatBlobLevel(intensity: number): number {
  return Math.round(Math.min(1, Math.max(0, intensity)) * HEAT_BLOB_LEVELS);
}

/** 同じ段が横に続く範囲を1つにした矩形。 */
export interface HeatBlobRun {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** 1〜`HEAT_BLOB_LEVELS` */
  readonly level: number;
}

export interface HeatBlobArea {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** `area` を `cell` 四方の升に分け、強度が0でない升を、同じ段が横に続く範囲ごとの矩形にして返す。 */
export function heatBlobRuns(sources: readonly HeatBlobSource[], area: HeatBlobArea, cell: number, radius: number): HeatBlobRun[] {
  const runs: HeatBlobRun[] = [];
  if (!sources.some((source) => source.intensity > 0)) return runs;
  for (let y = area.minY; y < area.maxY; y += cell) {
    const height = Math.min(cell, area.maxY - y);
    let current: { x: number; level: number } | undefined;
    const flush = (end: number) => {
      if (current !== undefined && current.level > 0)
        runs.push({
          x: current.x,
          y,
          width: end - current.x,
          height,
          level: current.level,
        });
    };
    for (let x = area.minX; x < area.maxX; x += cell) {
      const width = Math.min(cell, area.maxX - x);
      const level = heatBlobLevel(heatBlobIntensityAt(sources, x + width / 2, y + height / 2, radius));
      if (current === undefined || current.level !== level) {
        flush(x);
        current = { x, level };
      }
    }
    flush(area.maxX);
  }
  return runs;
}
