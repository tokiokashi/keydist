import * as v from 'valibot';
import { defineOption, defineOptions, normalizedSetUrlCodec, picklistUrlCodec } from '#analyzers/options.ts';
import type { CodecDiagnostic } from '#input/codec/index.ts';
import { COMPARISON_COLUMN_IDS, type ComparisonColumnId } from '../comparison-column-text.ts';
import { DEFAULT_SCATTER_PRESET, normalizeScatterPresets, SCATTER_PRESET_IDS, type ScatterPresetId } from './axes.ts';

/**
 * 散布図の解析設定。
 *
 * **どれも`affects: 'view'`にする。** 抽出は比較表と同じく全列の値を持つので、組み合わせや軸を変えても
 * 抽出し直さない（どの2列を軸に取るかは「どう見せるか」であって「何を計算するか」ではない）。
 *
 * `presets`は並べて描く軸の組み合わせで、1つ以上を選ぶ。一覧（`SCATTER_PRESET_IDS`）の順に持ち、
 * 読み込んだ値が一覧と違う順・重複・知らない値を含んでいても、`normalizeScatterPresets`が整える。
 * `free`を含む時だけ`xAxis`と`yAxis`を使う。
 * 軸に選べない組（同じ列・入力かな数倍の関係にある2列）は、解析設定の小窓の選択肢から外す。
 * URLなどから選べない組が入った時は、本体が`free`の図だけ軸を描かずにその旨を知らせる。
 * `tickScale`・`xAxis`・`yAxis`は全ての図で共通の1つで、組み合わせごとには持たない。`log`を選んでいても、対数にできない図は通常の目盛りで描き、本体が図ごとにその旨を知らせる。
 * `columns`は図を並べる列の数の上限で、`auto`は幅で決める（`figure-layout.ts`）。
 */
export const DEFAULT_SCATTER_X_AXIS: ComparisonColumnId = 'perCharSteps';
export const SCATTER_TICK_SCALES = ['linear', 'log'] as const;
export type ScatterTickScale = (typeof SCATTER_TICK_SCALES)[number];
export const DEFAULT_SCATTER_TICK_SCALE: ScatterTickScale = 'linear';
export const DEFAULT_SCATTER_Y_AXIS: ComparisonColumnId = 'meanPerStroke';
export const SCATTER_COLUMN_SETTINGS = ['auto', '1', '2', '3'] as const;
export type ScatterColumnSetting = (typeof SCATTER_COLUMN_SETTINGS)[number];
export const DEFAULT_SCATTER_COLUMN_SETTING: ScatterColumnSetting = 'auto';

function decodePresets(raw: unknown, path: string, diagnostics: CodecDiagnostic[]): readonly ScatterPresetId[] {
  if (raw === undefined) return [DEFAULT_SCATTER_PRESET];
  if (!Array.isArray(raw)) {
    diagnostics.push({ path, message: '配列でないため、既定の組み合わせへ戻しました' });
    return [DEFAULT_SCATTER_PRESET];
  }
  for (const item of raw) {
    if (!(SCATTER_PRESET_IDS as readonly unknown[]).includes(item)) {
      diagnostics.push({ path: `${path}[]`, message: `未知の組み合わせ「${String(item)}」を捨てました` });
    }
  }
  return normalizeScatterPresets(raw);
}

export const scatterOptions = defineOptions({
  presets: defineOption<readonly ScatterPresetId[]>({
    decode: decodePresets,
    default: [DEFAULT_SCATTER_PRESET],
    affects: 'view',
    url: normalizedSetUrlCodec('preset', SCATTER_PRESET_IDS, normalizeScatterPresets),
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
  tickScale: defineOption<ScatterTickScale>({
    schema: v.picklist(SCATTER_TICK_SCALES),
    default: DEFAULT_SCATTER_TICK_SCALE,
    affects: 'view',
    url: picklistUrlCodec('scale', SCATTER_TICK_SCALES),
    label: '目盛り',
  }),
  columns: defineOption<ScatterColumnSetting>({
    schema: v.picklist(SCATTER_COLUMN_SETTINGS),
    default: DEFAULT_SCATTER_COLUMN_SETTING,
    affects: 'view',
    url: picklistUrlCodec('columns', SCATTER_COLUMN_SETTINGS),
    label: '列の数',
  }),
});

export type ScatterOptions = typeof scatterOptions.defaultOptions;

export const DEFAULT_SCATTER_OPTIONS: ScatterOptions = scatterOptions.defaultOptions;

/** 入れ忘れ防止テスト（`optionsDiscipline`）用の、既定値と異なる妥当な値の組。 */
export const ALTERNATE_SCATTER_OPTIONS: ScatterOptions = {
  presets: ['hand', 'free'],
  xAxis: 'totalUnits',
  yAxis: 'sameFinger',
  tickScale: 'log',
  columns: '2',
};
