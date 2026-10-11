import { useState, type MouseEvent } from 'react';
import type { PlaybackRateChartPoint } from '#interpretation/timing/playback.ts';
import {
  RATE_CHART_HEIGHT,
  RATE_CHART_MARGIN,
  RATE_CHART_WIDTH,
  rateChartModel,
  rateChartPositionAt,
  rateChartReadout,
  rateChartX,
} from './rate-chart-model.ts';

/**
 * かな毎秒・アクション毎秒の平均の推移。値は抽出が出した点を並べるだけで、ここでは計算しない。
 * グラフを押すと、その位置へ再生位置を移す。ChainとArpeggioの区間は、再生の解析設定で表示を選んだものだけを帯で示す。
 */
export interface PlaybackRateChartProps {
  readonly points: readonly PlaybackRateChartPoint[];
  readonly cursor: number;
  readonly showChain: boolean;
  readonly showArpeggio: boolean;
  readonly onSeek: (cursor: number) => void;
}

const PLOT_HEIGHT = RATE_CHART_HEIGHT - RATE_CHART_MARGIN.top - RATE_CHART_MARGIN.bottom;
const PLOT_RIGHT = RATE_CHART_WIDTH - RATE_CHART_MARGIN.right;

export function PlaybackRateChart({ points, cursor, showChain, showArpeggio, onSeek }: PlaybackRateChartProps) {
  const [hovered, setHovered] = useState<number | undefined>(undefined);
  const model = rateChartModel(points, { chain: showChain, arpeggio: showArpeggio });
  if (model === undefined) {
    return <p className="playback-empty">打鍵するデータがありません。</p>;
  }

  const positionOf = (event: MouseEvent<SVGRectElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (svg === null) return 0;
    const bounds = svg.getBoundingClientRect();
    if (bounds.width === 0) return 0;
    return rateChartPositionAt(((event.clientX - bounds.left) / bounds.width) * RATE_CHART_WIDTH, model.total);
  };

  const shown = points[hovered ?? cursor] ?? points[0];
  const cursorX = rateChartX(Math.min(cursor, model.total), model.total);

  return (
    <div className="playback-rate-chart" data-playback-rate-chart>
      <svg
        viewBox={`0 0 ${RATE_CHART_WIDTH} ${RATE_CHART_HEIGHT}`}
        role="img"
        aria-label="かな毎秒とアクション毎秒の推移"
        data-playback-rate-total={model.total}
      >
        <g aria-label="凡例" className="playback-rate-legend">
          <line x1={RATE_CHART_MARGIN.left} y1={14} x2={RATE_CHART_MARGIN.left + 18} y2={14} className="playback-rate-line-kana" />
          <text x={RATE_CHART_MARGIN.left + 24} y={18}>かな/秒</text>
          <line x1={RATE_CHART_MARGIN.left + 100} y1={14} x2={RATE_CHART_MARGIN.left + 118} y2={14} className="playback-rate-line-action" />
          <text x={RATE_CHART_MARGIN.left + 124} y={18}>アクション/秒</text>
          {showChain ? (
            <>
              <rect x={RATE_CHART_MARGIN.left + 230} y={8} width={14} height={12} className="playback-rate-band-chain" />
              <text x={RATE_CHART_MARGIN.left + 250} y={18}>Chain</text>
            </>
          ) : null}
          {showArpeggio ? (
            <>
              <rect x={RATE_CHART_MARGIN.left + 300} y={8} width={14} height={12} className="playback-rate-band-arpeggio" />
              <text x={RATE_CHART_MARGIN.left + 320} y={18}>Arpeggio</text>
            </>
          ) : null}
        </g>

        {model.yTicks.map((tick) => (
          <g key={tick.value}>
            <line x1={RATE_CHART_MARGIN.left} y1={tick.position} x2={PLOT_RIGHT} y2={tick.position} className="playback-rate-grid" />
            <text x={RATE_CHART_MARGIN.left - 8} y={tick.position + 4} textAnchor="end" className="playback-rate-tick">
              {tick.value.toFixed(1)}
            </text>
          </g>
        ))}

        {model.bands.map((band) => (
          <rect
            key={`${band.kind}-${band.x}`}
            x={band.x}
            y={RATE_CHART_MARGIN.top}
            width={band.width}
            height={PLOT_HEIGHT}
            className={`playback-rate-band-${band.kind}`}
            data-playback-rate-band={band.kind}
          />
        ))}

        {model.kanaPath === '' ? null : <path d={model.kanaPath} className="playback-rate-line-kana" fill="none" />}
        {model.actionPath === '' ? null : <path d={model.actionPath} className="playback-rate-line-action" fill="none" />}
        {model.kanaDots.map((dot) => (
          <circle key={`k-${dot.x}`} cx={dot.x} cy={dot.y} r={2.5} className="playback-rate-dot-kana" />
        ))}
        {model.actionDots.map((dot) => (
          <circle key={`a-${dot.x}`} cx={dot.x} cy={dot.y} r={2.5} className="playback-rate-dot-action" />
        ))}

        <line
          data-playback-rate-cursor-line
          x1={cursorX}
          y1={RATE_CHART_MARGIN.top}
          x2={cursorX}
          y2={RATE_CHART_HEIGHT - RATE_CHART_MARGIN.bottom}
          className="playback-rate-cursor"
        />

        {model.xTicks.map((tick) => (
          <text key={tick.value} x={tick.position} y={RATE_CHART_HEIGHT - 8} textAnchor="middle" className="playback-rate-tick">
            {tick.value}
          </text>
        ))}

        <rect
          data-playback-rate-hit
          x={RATE_CHART_MARGIN.left}
          y={RATE_CHART_MARGIN.top}
          width={PLOT_RIGHT - RATE_CHART_MARGIN.left}
          height={PLOT_HEIGHT}
          fill="transparent"
          onPointerMove={(event) => setHovered(positionOf(event))}
          onPointerLeave={() => setHovered(undefined)}
          onClick={(event) => onSeek(positionOf(event))}
        />
      </svg>
      <p className="playback-rate-readout" data-playback-rate-readout aria-live="off">
        {rateChartReadout(shown)}
      </p>
    </div>
  );
}
