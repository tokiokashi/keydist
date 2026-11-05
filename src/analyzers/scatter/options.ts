import * as v from 'valibot';
import { defineOption, defineOptions, picklistUrlCodec } from '#analyzers/options.ts';
import { COMPARISON_COLUMN_IDS, type ComparisonColumnId } from '../comparison-column-text.ts';
import { SCATTER_PRESET_IDS, type ScatterPresetId } from './axes.ts';

/**
 * 散布図の解析設定。
 *
 * **どれも`affects: 'view'`にする。** 抽出は比較表と同じく全列の値を持つので、組み合わせや軸を変えても
 * 抽出し直さない（どの2列を軸に取るかは「どう見せるか」であって「何を計算するか」ではない）。
 *
 * `preset`は軸の組み合わせ。`free`の時だけ`xAxis`と`yAxis`を使う。
 * 軸に選べない組（同じ列・入力文字数倍の関係にある2列）は、解析設定の小窓の選択肢から外す。
 * URLなどから選べない組が入った時は、本体が軸を描かずにその旨を知らせる。
 */
export const DEFAULT_SCATTER_PRESET: ScatterPresetId = 'distance';
export const DEFAULT_SCATTER_X_AXIS: ComparisonColumnId = 'perCharSteps';
export const DEFAULT_SCATTER_Y_AXIS: ComparisonColumnId = 'meanPerStroke';

export const scatterOptions = defineOptions({
  preset: defineOption<ScatterPresetId>({
    schema: v.picklist(SCATTER_PRESET_IDS),
    default: DEFAULT_SCATTER_PRESET,
    affects: 'view',
    url: picklistUrlCodec('preset', SCATTER_PRESET_IDS),
    label: '組み合わせ',
  }),
  xAxis: defineOption<ComparisonColumnId>({
    schema: v.picklist(COMPARISON_COLUMN_IDS),
    default: DEFAULT_SCATTER_X_AXIS,
    affects: 'view',
    url: picklistUrlCodec('x', COMPARISON_COLUMN_IDS),
    label: '横軸',
  }),
  yAxis: defineOption<ComparisonColumnId>({
    schema: v.picklist(COMPARISON_COLUMN_IDS),
    default: DEFAULT_SCATTER_Y_AXIS,
    affects: 'view',
    url: picklistUrlCodec('y', COMPARISON_COLUMN_IDS),
    label: '縦軸',
  }),
});

export type ScatterOptions = typeof scatterOptions.defaultOptions;

export const DEFAULT_SCATTER_OPTIONS: ScatterOptions = scatterOptions.defaultOptions;

/** 入れ忘れ防止テスト（`optionsDiscipline`）用の、既定値と異なる妥当な値の組。 */
export const ALTERNATE_SCATTER_OPTIONS: ScatterOptions = {
  preset: 'free',
  xAxis: 'totalUnits',
  yAxis: 'sameFinger',
};
