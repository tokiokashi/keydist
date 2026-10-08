import { HAND_LABEL, type ChartSpec } from './chart-data.ts';

/**
 * 指ごと・指の組ごとの縦棒グラフ。横軸は物理的な並びで、左手と右手の間にすき間を空けて区切る。
 * 棒は1色で、最大や最小を強調しない。座標系は幅360固定で、置かれた幅に合わせて等比に縮む
 * （幅390pxのペインでも、はみ出さない）。
 */
const WIDTH = 360;
const HEIGHT = 200;
const TOP = 20;
const BOTTOM = 40;
const SIDE = 4;
/** 左手と右手の間に空けるすき間（棒の幅に対する倍率）。 */
const HAND_GAP_SLOTS = 0.6;

export function FingerDistanceChart({ spec }: { readonly spec: ChartSpec }) {
  const { bars } = spec;
  const plotH = HEIGHT - TOP - BOTTOM;
  const high = Math.max(0, ...bars.map((bar) => bar.value));
  const low = Math.min(0, ...bars.map((bar) => bar.value));
  // 全部0なら棒が1本も立たないので、目盛りの幅だけ確保して底の線を描く
  const span = high - low > 0 ? high - low : 1;
  const yOf = (value: number) => TOP + ((high - value) / span) * plotH;
  const baseline = yOf(0);

  const handChanges = bars.filter((bar, i) => i > 0 && bar.hand !== bars[i - 1]!.hand).length;
  const slot = (WIDTH - SIDE * 2) / (bars.length + handChanges * HAND_GAP_SLOTS);
  const barW = Math.min(slot * 0.62, 28);

  let cursor = SIDE;
  const placed = bars.map((bar, i) => {
    if (i > 0 && bar.hand !== bars[i - 1]!.hand) cursor += slot * HAND_GAP_SLOTS;
    const left = cursor;
    cursor += slot;
    return { bar, left, centre: left + slot / 2 };
  });
  const spans = (['left', 'right'] as const).flatMap((hand) => {
    const members = placed.filter((item) => item.bar.hand === hand);
    if (members.length === 0) return [];
    return [{ hand, from: members[0]!.left, to: members[members.length - 1]!.left + slot }];
  });
  const divider = spans.length === 2 ? (spans[0]!.to + spans[1]!.from) / 2 : undefined;

  return (
    <div className="finger-distance-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={spec.title}>
        {divider === undefined ? null : (
          <line className="finger-distance-chart-divider" x1={divider} x2={divider} y1={TOP} y2={HEIGHT - BOTTOM + 6} />
        )}
        <line className="finger-distance-chart-baseline" x1={SIDE} x2={WIDTH - SIDE} y1={baseline} y2={baseline} />
        {placed.map(({ bar, left, centre }) => {
          const valueY = yOf(bar.value);
          const barH = Math.abs(valueY - baseline);
          const labelY = bar.value < 0 ? valueY + 12 : valueY - 4;
          return (
            <g key={bar.key} data-chart-bar={bar.key} data-hand={bar.hand}>
              <title>{bar.tip}</title>
              <rect x={left} y={0} width={slot} height={HEIGHT} fill="transparent" />
              {barH > 0.5 ? (
                <rect
                  className="finger-distance-chart-bar"
                  x={centre - barW / 2}
                  y={Math.min(valueY, baseline)}
                  width={barW}
                  height={barH}
                  rx={2}
                />
              ) : null}
              <text className="finger-distance-chart-value" x={centre} y={labelY} textAnchor="middle">
                {bar.valueText}
              </text>
              <text className="finger-distance-chart-label" x={centre} y={HEIGHT - BOTTOM + 16} textAnchor="middle">
                {bar.label}
              </text>
            </g>
          );
        })}
        {spans.map((group) => (
          <text
            key={group.hand}
            className="finger-distance-chart-hand"
            x={(group.from + group.to) / 2}
            y={HEIGHT - 6}
            textAnchor="middle"
          >
            {HAND_LABEL[group.hand]}
          </text>
        ))}
      </svg>
    </div>
  );
}
