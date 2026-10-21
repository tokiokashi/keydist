/**
 * 横軸を位置にとる折れ線グラフの、枠の寸法と座標の変換（打鍵再生の速度グラフとRun Chartが共有する）。
 * 純粋な計算だけを持ち、描画の部品は各Analyzerが持つ。
 */

export const CHART_WIDTH = 760;
export const CHART_HEIGHT = 260;
export const CHART_MARGIN = { top: 30, right: 18, bottom: 30, left: 54 } as const;

/** 点ごとの丸を描く上限。これを超える長い列では線だけにする（点が重なって線と見分けがつかない） */
export const CHART_DOT_LIMIT = 200;

export const CHART_PLOT_WIDTH = CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right;
export const CHART_PLOT_HEIGHT = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom;
export const CHART_PLOT_RIGHT = CHART_WIDTH - CHART_MARGIN.right;

/** 横軸の位置（0から`total`）を、図の座標（viewBox）のx座標にする。 */
export function chartX(position: number, total: number): number {
  return CHART_MARGIN.left + (position / total) * CHART_PLOT_WIDTH;
}

/** 図の座標のx座標から、横軸の位置（実数）を求める。範囲は0から`total`に収める。 */
export function chartPositionAt(viewX: number, total: number): number {
  const position = ((viewX - CHART_MARGIN.left) / CHART_PLOT_WIDTH) * total;
  return Math.max(0, Math.min(total, position));
}

/** 画面上のx座標（`clientX`）を、図の座標のx座標にする。図の幅が0（非表示）なら0。 */
export function viewXFromClient(clientX: number, boundsLeft: number, boundsWidth: number): number {
  return boundsWidth === 0 ? 0 : ((clientX - boundsLeft) / boundsWidth) * CHART_WIDTH;
}

/** パスの座標を小数2桁に丸めた文字。 */
export function formatCoordinate(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * グラフの幅に対する、横軸の左端と右端の余白の割合（百分率）。
 * シークバーのつまみの動く範囲をこの横軸に合わせるのに使う。
 */
export function chartAxisInsets(): { readonly left: string; readonly right: string } {
  return {
    left: `${(CHART_MARGIN.left / CHART_WIDTH) * 100}%`,
    right: `${(CHART_MARGIN.right / CHART_WIDTH) * 100}%`,
  };
}
