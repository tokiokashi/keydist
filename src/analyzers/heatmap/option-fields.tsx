import type { ReactNode } from 'react';
import { bindOption, SegmentedOptionField } from '#ui/primitives/option-fields.tsx';
import { DEFAULT_HEATMAP_OPTIONS, type HeatmapOptions } from './options.ts';

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
        ]}
      />
    ),
  };
}
