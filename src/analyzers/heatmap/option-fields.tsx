import type { ReactNode } from 'react';
import { bindOption, CheckboxOptionField, SegmentedOptionField } from '#ui/primitives/option-fields.tsx';
import { DEFAULT_HEATMAP_OPTIONS, HEATMAP_FLOW_SOURCE_LABELS, HEATMAP_FLOW_SOURCES, type HeatmapOptions } from './options.ts';

/**
 * ヒートマップの設定項目の入力欄。どの項目をどの小窓に置くかは`settings-sections.ts`の表が決める。
 */
export function useHeatmapFields(options: HeatmapOptions, onOptionsChange: (next: HeatmapOptions) => void): Record<keyof HeatmapOptions, ReactNode> {
  return {
    drawStyle: (
      <SegmentedOptionField
        label="描き方"
        binding={bindOption(options, DEFAULT_HEATMAP_OPTIONS, onOptionsChange, 'drawStyle')}
        choices={[
          { value: 'fill', label: 'キーの塗り' },
          { value: 'blob', label: '熱の塊' },
          { value: 'none', label: 'なし' },
        ]}
      />
    ),
    flowLines: <CheckboxOptionField label="2打鍵の線を表示" binding={bindOption(options, DEFAULT_HEATMAP_OPTIONS, onOptionsChange, 'flowLines')} />,
    flowLineSource: (
      <SegmentedOptionField
        label="線の組"
        binding={bindOption(options, DEFAULT_HEATMAP_OPTIONS, onOptionsChange, 'flowLineSource')}
        choices={HEATMAP_FLOW_SOURCES.map((value) => ({ value, label: HEATMAP_FLOW_SOURCE_LABELS[value] }))}
      />
    ),
  };
}
