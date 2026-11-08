import * as v from 'valibot';
import { defineOption, defineOptions, normalizedSetUrlCodec, picklistUrlCodec, type OptionUrlCodec } from '#analyzers/options.ts';
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
 * `free`を含む時だけ`xAxes`と`yAxes`を使う。どちらも比較表の列の順に持つ列の並びで、0個でもよい。選んだ横軸と縦軸の全部の組ごとに図を1つ描く。
 * 選んでいない軸の列は、足しても描ける図が1つも増えない時（もう一方の軸に選んだ全部の列と、選べない組になる時）だけ、解析設定の小窓で選べない状態にする。選べない組は、同じ列と入力かな数倍の関係にある2列。
 * 選んだ軸が選べない組になった時は、その組の図を描かず、本体が1つの知らせにまとめる。
 * `freeOrder`は「自由選択」の図の並びで、`byX`は横軸の順にその中で縦軸の順、`byY`は縦軸の順にその中で横軸の順。
 * `tickScale`は全ての図で共通の1つで、組み合わせごとには持たない。`log`を選んでいても、対数にできない図は通常の目盛りで描き、本体が図ごとにその旨を知らせる。
 * `columns`は図を並べる列の数の上限で、`auto`は幅で決める（`figure-layout.ts`）。
 */
export const DEFAULT_SCATTER_X_AXIS: ComparisonColumnId = 'perCharSteps';
export const SCATTER_TICK_SCALES = ['linear', 'log'] as const;
export type ScatterTickScale = (typeof SCATTER_TICK_SCALES)[number];
export const DEFAULT_SCATTER_TICK_SCALE: ScatterTickScale = 'linear';
export const DEFAULT_SCATTER_Y_AXIS: ComparisonColumnId = 'meanPerStroke';
export const SCATTER_FREE_ORDERS = ['byX', 'byY'] as const;
export type ScatterFreeOrder = (typeof SCATTER_FREE_ORDERS)[number];
export const DEFAULT_SCATTER_FREE_ORDER: ScatterFreeOrder = 'byX';
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

/** 軸の列を、比較表の列の順に並べ、重複と知らない値を捨てる。 */
export function normalizeScatterAxes(elements: readonly unknown[]): readonly ComparisonColumnId[] {
  const chosen = new Set<unknown>(elements);
  return COMPARISON_COLUMN_IDS.filter((column) => chosen.has(column));
}

function axesDecoder(fallback: ComparisonColumnId, name: string) {
  return (raw: unknown, path: string, diagnostics: CodecDiagnostic[]): readonly ComparisonColumnId[] => {
    if (raw === undefined) return [fallback];
    if (!Array.isArray(raw)) {
      diagnostics.push({ path, message: `配列でないため、既定の${name}へ戻しました` });
      return [fallback];
    }
    for (const item of raw) {
      if (!(COMPARISON_COLUMN_IDS as readonly unknown[]).includes(item)) {
        diagnostics.push({ path: `${path}[]`, message: `未知の${name}「${String(item)}」を捨てました` });
      }
    }
    return normalizeScatterAxes(raw);
  };
}

/** 軸のURL。0個も空文字で残す（省くと既定の軸へ戻り、共有先で違う図になる）。 */
function axesUrl(key: string): OptionUrlCodec<readonly ComparisonColumnId[]> {
  return {
    ...normalizedSetUrlCodec(key, COMPARISON_COLUMN_IDS, normalizeScatterAxes),
    encode: (value) => value.join(','),
  };
}

export const scatterOptions = defineOptions({
  presets: defineOption<readonly ScatterPresetId[]>({
    decode: decodePresets,
    default: [DEFAULT_SCATTER_PRESET],
    affects: 'view',
    url: normalizedSetUrlCodec('preset', SCATTER_PRESET_IDS, normalizeScatterPresets),
    label: '組み合わせ',
  }),
  xAxes: defineOption<readonly ComparisonColumnId[]>({
    decode: axesDecoder(DEFAULT_SCATTER_X_AXIS, '横軸'),
    default: [DEFAULT_SCATTER_X_AXIS],
    affects: 'view',
    url: axesUrl('x'),
    label: '横軸',
  }),
  yAxes: defineOption<readonly ComparisonColumnId[]>({
    decode: axesDecoder(DEFAULT_SCATTER_Y_AXIS, '縦軸'),
    default: [DEFAULT_SCATTER_Y_AXIS],
    affects: 'view',
    url: axesUrl('y'),
    label: '縦軸',
  }),
  freeOrder: defineOption<ScatterFreeOrder>({
    schema: v.picklist(SCATTER_FREE_ORDERS),
    default: DEFAULT_SCATTER_FREE_ORDER,
    affects: 'view',
    url: picklistUrlCodec('order', SCATTER_FREE_ORDERS),
    label: '図の並び',
  }),
  tickScale: defineOption<ScatterTickScale>({
    schema: v.picklist(SCATTER_TICK_SCALES),
    default: DEFAULT_SCATTER_TICK_SCALE,
    affects: 'view',
    url: picklistUrlCodec('scale', SCATTER_TICK_SCALES),
    label: '軸',
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
  xAxes: ['totalUnits'],
  yAxes: ['sameFinger'],
  freeOrder: 'byY',
  tickScale: 'log',
  columns: '2',
};
