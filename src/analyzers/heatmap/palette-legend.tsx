import { heatMultiGradientCss } from '../heatmap-palette.ts';

const GRADIENT = heatMultiGradientCss();

/**
 * 多色で、キーの塗りかサーモグラフィを描いている間、一番上の図の見出し行の下に出す凡例。
 * 強度が低い側から高い側へ、色の並びを帯で示す。
 */
export function HeatmapPaletteLegend() {
  return (
    <div className="heatmap-palette-legend" data-heatmap-palette-legend="">
      <span>低</span>
      <i className="heatmap-palette-bar" style={{ backgroundImage: GRADIENT }} role="img" aria-label="低い側から高い側への色の並び" />
      <span>高</span>
    </div>
  );
}
