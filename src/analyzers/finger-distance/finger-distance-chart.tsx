import { useState, type KeyboardEvent } from 'react';
import { scaleRangeWithZero } from '../shared-scale.ts';
import { useSharedScale } from '../shared-scale.tsx';
import { HAND_LABEL, type ChartSpec } from './chart-data.ts';

/**
 * 指ごと・指の組ごとの縦棒グラフ。横軸は物理的な並びで、左手と右手の間にすき間を空けて区切る。
 * 棒は1色で、最大や最小を強調しない。座標系は幅360固定で、置かれた幅に合わせて等比に縮む
 * （幅390pxのペインでも、はみ出さない）。
 *
 * 棒は押して（Enter・Spaceでも）選べ、選んだ棒のツールチップと同じ文を図の下に出す（hoverの無い
 * タッチ端末でも値と割合を読める）。選んだ棒をもう1度押す・Escapeで外す。選択は保存しない。
 */
const WIDTH = 360;
const HEIGHT = 200;
const TOP = 20;
const BOTTOM = 40;
const SIDE = 4;
/** 左手と右手の間に空けるすき間（棒の幅に対する倍率）。 */
const HAND_GAP_SLOTS = 0.6;

export function FingerDistanceChart({ spec, scaleKey }: { readonly spec: ChartSpec; readonly scaleKey: string }) {
  const { bars } = spec;
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined);
  // 見る量が変わって棒が無くなった時は、選択が無い扱いにする
  const selected = bars.find((bar) => bar.key === selectedKey);
  const onKeyDown = (event: KeyboardEvent, key: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setSelectedKey((current) => (current === key ? undefined : key));
    } else if (event.key === 'Escape') {
      setSelectedKey(undefined);
    }
  };
  const plotH = HEIGHT - TOP - BOTTOM;
  // 縦軸は、同じ見る量で並んだペイン全部を含む範囲（置かれた場所に配るものが無ければ自分の範囲）
  const { min: low, max: high } = useSharedScale(scaleKey, scaleRangeWithZero(bars.map((bar) => bar.value)));
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
        {divider === undefined ? null : <line className="finger-distance-chart-divider" x1={divider} x2={divider} y1={TOP} y2={HEIGHT - BOTTOM + 6} />}
        <line className="finger-distance-chart-baseline" x1={SIDE} x2={WIDTH - SIDE} y1={baseline} y2={baseline} />
        {placed.map(({ bar, left, centre }) => {
          const valueY = yOf(bar.value);
          const barH = Math.abs(valueY - baseline);
          const labelY = bar.value < 0 ? valueY + 12 : valueY - 4;
          return (
            // biome-ignore lint/a11y/useSemanticElements: SVGの図形の中にHTMLのbuttonは置けない
            <g
              key={bar.key}
              data-chart-bar={bar.key}
              data-hand={bar.hand}
              className="finger-distance-chart-item"
              role="button"
              tabIndex={0}
              aria-pressed={selected?.key === bar.key}
              aria-label={bar.tip}
              onClick={() => setSelectedKey((current) => (current === bar.key ? undefined : bar.key))}
              onKeyDown={(event) => onKeyDown(event, bar.key)}
            >
              <title>{bar.tip}</title>
              <rect
                className="finger-distance-chart-hit"
                x={left}
                y={0}
                width={slot}
                height={HEIGHT}
                data-selected={selected?.key === bar.key || undefined}
              />
              {barH > 0.5 ? (
                <rect className="finger-distance-chart-bar" x={centre - barW / 2} y={Math.min(valueY, baseline)} width={barW} height={barH} rx={2} />
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
          <text key={group.hand} className="finger-distance-chart-hand" x={(group.from + group.to) / 2} y={HEIGHT - 6} textAnchor="middle">
            {HAND_LABEL[group.hand]}
          </text>
        ))}
      </svg>
      <p className="finger-distance-chart-readout" aria-live="polite" data-chart-readout>
        {selected?.tip}
      </p>
    </div>
  );
}
