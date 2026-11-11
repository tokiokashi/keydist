import { useState } from 'react';
import { bindOption, SelectOptionField } from '#ui/primitives/option-fields.tsx';
import { fingerDistanceDefinition, type FingerDistanceExtracted } from './extract.ts';
import { DEFAULT_FINGER_DISTANCE_OPTIONS, fingerDistanceOptions, type FingerDistanceOptions } from './options.ts';
import { FINGER_DISTANCE_PANE_META } from './pane-meta.ts';
import { chartSpecOf, distributionSpecsOf, fingerDistanceScaleKey } from './chart-data.ts';
import { FingerDistanceDistribution } from './finger-distance-distribution.tsx';
import { FingerDistanceChart } from './finger-distance-chart.tsx';
import { chartTableModel, DISTRIBUTION_TABLE_CAPTION, distributionTableModel } from './table-model.ts';
import { FigureTable, FigureTableSwitch } from '../figure-table-view.tsx';
import type { AnalyzerSettingsProps, SingleAnalyzerPaneParts } from '../pane-parts.tsx';
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
  /** 図の値を表で読む表示にしているか。保存しない */
  const [asTable, setAsTable] = useState(false);
  const toggleTable = () => setAsTable((current) => !current);
  const spec = chartSpecOf(extracted, options.chartMetric);
  const isAdjacent = options.chartMetric === 'stdDev' || options.chartMetric === 'mean' || options.chartMetric === 'max';
  return (
    <section className="finger-distance-feature" data-react-feature="finger-distance">
      <div className="figure-table-heading">
        <h3 className="finger-distance-heading">{spec.title}</h3>
        <FigureTableSwitch pressed={asTable} onToggle={toggleTable} target={spec.title} />
      </div>
      {asTable ? (
        <FigureTable model={chartTableModel(spec)} />
      ) : (
        <FingerDistanceChart spec={spec} scaleKey={fingerDistanceScaleKey(options.chartMetric)} />
      )}
      {isAdjacent ? <p className="finger-distance-note">間隔は、2本の指がホームに並んだ時の間隔からの超過。</p> : null}
      {isAdjacent ? (
        <>
          <div className="figure-table-heading">
            <h3 className="finger-distance-heading">隣り合う指の間隔の分布 [%]</h3>
            <FigureTableSwitch pressed={asTable} onToggle={toggleTable} target={DISTRIBUTION_TABLE_CAPTION} />
          </div>
          {asTable ? (
            <FigureTable model={distributionTableModel(distributionSpecsOf(extracted))} />
          ) : (
            <FingerDistanceDistribution specs={distributionSpecsOf(extracted)} />
          )}
          <p className="finger-distance-note">
            各行は指間距離の超過 [u]
            の1つの値で、棒と右の数字がその値のアクションが全アクションに占める割合です。割合の分母は、平均・標準偏差と同じ全アクションです。その組の指がホームにあるアクションも含みます。
          </p>
        </>
      ) : null}
    </section>
  );
}

/** グラフで見る量。 */
export function FingerDistanceSettings({ options, onOptionsChange }: AnalyzerSettingsProps<FingerDistanceOptions>) {
  const bind = <K extends keyof FingerDistanceOptions>(key: K) => bindOption(options, DEFAULT_FINGER_DISTANCE_OPTIONS, onOptionsChange, key);
  return (
    <div className="option-groups">
      <SelectOptionField
        label="見る量"
        binding={bind('chartMetric')}
        choices={[
          { value: 'distance', label: '移動距離', group: '指ごと' },
          { value: 'presses', label: 'キー数', group: '指ごと' },
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
  urlOptions: fingerDistanceOptions,
} satisfies SingleAnalyzerPaneParts<FingerDistanceOptions, FingerDistanceExtracted>;
