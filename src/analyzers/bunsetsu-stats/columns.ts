import type { BunsetsuStatsOkRow } from './extract.ts';
import { BUNSETSU_STATS_PANE_META } from './pane-meta.ts';

/**
 * 配列ごとの表の値の列。並びは表の左から右の順で、列のまとまり（`definition.tsx`の`GROUP_START`・`GROUP_END`）の添字と対応する。
 * 並び替えは、表に出ている値そのもの（`valueOf`が返す数値）で行う。
 */
export const BUNSETSU_STATS_COLUMN_IDS = [
  'skipped',
  'skippedAfterBoundary',
  'boundaryShare',
  'boundaryPerChar',
  'boundaryDeviation',
  'interiorPerChar',
  'interiorDeviation',
  'segmentDeviation',
  'segmentP90',
  'segmentPerCharMedian',
  'segmentPerCharP90',
] as const;

export type BunsetsuStatsColumnId = (typeof BUNSETSU_STATS_COLUMN_IDS)[number];

type ColumnValue = (stats: BunsetsuStatsOkRow['stats']) => number | undefined;

/** 列の値の読み出し。値が決まらない時は`undefined`。 */
const COLUMN_VALUE: Readonly<Record<BunsetsuStatsColumnId, ColumnValue>> = {
  skipped: (stats) => stats.skippedChars,
  skippedAfterBoundary: (stats) => stats.skippedAfterBoundary,
  boundaryShare: (stats) => stats.boundaryDistanceShare,
  boundaryPerChar: (stats) => stats.boundary.perChar,
  boundaryDeviation: (stats) => stats.boundary.deviation,
  interiorPerChar: (stats) => stats.interior.perChar,
  interiorDeviation: (stats) => stats.interior.deviation,
  segmentDeviation: (stats) => stats.segmentDistance.deviation,
  segmentP90: (stats) => stats.segmentDistance.p90,
  segmentPerCharMedian: (stats) => stats.segmentPerChar.median,
  segmentPerCharP90: (stats) => stats.segmentPerChar.p90,
};

/**
 * 列の正式な名前。見出しのⓘから開く説明（`pane-meta.ts`の`help.items`）の先頭11項目が、`BUNSETSU_STATS_COLUMN_IDS`と同じ並びの列の項目なので、
 * その項目名をそのまま使う（文字列を2か所に書かない。並びの対応は`columns.test.ts`が見張る）。
 * 2段目の見出しは短く、まとまりの見出しが無いと何の列か分からないので、見出しのボタンの名前と説明に使う。
 */
export const BUNSETSU_STATS_COLUMN_FULL_NAME: Readonly<Record<BunsetsuStatsColumnId, string>> = Object.fromEntries(
  BUNSETSU_STATS_COLUMN_IDS.map((id, index) => [id, BUNSETSU_STATS_PANE_META.help.items[index]!.name]),
) as Record<BunsetsuStatsColumnId, string>;

/** 並び替えに使う、1行（値を出せる行）の列の値。 */
export function bunsetsuStatsColumnValue(row: BunsetsuStatsOkRow, column: BunsetsuStatsColumnId): number | undefined {
  return COLUMN_VALUE[column](row.stats);
}
