import assert from 'node:assert/strict';
import test from 'node:test';
import { bigramFlowDefinition } from '#analyzers/bigram-flow/extract.ts';
import { bunsetsuStatsDefinition } from '#analyzers/bunsetsu-stats/extract.ts';
import { comparisonDefinition } from '#analyzers/comparison/extract.ts';
import { fingerDistanceDefinition } from '#analyzers/finger-distance/extract.ts';
import { handRhythmDefinition } from '#analyzers/hand-rhythm/extract.ts';
import { fingerMatrixDefinition } from '#analyzers/finger-matrix/extract.ts';
import { heatmapDefinition } from '#analyzers/heatmap/extract.ts';
import { heatmapLayersDefinition } from '#analyzers/heatmap-layers/extract.ts';
import { keymapDefinition } from '#analyzers/keymap/extract.ts';
import { layerComboPressesDefinition } from '#analyzers/layer-combo-presses/extract.ts';
import { nSensitivityDefinition } from '#analyzers/n-sensitivity/extract.ts';
import { playbackDefinition } from '#analyzers/playback/extract.ts';
import { runChartDefinition } from '#analyzers/run-chart/extract.ts';
import { WORKSPACE_ANALYZERS } from '#hosts/workspace/analyzer-registry.ts';
import { ANALYZER_OPTIONS_DECODERS } from './analyzer-options-decoders.ts';

const DEFINITIONS = [
  bigramFlowDefinition,
  bunsetsuStatsDefinition,
  comparisonDefinition,
  fingerDistanceDefinition,
  fingerMatrixDefinition,
  handRhythmDefinition,
  heatmapDefinition,
  heatmapLayersDefinition,
  keymapDefinition,
  layerComboPressesDefinition,
  nSensitivityDefinition,
  playbackDefinition,
  runChartDefinition,
];

test('全Analyzerの解析設定を、そのAnalyzerの定義と同じdecodeOptionsで読む', () => {
  for (const definition of DEFINITIONS) {
    assert.equal(ANALYZER_OPTIONS_DECODERS.get(definition.id), definition.decodeOptions, definition.id);
  }
  assert.equal(ANALYZER_OPTIONS_DECODERS.size, DEFINITIONS.length);
});

test('Workspaceに置けるAnalyzerはすべて表にある', () => {
  assert.deepEqual([...ANALYZER_OPTIONS_DECODERS.keys()].sort(), WORKSPACE_ANALYZERS.map((entry) => entry.id).sort());
});
