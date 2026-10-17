import { formatPercent, formatState, HAND_LABEL, type DistributionSpec } from './chart-data.ts';

/**
 * 隣り合う指6組の指間距離の分布。組ごとに小さな縦棒グラフを並べ、横軸は状態の値（昇順）、
 * 縦軸は全打鍵に対する割合 [%]。縦軸は6組で共通にして、組どうしの高さを比べられるようにする。
 * 棒は1色で、最大や最小を強調しない。
 */
const WIDTH = 160;
const HEIGHT = 110;
const TOP = 14;
const BOTTOM = 22;
const SIDE = 4;
/** 状態の数がこれを超えたら、横軸の状態名は出さない（棒が細くなり重なるため。値はツールチップで読む） */
const MAX_LABELLED_STATES = 6;

export function FingerDistanceDistribution({ specs }: { readonly specs: readonly DistributionSpec[] }) {
  const high = Math.max(1, ...specs.flatMap((spec) => spec.bars.map((bar) => bar.share)));
  const plotH = HEIGHT - TOP - BOTTOM;
  return (
    <div className="finger-distance-distribution" data-finger-distance-distribution>
      {specs.map((spec) => {
        const slot = (WIDTH - SIDE * 2) / Math.max(1, spec.bars.length);
        const barW = Math.min(slot * 0.62, 24);
        const labelled = spec.bars.length <= MAX_LABELLED_STATES;
        return (
          <figure key={spec.key} className="finger-distance-distribution-item" data-distribution-pair={spec.key} data-hand={spec.hand}>
            <figcaption>{`${HAND_LABEL[spec.hand]} ${spec.label}`}</figcaption>
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${HAND_LABEL[spec.hand]} ${spec.label}の指間距離の分布`}>
              <line className="finger-distance-chart-baseline" x1={SIDE} x2={WIDTH - SIDE} y1={TOP + plotH} y2={TOP + plotH} />
              {spec.bars.map((bar, i) => {
                const centre = SIDE + slot * i + slot / 2;
                const barH = (bar.share / high) * plotH;
                const y = TOP + plotH - barH;
                return (
                  <g key={bar.state} data-distribution-bar={bar.state}>
                    <title>{bar.tip}</title>
                    <rect className="finger-distance-chart-bar" x={centre - barW / 2} y={y} width={barW} height={Math.max(barH, 0.5)} rx={1.5} />
                    <text className="finger-distance-chart-value" x={centre} y={y - 3} textAnchor="middle">
                      {formatPercent(bar.share)}
                    </text>
                    {labelled ? (
                      <text className="finger-distance-chart-label" x={centre} y={HEIGHT - 8} textAnchor="middle">
                        {formatState(bar.state)}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          </figure>
        );
      })}
    </div>
  );
}
