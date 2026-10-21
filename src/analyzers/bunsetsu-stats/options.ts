import { columnSortOption, type ColumnSortOptionValue, defineOptions } from '#analyzers/options.ts';
import { BUNSETSU_STATS_COLUMN_IDS, type BunsetsuStatsColumnId } from './columns.ts';

/**
 * 文節ごとの統計の解析設定。
 *
 * - `sort`: 配列ごとの表の列の見出しで切り替える並び替え（昇順 → 降順 → 解除）。表示だけが変わる設定で、
 *   利用者が見出しを押して選ぶ表示の操作であり、ツールが順位を決めるものではない。既定は並び替えなし（対象の順のまま）。
 *   並べるのは配列ごとの表の行だけで、テキストの表と上位の一覧は変えない。
 *
 * 上位の一覧の行数や統計の定義は固定で、利用者が選ぶ項目が無い（`AGENTS.md`「設定項目を足すか決める」。要望が出たら足す）。
 */

/** 並び替えの状態。`null`は並び替えなし（対象の順のまま）。 */
export type BunsetsuStatsSort = ColumnSortOptionValue<BunsetsuStatsColumnId>;

export const bunsetsuStatsOptions = defineOptions({
  sort: columnSortOption('sort', BUNSETSU_STATS_COLUMN_IDS),
});

export type BunsetsuStatsOptions = typeof bunsetsuStatsOptions.defaultOptions;

export const DEFAULT_BUNSETSU_STATS_OPTIONS: BunsetsuStatsOptions = bunsetsuStatsOptions.defaultOptions;

/** 入れ忘れ防止テスト（`optionsDiscipline`）用の、既定値と異なる妥当な値の組。 */
export const ALTERNATE_BUNSETSU_STATS_OPTIONS: BunsetsuStatsOptions = {
  sort: { column: 'boundaryShare', direction: 'desc' },
};
