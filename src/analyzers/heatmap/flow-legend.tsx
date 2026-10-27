import type { BigramSource } from '../bigram-vectors.ts';
import { InfoButton } from '#ui/primitives/info-button.tsx';
import { HEATMAP_FLOW_SOURCE_LABELS } from './options.ts';

const FLOW_READING = 'キーからキーへの移動を線で描きます。太さが回数で、線は始点が薄く終点が濃いです。同じキーの連打と、親指のキーを含む組は描きません。';

const HAND_SWATCHES = [
  { hand: 'left', label: '左の手' },
  { hand: 'right', label: '右の手' },
  { hand: 'cross', label: '手をまたぐ組' },
] as const;

/**
 * 2打鍵の線を表示している間、一番上の図の見出し行の下に出す凡例。
 * どの組を描いているかと、線の色（左の手・右の手・手をまたぐ組）を、図の表示の小窓を開かなくても読めるようにする。
 */
export function HeatmapFlowLegend({ source }: { readonly source: BigramSource }) {
  return (
    <div className="heatmap-flow-legend" data-heatmap-flow-legend={source}>
      <span className="heatmap-flow-legend-source">線: {HEATMAP_FLOW_SOURCE_LABELS[source]}</span>
      {HAND_SWATCHES.map((item) => (
        <span key={item.hand} className="heatmap-flow-legend-item">
          <i className={`heatmap-flow-dot heatmap-flow-dot-${item.hand}`} aria-hidden="true" />
          {item.label}
        </span>
      ))}
      <InfoButton name="2打鍵の線" description={FLOW_READING} />
    </div>
  );
}
