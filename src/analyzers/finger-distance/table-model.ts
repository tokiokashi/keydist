import type { FigureTableModel } from '../figure-table.ts';
import { formatPercent, formatState, HAND_LABEL, type ChartSpec, type DistributionSpec } from './chart-data.ts';

/**
 * 縦棒グラフの値の表。行は図に渡した棒（`spec.bars`）と同じ順（物理的な並び）で、手と指（指の組）の名前を行の見出しにする。
 * 値は棒のツールチップと同じ書式で、棒の上の縮めた値ではなく、縮めない値を出す。
 * 指ごとの量は、全体に占める割合の列も付ける。
 */
export function chartTableModel(spec: ChartSpec): FigureTableModel {
  const hasShare = spec.bars.some((bar) => bar.shareText !== undefined);
  return {
    caption: spec.title,
    rowHeader: '指',
    columns: ['値', ...(hasShare ? ['全体に占める割合'] : [])],
    rows: spec.bars.map((bar) => ({
      key: bar.key,
      header: `${HAND_LABEL[bar.hand]} ${bar.label}`,
      cells: [bar.exactText, ...(hasShare ? [bar.shareText ?? '—'] : [])],
    })),
  };
}

/**
 * 隣り合う指の間隔の分布の表。行は図の行と同じ順（指の組ごとに、超過の小さい順）で、
 * 超過・全アクションに占める割合・アクションの数を、図の行の文字と同じ書式で並べる。
 */
export function distributionTableModel(specs: readonly DistributionSpec[]): FigureTableModel {
  return {
    caption: '隣り合う指の間隔の分布',
    rowHeader: '指の組',
    columns: ['超過 [u]', '割合', 'アクション数'],
    rows: specs.flatMap((spec) =>
      spec.bars.map((bar) => ({
        key: `${spec.key}:${bar.state}`,
        header: `${HAND_LABEL[spec.hand]} ${spec.label}`,
        cells: [formatState(bar.state), formatPercent(bar.share), String(bar.count)],
      })),
    ),
  };
}
