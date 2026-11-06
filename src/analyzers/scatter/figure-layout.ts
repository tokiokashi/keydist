import type { ScatterColumnSetting } from './options.ts';

/**
 * 図を並べる列の数を決める（画面に依存しない純粋な関数）。
 * 並べる領域の幅は、単体の画面では画面の本文の幅、Workspaceではペインの幅。
 */

/** 図1枚の幅の上限 [px]。図が1枚か1列の時の最大幅で、これより広く伸ばさない。 */
export const FIGURE_MAX_WIDTH = 760;

/**
 * 図1枚の幅の下限 [px]。図の座標系の幅は640で、軸の数字と点の名前は座標系の11の大きさで描くので、幅420pxでは約7.2pxになる。
 * 390px幅の画面の1列（約360px、約6.2px）より小さくならず、桁と名前の文字を見分けられる大きさを、2列に分ける境目にする。
 */
export const FIGURE_MIN_WIDTH = 420;

/** 図と図の間隔 [px]。 */
export const FIGURE_GAP = 16;

/** 列の数の最大。 */
export const MAX_FIGURE_COLUMNS = 3;

/**
 * 列の数。幅に収まる最大の列の数（図の幅が下限を割らない範囲で最も多い列）を、`setting`の上限と図の数で抑える。
 * 幅が下限1枚ぶんに満たなくても1列は出す。`width`が`undefined`（まだ測っていない）の時は1列にする。
 */
export function scatterColumnCount(setting: ScatterColumnSetting, width: number | undefined, figureCount: number): number {
  if (figureCount <= 1 || width === undefined) return 1;
  const fitting = Math.floor((width + FIGURE_GAP) / (FIGURE_MIN_WIDTH + FIGURE_GAP));
  const limit = setting === 'auto' ? MAX_FIGURE_COLUMNS : Number(setting);
  return Math.max(1, Math.min(limit, fitting, figureCount));
}
