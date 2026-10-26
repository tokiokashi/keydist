import type { CodecDiagnostic } from '#input/codec/index.ts';
import { bigramFlowOptions } from '#analyzers/bigram-flow/options.ts';
import { bunsetsuStatsOptions } from '#analyzers/bunsetsu-stats/options.ts';
import { comparisonOptions } from '#analyzers/comparison/options.ts';
import { fingerDistanceOptions } from '#analyzers/finger-distance/options.ts';
import { handRhythmOptions } from '#analyzers/hand-rhythm/options.ts';
import { fingerMatrixOptions } from '#analyzers/finger-matrix/options.ts';
import { heatmapOptions } from '#analyzers/heatmap/options.ts';
import { heatmapLayersOptions } from '#analyzers/heatmap-layers/options.ts';
import { keymapOptions } from '#analyzers/keymap/options.ts';
import { layerComboPressesOptions } from '#analyzers/layer-combo-presses/options.ts';
import { nSensitivityOptions } from '#analyzers/n-sensitivity/options.ts';
import { playbackOptions } from '#analyzers/playback/options.ts';
import { runChartOptions } from '#analyzers/run-chart/options.ts';

export type AnalyzerOptionsDecoder = (raw: unknown, diagnostics: CodecDiagnostic[]) => unknown;

/**
 * Analyzer idから、そのAnalyzerの解析設定の`decodeOptions`を引く表。
 *
 * 起動時の読み込み（`asset-storage-specs.ts`）は全ページで読まれる。Analyzerの定義（`extract.ts`）は抽出の計算を
 * 連れてくるので、ここでは解析設定の宣言（`options.ts`）だけを読む。idと宣言の対応が定義と食い違っていないかは
 * `analyzer-options-decoders.test.ts`が全Analyzerの定義と突き合わせて検査する。
 */
export const ANALYZER_OPTIONS_DECODERS: ReadonlyMap<string, AnalyzerOptionsDecoder> = new Map<string, AnalyzerOptionsDecoder>([
  ['bigram-flow', bigramFlowOptions.decodeOptions],
  ['bunsetsu-stats', bunsetsuStatsOptions.decodeOptions],
  ['comparison', comparisonOptions.decodeOptions],
  ['finger-distance', fingerDistanceOptions.decodeOptions],
  ['hand-rhythm', handRhythmOptions.decodeOptions],
  ['finger-matrix', fingerMatrixOptions.decodeOptions],
  ['heatmap', heatmapOptions.decodeOptions],
  ['heatmap-layers', heatmapLayersOptions.decodeOptions],
  ['keymap', keymapOptions.decodeOptions],
  ['layer-combo-presses', layerComboPressesOptions.decodeOptions],
  ['n-sensitivity', nSensitivityOptions.decodeOptions],
  ['playback', playbackOptions.decodeOptions],
  ['run-chart', runChartOptions.decodeOptions],
]);
