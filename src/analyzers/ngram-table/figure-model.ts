import type { WeightedDistribution } from '#interpretation/ngram-table-analysis.ts';
import type { FigureTableModel } from '../figure-table.ts';
import { distanceText, type BoxFigureRow, type BoxQuantiles, type BoxRowContext } from '../box-figure-model.ts';
import type { NgramTableExtracted, NgramTableOkRow } from './extract.ts';
import {
  DISTANCE_FIGURE,
  NGRAM_TABLE_PANE_META,
  NO_TABLE_MESSAGE,
  PER_KANA_COLUMN_LABEL,
  UNTYPED_COLUMN_LABEL,
  PER_KANA_DISTANCE_UNIT,
  PER_KANA_FIGURE,
  TOTAL_DISTANCE_LABEL,
  TOTAL_DISTANCE_UNIT,
} from './pane-meta.ts';

/**
 * 表による解析の表示モデル（画面に依存しない純粋な関数）。
 * 抽出の行を対象の順に並べ、図と表に渡す値を作る。順位・並べ替え・特定の配列の強調・基準の線は持たない。
 */

export type NgramRowContext = BoxRowContext;

export interface NgramDisplayRow extends NgramRowContext {
  readonly row: NgramTableOkRow;
}

export interface NgramExcludedRow extends NgramRowContext {
  readonly status: 'computing' | 'failed' | 'no-table';
  readonly message: string;
}

export interface NgramTableModel {
  /** 値を出す行。対象の順 */
  readonly rows: readonly NgramDisplayRow[];
  /** 値を出せない行。対象の順 */
  readonly excluded: readonly NgramExcludedRow[];
}

export const COMPUTING_MESSAGE = '計算中…';

export function ngramTableModel(
  extracted: NgramTableExtracted,
  order: readonly string[],
  rowContext: ReadonlyMap<string, NgramRowContext>,
): NgramTableModel {
  const byKey = new Map(extracted.rows.map((row) => [row.targetKey, row] as const));
  const rows: NgramDisplayRow[] = [];
  const excluded: NgramExcludedRow[] = [];
  for (const targetKey of order) {
    const context: NgramRowContext = {
      targetKey,
      label: rowContext.get(targetKey)?.label ?? '—',
      fullName: rowContext.get(targetKey)?.fullName ?? '',
    };
    const row = byKey.get(targetKey);
    if (row === undefined) {
      // extractedにまだ無いtargetKey（依頼の作り直し途中の一瞬）。値の欠落を偽らず、計算中と出す。
      excluded.push({ ...context, status: 'computing', message: COMPUTING_MESSAGE });
    } else if (row.kind === 'failed') {
      excluded.push({ ...context, status: 'failed', message: row.message });
    } else if (row.kind === 'no-table') {
      excluded.push({ ...context, status: 'no-table', message: NO_TABLE_MESSAGE });
    } else {
      rows.push({ ...context, row });
    }
  }
  return { rows, excluded };
}

/** 2通りの分布のどちらを見るか。 */
export type DistributionKind = 'distance' | 'perKana';

export function distributionOf(row: NgramDisplayRow, kind: DistributionKind): WeightedDistribution | undefined {
  return kind === 'distance' ? row.row.analysis.distanceDistribution : row.row.analysis.perCharDistribution;
}

function quantile(distribution: WeightedDistribution, level: number): number {
  const found = distribution.quantiles.find((candidate) => candidate.level === level);
  if (found === undefined) throw new Error(`分布に${level}の分位点が無い`);
  return found.value;
}

export function boxOf(distribution: WeightedDistribution): BoxQuantiles {
  return {
    lowerWhisker: quantile(distribution, 0.1),
    lowerQuartile: quantile(distribution, 0.25),
    median: quantile(distribution, 0.5),
    upperQuartile: quantile(distribution, 0.75),
    upperWhisker: quantile(distribution, 0.9),
  };
}

/** 箱ひげ図に描く行。分布が決まらない行（項目が無い表）は除く。 */
export function distributionBoxRows(
  rows: readonly NgramDisplayRow[],
  kind: DistributionKind,
): readonly (BoxFigureRow & { readonly distribution: WeightedDistribution })[] {
  return rows.flatMap((row) => {
    const distribution = distributionOf(row, kind);
    return distribution === undefined
      ? []
      : [{ targetKey: row.targetKey, label: row.label, fullName: row.fullName, row: { box: boxOf(distribution) }, distribution }];
  });
}

const integer = new Intl.NumberFormat('ja-JP');

/** 総移動距離の表記（小数1桁、3桁区切り）。 */
export function totalDistanceText(value: number): string {
  return value.toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Setupごとの結果の表。行は対象の順で、値で並べ替えない。 */
export function resultsTableModel(rows: readonly NgramDisplayRow[]): FigureTableModel {
  return {
    caption: NGRAM_TABLE_PANE_META.name,
    rowHeader: '配列',
    columns: [`${TOTAL_DISTANCE_LABEL} [${TOTAL_DISTANCE_UNIT}]`, `${PER_KANA_COLUMN_LABEL} [${PER_KANA_DISTANCE_UNIT}]`, UNTYPED_COLUMN_LABEL],
    rows: rows.map((row) => {
      const { analysis } = row.row;
      return {
        key: row.targetKey,
        header: row.label,
        title: row.fullName || row.label,
        cells: [
          totalDistanceText(analysis.totalDistance),
          analysis.perChar === undefined ? '—' : analysis.perChar.toFixed(2),
          integer.format(analysis.skipped),
        ],
      };
    }),
  };
}

/** 分布の値の表の列。小さい値から大きい値の順。 */
export const DISTRIBUTION_COLUMNS = [
  { key: 'min', name: '最小' },
  { key: 0.1, name: '10%点' },
  { key: 0.25, name: '25%点' },
  { key: 0.5, name: '中央値' },
  { key: 0.75, name: '75%点' },
  { key: 0.9, name: '90%点' },
  { key: 'max', name: '最大' },
  { key: 'mean', name: '平均' },
] as const;

export function distributionValue(distribution: WeightedDistribution, key: (typeof DISTRIBUTION_COLUMNS)[number]['key']): number {
  if (key === 'min') return distribution.min;
  if (key === 'max') return distribution.max;
  if (key === 'mean') return distribution.mean;
  return quantile(distribution, key);
}

/** 分布の値の表（図の値を表で読む）。全配列の8つの値を並べる。 */
export function distributionTableModel(rows: readonly NgramDisplayRow[], kind: DistributionKind): FigureTableModel {
  const figure = kind === 'distance' ? DISTANCE_FIGURE : PER_KANA_FIGURE;
  return {
    caption: `${figure.caption}の分布 [${figure.unit}]`,
    rowHeader: '配列',
    columns: DISTRIBUTION_COLUMNS.map((column) => column.name),
    rows: rows.flatMap((row) => {
      const distribution = distributionOf(row, kind);
      if (distribution === undefined) return [];
      return [
        {
          key: row.targetKey,
          header: row.label,
          title: row.fullName || row.label,
          cells: DISTRIBUTION_COLUMNS.map((column) => distanceText(distributionValue(distribution, column.key))),
        },
      ];
    }),
  };
}
