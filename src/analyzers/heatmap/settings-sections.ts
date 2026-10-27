import type { HeatmapOptions } from './options.ts';

/**
 * ヒートマップの設定項目の置き場。グループの下に項目を置く。
 * 図の表示の小窓は、表示だけを変える項目（`affects: 'view'`）をこの表の順に描く。
 * 解析設定の小窓に置く項目（`affects: 'extract'`）は今は無い。どの項目をどちらに置くかは`settings-sections.test.ts`が`affects`と照らす。
 */
export type HeatmapSettingsGroupId = 'drawStyle' | 'palette' | 'flowLines';

export interface HeatmapSettingsGroup {
  readonly id: HeatmapSettingsGroupId;
  readonly title: string;
  readonly keys: readonly (keyof HeatmapOptions)[];
}

export const HEATMAP_WINDOW_GROUPS: readonly HeatmapSettingsGroup[] = [];

export const HEATMAP_FIGURE_GROUPS: readonly HeatmapSettingsGroup[] = [
  { id: 'drawStyle', title: '描き方', keys: ['drawStyle'] },
  { id: 'palette', title: '配色', keys: ['palette'] },
  { id: 'flowLines', title: '2打鍵の線', keys: ['flowLines', 'flowLineSource'] },
];
