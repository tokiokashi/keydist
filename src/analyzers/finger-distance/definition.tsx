import { bindOption, SelectOptionField } from '#ui/primitives/option-fields.tsx';
import { fingerDistanceDefinition, type FingerDistanceExtracted } from './extract.ts';
import { DEFAULT_FINGER_DISTANCE_OPTIONS, type FingerDistanceOptions } from './options.ts';
import { FINGER_DISTANCE_PANE_META } from './pane-meta.ts';
import { chartSpecOf } from './chart-data.ts';
import { FingerDistanceChart } from './finger-distance-chart.tsx';
import type { AnalyzerPaneParts, AnalyzerSettingsProps } from '../pane-parts.tsx';
import './finger-distance-view.css';

/**
 * 指ごとの距離の可視化。
 *
 * `extracted`（`extract.ts` の計算結果）をそのまま描くだけで、`Metrics` の再計算はしない
 * （docs/architecture.md「可視化は計算しない」）。**優劣を示す色・強調・順位は出さない**
 * （AGENTS.md「優劣の判定・順位付け・合成スコアを作らない」）。棒の高さは値の大きさを
 * 示すだけで、最大や最小の指を強調しない。指の並びは物理的な並び（左手の小指から右手の小指）のまま。
 */

export interface FingerDistanceBodyProps {
  readonly extracted: FingerDistanceExtracted;
  readonly options: FingerDistanceOptions;
}

export function FingerDistanceBody({ extracted, options }: FingerDistanceBodyProps) {
  const spec = chartSpecOf(extracted, options.chartMetric);
  const isAdjacent = options.chartMetric === 'stdDev' || options.chartMetric === 'mean' || options.chartMetric === 'max';
  return (
    <section className="finger-distance-feature" data-react-feature="finger-distance">
      <h3 className="finger-distance-heading">{spec.title}</h3>
      <FingerDistanceChart spec={spec} scaleKey={`finger-distance:${options.chartMetric}`} />
      {isAdjacent
        ? <p className="finger-distance-note">間隔は、2本の指がホームに並んだ時の間隔からの超過。</p>
        : null}
    </section>
  );
}

/** グラフで見る量。 */
export function FingerDistanceSettings({ options, onOptionsChange }: AnalyzerSettingsProps<FingerDistanceOptions>) {
  const bind = <K extends keyof FingerDistanceOptions>(key: K) =>
    bindOption(options, DEFAULT_FINGER_DISTANCE_OPTIONS, onOptionsChange, key);
  return (
    <div className="option-groups">
      <SelectOptionField
        label="見る量"
        binding={bind('chartMetric')}
        choices={[
          { value: 'distance', label: '移動距離', group: '指ごと' },
          { value: 'presses', label: '押下数', group: '指ごと' },
          { value: 'stdDev', label: '標準偏差', group: '隣り合う指の組' },
          { value: 'mean', label: '平均', group: '隣り合う指の組' },
          { value: 'max', label: '最大', group: '隣り合う指の組' },
        ]}
      />
    </div>
  );
}

/** ペインに渡すもの（`analyzers/pane-parts.tsx`）。 */
export const fingerDistanceAnalyzer = {
  definition: fingerDistanceDefinition,
  ...FINGER_DISTANCE_PANE_META,
  Body: FingerDistanceBody,
  Settings: FingerDistanceSettings,
  defaultOptions: DEFAULT_FINGER_DISTANCE_OPTIONS,
} satisfies AnalyzerPaneParts<typeof fingerDistanceDefinition, FingerDistanceOptions, FingerDistanceBodyProps>;
