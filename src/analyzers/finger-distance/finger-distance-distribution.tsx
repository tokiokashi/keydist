import { useState, type KeyboardEvent } from 'react';
import { formatPercent, formatState, HAND_LABEL, type DistributionSpec } from './chart-data.ts';

/**
 * 隣り合う指6組の指間距離の分布。組ごとに、状態を縦に並べた横向きの棒グラフを出す。
 * 1行が1つの状態で、左に状態の値 [u]（昇順）、棒、右に全打鍵に対する割合 [%] を出す。
 * 状態の値と割合は行の中の文字として常に出るので、状態の数が増えても文字が重ならず、切れない。
 * 棒の長さは6組で共通の割合の目盛りにして、組どうしの長さを比べられるようにする。棒は1色で、最大や最小を強調しない。
 *
 * 行は押して（Enter・Spaceでも）選べ、選んだ行のツールチップと同じ文（打鍵数を含む）を図の下に出す
 * （hoverの無いタッチ端末でも読める）。選んだ行をもう1度押す・Escapeで外す。選択は保存しない。
 */
export function FingerDistanceDistribution({ specs }: { readonly specs: readonly DistributionSpec[] }) {
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined);
  const high = Math.max(1, ...specs.flatMap((spec) => spec.bars.map((bar) => bar.share)));
  const keyOf = (pair: string, state: number) => `${pair}:${state}`;
  const selectedTip = specs
    .flatMap((spec) => spec.bars.map((bar) => ({ key: keyOf(spec.key, bar.state), tip: bar.tip })))
    .find((item) => item.key === selectedKey)?.tip;
  const toggle = (key: string) => setSelectedKey((current) => (current === key ? undefined : key));
  const onKeyDown = (event: KeyboardEvent, key: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle(key);
    } else if (event.key === 'Escape') {
      setSelectedKey(undefined);
    }
  };
  return (
    <div className="finger-distance-distribution-wrap">
      <div className="finger-distance-distribution" data-finger-distance-distribution>
        {specs.map((spec) => (
          <figure key={spec.key} className="finger-distance-distribution-item" data-distribution-pair={spec.key} data-hand={spec.hand}>
            <figcaption>{`${HAND_LABEL[spec.hand]} ${spec.label}`}</figcaption>
            <div className="finger-distance-distribution-rows">
              {spec.bars.map((bar) => {
                const key = keyOf(spec.key, bar.state);
                return (
                  <div
                    key={key}
                    className="finger-distance-distribution-row"
                    data-distribution-bar={bar.state}
                    data-selected={selectedKey === key || undefined}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectedKey === key}
                    aria-label={bar.tip}
                    title={bar.tip}
                    onClick={() => toggle(key)}
                    onKeyDown={(event) => onKeyDown(event, key)}
                  >
                    <span className="finger-distance-distribution-state">{formatState(bar.state)}</span>
                    <span className="finger-distance-distribution-track">
                      <span className="finger-distance-distribution-fill" style={{ width: `${(bar.share / high) * 100}%` }} />
                    </span>
                    <span className="finger-distance-distribution-share">{formatPercent(bar.share)}</span>
                  </div>
                );
              })}
            </div>
          </figure>
        ))}
      </div>
      <p className="finger-distance-chart-readout" aria-live="polite" data-distribution-readout>
        {selectedTip}
      </p>
    </div>
  );
}
