import type { PhysicalKeyboardStandard } from '#input/shapes/geometry.ts';
import type { KeyDetail } from '#interpretation/key-detail.ts';
import type { FigureTableModel } from '../figure-table.ts';
import { heatmapKeysInReadingOrder, type HeatmapDrawnKey } from '../heatmap-keys.ts';
import { keyName } from '../key-detail-view.ts';

/** 表題。見出しの「ヒートマップ（レイヤー）」とは別に、何の値の表かを表だけで読める名前にする。 */
export const HEATMAP_LAYERS_TABLE_CAPTION = 'レイヤーごとの押下数';

/** 表の列にする図1枚ぶん。 */
export interface HeatmapLayersTableColumn {
  readonly id: string;
  /** 図の見出しと同じ名前 */
  readonly title: string;
  /** 図のキーのツールチップに出す値（`entryKeyDetail`） */
  readonly detailOf: (keyId: string) => KeyDetail | undefined;
}

/**
 * ヒートマップ（レイヤー）の値の表。列は、図に並べているレイヤーの図（まとめた時はまとめた図）と同じ順。
 * 行はキーで、物理配列の上の段から、段の中は左から並べる。どの図でも押されないキーは行に出さない。
 * 押下数は図のツールチップと同じ値。行の見出しは、単打の面の刻印と物理キーの名前。
 */
export function heatmapLayersTableModel({
  drawnKeys,
  legends,
  standard,
  columns,
}: {
  /** 図に描くキー（`heatmapDrawnKeys`） */
  readonly drawnKeys: readonly HeatmapDrawnKey[];
  /** キーid → 刻印 */
  readonly legends: ReadonlyMap<string, string>;
  readonly standard: PhysicalKeyboardStandard | undefined;
  readonly columns: readonly HeatmapLayersTableColumn[];
}): FigureTableModel {
  const rows = heatmapKeysInReadingOrder(drawnKeys).flatMap(({ key, unused }) => {
    if (unused) return [];
    const counts = columns.map((column) => column.detailOf(key.id)?.presses ?? 0);
    if (counts.every((count) => count === 0)) return [];
    return [{ key: key.id, header: keyName(key.id, legends.get(key.id), standard), cells: counts.map(String) }];
  });
  return {
    caption: HEATMAP_LAYERS_TABLE_CAPTION,
    rowHeader: 'キー',
    columns: columns.map((column) => column.title),
    rows,
  };
}
