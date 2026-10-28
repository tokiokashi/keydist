/**
 * ヒートマップの「サーモグラフィ」の描き方で使う、純粋な計算。
 * キーごとの強度（0〜1）を中心にした塊を重ね、重なった所は1 − Π(1 − 強度)で積み上げる。
 * 積み上げるのは、隣り合うキーの押下が重なった所に集まって見えるようにするため（手の押下が面としてどこに集まるかを読む図）。
 * 濃い方だけを取ると、キーごとの塗りをぼかしただけの図になり、集まりが見えない。
 * 強度が1を超えないので、色の尺度の上限（強度1）は保たれる。
 * 押下数の少ないキーが集まった所が、押下数の多いキー1つより濃くなることは受け入れる。
 *
 * 塊の形と重なり方は、Keyboard Layout Analyzerが使うheatmap.js 1.0に合わせる
 * （半径 `radius` の円を `shadowBlur` でぼかした影を、source-overで重ねる）。
 * 長さはキーの辺の長さを単位にする（heatmap.jsの `radius: 30` をキーの辺50で割った0.6、
 * `shadowBlur: 15` は標準偏差の2倍なので標準偏差7.5を50で割った0.15）。
 */

/** 塊の円の半径 [キーの辺の長さの倍]。 */
export const HEAT_BLOB_RADIUS_KEYS = 0.6;

/** 円を縁でぼかすガウスぼかしの標準偏差 [キーの辺の長さの倍]。 */
export const HEAT_BLOB_SIGMA_KEYS = 0.15;

/**
 * 強度を段に区切る数。段ごとに色か不透明度を変えた矩形で描く。
 * ライトの多色は色の区切りの幅が狭く（黄から赤が強度0.05）、段が粗いと同心の帯に見える。
 * 段を細かくすると、同じ段が横に続く範囲が短くなって矩形が増えるので、帯が目立たなくなる最小の段数にしてある。
 */
export const HEAT_BLOB_LEVELS = 64;

/**
 * 矩形の層全体に掛けるガウスぼかしの標準偏差（描画の座標系）。升の角と、段の境目の色の跳びをなだらかにする。
 * 升の辺（`heatBlobRuns` の `cell`）の半分にすると、升の角が見えなくなる。
 */
export const HEAT_BLOB_BLUR = 1;

/** 塊が届く距離 [キーの辺の長さの倍]。標準偏差の4倍まで見れば、取りこぼしは1万分の1より小さい。 */
const REACH_KEYS = HEAT_BLOB_RADIUS_KEYS + 4 * HEAT_BLOB_SIGMA_KEYS;

const PROFILE_STEP = 0.01;
const INTEGRATION_STEP = 0.02;

/**
 * 1つの塊の断面。中心からの距離 `i * PROFILE_STEP`（キーの辺の倍）での、円（強度1）にガウスぼかしを掛けた値。
 * 円の上に細かい升を敷き、各升からガウス分布（標準偏差 `HEAT_BLOB_SIGMA_KEYS`）の密度を足し合わせて求める。
 */
const PROFILE: readonly number[] = (() => {
  const sigma = HEAT_BLOB_SIGMA_KEYS;
  const cells: { x: number; y: number }[] = [];
  const half = Math.ceil(HEAT_BLOB_RADIUS_KEYS / INTEGRATION_STEP);
  for (let i = -half; i <= half; i++) {
    for (let j = -half; j <= half; j++) {
      const x = i * INTEGRATION_STEP;
      const y = j * INTEGRATION_STEP;
      if (Math.hypot(x, y) <= HEAT_BLOB_RADIUS_KEYS) cells.push({ x, y });
    }
  }
  const norm = (INTEGRATION_STEP * INTEGRATION_STEP) / (2 * Math.PI * sigma * sigma);
  const length = Math.ceil(REACH_KEYS / PROFILE_STEP) + 1;
  return Array.from({ length }, (_, index) => {
    const d = index * PROFILE_STEP;
    let sum = 0;
    for (const cell of cells) sum += Math.exp(-((cell.x - d) ** 2 + cell.y ** 2) / (2 * sigma * sigma));
    return Math.min(1, sum * norm);
  });
})();

