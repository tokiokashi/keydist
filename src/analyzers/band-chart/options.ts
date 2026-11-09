import * as v from 'valibot';
import { defineOption, defineOptions, integerUrlCodec, picklistUrlCodec } from '#analyzers/options.ts';
import { BAND_QUANTITY_IDS, type BandQuantityId } from '#interpretation/band-quantities.ts';

/**
 * 帯グラフの解析設定。
 *
 * `quantity` は帯に出す量（`quantities.ts`）。身体・好み・配列思想で割れる設定ではなく、同じ図で見る量の切り替えで、
 * このAnalyzerだけが読むので、置き場は帯グラフの解析設定にする（AGENTS.md「置き場」）。
 * 抽出が選んだ量の割合だけを作るので `affects: 'extract'`。切り替えても、Traceから数えた7つの量の数え上げは覚えたものを使う。
 * 区分の境目は身体・好みで割れるものではなく、要望の実例も無いので固定する。
 * `sortBoundary` と `sortDirection` は行の並べ方で、見た目だけが変わるので `affects: 'view'`。数え方・割合は変えない。
 * `sortBoundary` は左端から数えた区分の数 `k`（1以上、区分の数より小さい）で、左端から `k` 番目の区分の右の境目を指す。
 * 0は並べ替えず、対象の順のままにする。並べ替えは順位や優劣を付けるものではなく、境目までの割合で行を並べ直すだけで、割合の表示は変わらない。
 * 計算に効く条件（N・ローマ字の綴り・物理配列・指割り当て）は、対象の条件としてペインの見出しの条件から変える。
 */
export const DEFAULT_BAND_CHART_QUANTITY: BandQuantityId = 'distance';

/** 並べ替えの境目の上限。区分が最も多い量（指ごと、10区分）の境目の数。 */
export const MAX_SORT_BOUNDARY = 9;
export const SORT_BOUNDARY_VALUES = Array.from({ length: MAX_SORT_BOUNDARY + 1 }, (_, index) => index) as readonly number[];

export const BAND_SORT_DIRECTIONS = ['desc', 'asc'] as const;
export type BandSortDirection = (typeof BAND_SORT_DIRECTIONS)[number];

export const bandChartOptions = defineOptions({
  quantity: defineOption<BandQuantityId>({
    schema: v.picklist(BAND_QUANTITY_IDS),
    default: DEFAULT_BAND_CHART_QUANTITY,
    affects: 'extract',
    url: picklistUrlCodec('quantity', BAND_QUANTITY_IDS),
    label: '量',
  }),
  sortBoundary: defineOption<number>({
    schema: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_SORT_BOUNDARY)),
    default: 0,
    affects: 'view',
    url: integerUrlCodec('sort', 0, MAX_SORT_BOUNDARY),
    label: '並び',
  }),
  sortDirection: defineOption<BandSortDirection>({
    schema: v.picklist(BAND_SORT_DIRECTIONS),
    default: 'desc',
    affects: 'view',
    url: picklistUrlCodec('sortDir', BAND_SORT_DIRECTIONS),
    label: '並びの向き',
  }),
});

export type BandChartOptions = typeof bandChartOptions.defaultOptions;

export const DEFAULT_BAND_CHART_OPTIONS: BandChartOptions = bandChartOptions.defaultOptions;

/** 入れ忘れ防止テスト（`optionsDiscipline`）用の、既定値と異なる妥当な値の組。 */
export const ALTERNATE_BAND_CHART_OPTIONS: BandChartOptions = { quantity: 'hand', sortBoundary: 2, sortDirection: 'asc' };
