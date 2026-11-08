import * as v from 'valibot';
import { defineOption, defineOptions, picklistUrlCodec } from '#analyzers/options.ts';
import { BAND_QUANTITY_IDS, type BandQuantityId } from '#interpretation/band-quantities.ts';

/**
 * 帯グラフの解析設定。
 *
 * `quantity` は帯に出す量（`quantities.ts`）。身体・好み・配列思想で割れる設定ではなく、同じ図で見る量の切り替えで、
 * このAnalyzerだけが読むので、置き場は帯グラフの解析設定にする（AGENTS.md「置き場」）。
 * 抽出が選んだ量の割合だけを作るので `affects: 'extract'`。切り替えても、Traceから数えた7つの量の数え上げは覚えたものを使う。
 * 区分の境目は身体・好みで割れるものではなく、要望の実例も無いので固定する。
 * 計算に効く条件（N・ローマ字の綴り・物理配列・指割り当て）は、対象の条件としてペインの見出しの条件から変える。
 */
export const DEFAULT_BAND_CHART_QUANTITY: BandQuantityId = 'distance';

export const bandChartOptions = defineOptions({
  quantity: defineOption<BandQuantityId>({
    schema: v.picklist(BAND_QUANTITY_IDS),
    default: DEFAULT_BAND_CHART_QUANTITY,
    affects: 'extract',
    url: picklistUrlCodec('quantity', BAND_QUANTITY_IDS),
    label: '量',
  }),
});

export type BandChartOptions = typeof bandChartOptions.defaultOptions;

export const DEFAULT_BAND_CHART_OPTIONS: BandChartOptions = bandChartOptions.defaultOptions;

/** 入れ忘れ防止テスト（`optionsDiscipline`）用の、既定値と異なる妥当な値の組。 */
export const ALTERNATE_BAND_CHART_OPTIONS: BandChartOptions = { quantity: 'hand' };