/** 中心から `distanceKeys`（キーの辺の倍）離れた所での、強度1の塊の値（0〜1）。届かない距離では0。 */
export function heatBlobProfile(distanceKeys: number): number {
  const position = distanceKeys / PROFILE_STEP;
  const index = Math.floor(position);
  if (index < 0 || index >= PROFILE.length - 1) return 0;
  const fraction = position - index;
  return PROFILE[index]! * (1 - fraction) + PROFILE[index + 1]! * fraction;
}

/** 塊の中心と強度。 */
export interface HeatBlobSource {
  readonly x: number;
  readonly y: number;
  /** 中心での強度（0〜1）。0の塊は描かない */
  readonly intensity: number;
}

/** 点 `(x, y)` の強度。塊ごとの強度を 1 − Π(1 − 塊の値)で積み上げる。`keySize` はキーの辺の長さ（`x`・`y` と同じ座標系）。 */
export function heatBlobIntensityAt(sources: readonly HeatBlobSource[], x: number, y: number, keySize: number): number {
  let rest = 1;
  const reach = REACH_KEYS * keySize;
  for (const source of sources) {
    if (source.intensity <= 0) continue;
    const dx = x - source.x;
    const dy = y - source.y;
    if (Math.abs(dx) >= reach || Math.abs(dy) >= reach) continue;
    rest *= 1 - source.intensity * heatBlobProfile(Math.hypot(dx, dy) / keySize);
  }
  return 1 - rest;
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
export function heatBlobRuns(sources: readonly HeatBlobSource[], area: HeatBlobArea, cell: number, keySize: number): HeatBlobRun[] {
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
      const level = heatBlobLevel(heatBlobIntensityAt(sources, x + width / 2, y + height / 2, keySize));
      if (current === undefined || current.level !== level) {
        flush(x);
        current = { x, level };
      }
    }
    flush(area.maxX);
  }
  return runs;
}

/** ぼかしの重みを数える標準偏差の倍数の範囲。これより外の重みは1割に満たないので数えない。 */
const BLUR_REACH_SIGMAS = 2;
const BLUR_STEPS_PER_SIGMA = 2;

/** ぼかしの重み。中心からの距離（標準偏差の倍数）の2乗に応じたガウス分布。 */
const BLUR_OFFSETS: readonly { readonly dx: number; readonly dy: number; readonly weight: number }[] = (() => {
  const count = BLUR_REACH_SIGMAS * BLUR_STEPS_PER_SIGMA;
  const offsets: { dx: number; dy: number; weight: number }[] = [];
  let total = 0;
  for (let i = -count; i <= count; i++) {
    for (let j = -count; j <= count; j++) {
      const u = i / BLUR_STEPS_PER_SIGMA;
      const v = j / BLUR_STEPS_PER_SIGMA;
      const weight = Math.exp(-(u * u + v * v) / 2);
      offsets.push({ dx: u * HEAT_BLOB_BLUR, dy: v * HEAT_BLOB_BLUR, weight });
      total += weight;
    }
  }
  return offsets.map((offset) => ({ ...offset, weight: offset.weight / total }));
})();

/** ぼかした後の1点を作る、ぼかす前の段とその重み。重みの合計は1。段0は塊の無い所。 */
export interface HeatBlobBlurPart {
  readonly level: number;
  readonly weight: number;
}

/**
 * 点 `(x, y)` が、ぼかした後に見せる色を作る段の内訳。矩形を段ごとに塗ってからぼかすと、
 * 点の色はまわりの段の色を重みで平均した色になる。同じ段は重みを足して1つにして返す。
 * 文字色のように、画面に出る色から決めたいものが読む。
 */
export function heatBlobBlurParts(sources: readonly HeatBlobSource[], x: number, y: number, keySize: number): HeatBlobBlurPart[] {
  const weights = new Map<number, number>();
  for (const offset of BLUR_OFFSETS) {
    const level = heatBlobLevel(heatBlobIntensityAt(sources, x + offset.dx, y + offset.dy, keySize));
    weights.set(level, (weights.get(level) ?? 0) + offset.weight);
  }
  return [...weights].map(([level, weight]) => ({ level, weight }));
}
