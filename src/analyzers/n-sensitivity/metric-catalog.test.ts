import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID, LAYOUTS, LAYOUTS_JA } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { sampleText } from '#input/text/samples.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import { createEngineCache } from '#engine/cache.ts';
import { computeTraceScalars, TRACE_SCALAR_IDS } from '#interpretation/metrics.ts';
import {
  axisKindOf,
  axisTitle,
  axisValue,
  deltaUnit,
  formatMetricValue,
  relativeChoiceLabel,
  N_SENSITIVITY_METRIC_IDS,
  N_SENSITIVITY_METRICS,
} from './metric-catalog.ts';
import { N_SENSITIVITY_RANGE, valuesOf } from './extract.ts';
import { KANA_TEST_TEXT } from '../../../test/kana-test-text.ts';

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

/**
 * 選択肢の一覧が、組み込みの配列・サンプルテキストでNによって値が変わる指標と一致することを、
 * 実行して確かめる。条件は、物理配列はrow-staggered（JISの物理配列が要る配列はjis-row-staggered）・指割当は既定・設定は既定、テキストは英文の既定と
 * 旧文「吾輩は猫である」（前処理はアプリと同じ`sampleText`）。
 */
test('選択肢の指標は、組み込みの配列でNによって値が変わる指標と一致する', () => {
  const varied = new Set<string>();
  const cases = [
    ...LAYOUTS.map((layout) => ({ layoutId: layout.id, language: 'en' as const, text: sampleText('en', 'default') })),
    ...LAYOUTS_JA.map((layout) => ({ layoutId: layout.id, language: 'ja' as const, text: KANA_TEST_TEXT })),
  ];
  for (const { layoutId, language, text } of cases) {
    const setup: Setup = {
      id: 'setup-a',
      number: 1,
      layoutId,
      shapeId: CATALOG.layouts.get(layoutId)?.requiresJisShape === true ? 'jis-row-staggered' : 'row-staggered',
    };
    const resolved = resolveEngineInput({
      target: { kind: 'setup', setupId: 'setup-a' },
      setups: new Map([[setup.id, setup]]),
      catalog: CATALOG,
      userLayouts: new Map(),
      overrides: EMPTY_SETTINGS_OVERRIDES,
      text,
      language,
    });
    assert.ok(resolved.ok, `${layoutId} ${language}`);
    if (!resolved.ok) continue;
    const cache = createEngineCache();
    const homeSpacings = cache.getInterpretation(resolved.input).metrics.adjacentHomeSpacings;
    const rows = N_SENSITIVITY_RANGE.map((windowSize) => {
      const trace = cache.getTrace({
        ...resolved.input,
        tracePolicy: { ...resolved.input.tracePolicy, windowSize },
      }).trace;
      const { adjacentMean, adjacentStdDev } = valuesOf(trace, homeSpacings);
      return { ...computeTraceScalars(trace), adjacentMean, adjacentStdDev };
    });
    for (const id of [...TRACE_SCALAR_IDS, 'adjacentMean', 'adjacentStdDev'] as const) {
      if (rows.some((row) => row[id] !== rows[0]![id])) varied.add(id);
    }
  }
  assert.deepEqual([...N_SENSITIVITY_METRIC_IDS].sort(), [...varied].sort());
});

test('相対: 単位が%の指標はN=0との差[pt]、それ以外はN=0を100%とした比', () => {
  assert.equal(axisKindOf('sameFingerRate', 'relative'), 'delta');
  assert.equal(axisKindOf('totalUnits', 'relative'), 'ratio');
  assert.equal(axisKindOf('sameFingerRate', 'absolute'), 'value');
  assert.equal(axisValue('delta', 12.5, 10), -2.5);
  assert.equal(axisValue('ratio', 200, 150), 75);
  assert.equal(axisValue('value', 200, 150), 150);
});

test('相対: 0や負になりうる指間平均は差、0以上の指間σは比で描く', () => {
  assert.equal(axisKindOf('adjacentMean', 'relative'), 'delta');
  assert.equal(axisKindOf('adjacentStdDev', 'relative'), 'ratio');
  assert.equal(axisKindOf('adjacentMean', 'absolute'), 'value');
  // 基準が負でも、差は符号どおりに出る
  assert.equal(axisValue('delta', -0.02, 0.05), 0.07);
  assert.equal(axisTitle('adjacentMean', 'delta'), '指間平均（N=0との差 [u]）');
  assert.equal(axisTitle('adjacentStdDev', 'ratio'), '指間σ（N=0を100%）');
  assert.equal(relativeChoiceLabel('adjacentMean'), '相対（N=0との差 [u]）');
  assert.equal(relativeChoiceLabel('sameFingerRate'), '相対（N=0との差 [pt]）');
  assert.equal(relativeChoiceLabel('adjacentStdDev'), '相対（N=0を100%）');
  assert.equal(deltaUnit('adjacentMean'), 'u');
  assert.equal(deltaUnit('sameFingerRate'), 'pt');
});

test('相対の比は、N=0の値が0なら決まらない（0や100に置かない）', () => {
  assert.equal(axisValue('ratio', 0, 3), null);
  assert.equal(axisValue('ratio', 0, 0), null);
  assert.equal(axisValue('delta', 0, 3), 3);
});

test('率は%の指標だけで、単位の表記は指標の定義から決まる', () => {
  for (const id of N_SENSITIVITY_METRIC_IDS) {
    const def = N_SENSITIVITY_METRICS[id];
    assert.equal(def.percent, def.unit === '%', id);
  }
  assert.equal(formatMetricValue('totalUnits', 1234.56), '1234.6 u');
  assert.equal(formatMetricValue('sameFingerRate', 12.345), '12.3%');
  assert.equal(formatMetricValue('sameFinger', 7), '7回');
});

test('縦軸の見出しは、指標名と値の種類を読める', () => {
  assert.equal(axisTitle('totalUnits', 'ratio'), '距離（N=0を100%）');
  assert.equal(axisTitle('totalUnits', 'value'), '距離 [u]');
  assert.equal(axisTitle('sameFingerRate', 'delta'), '同指率（N=0との差 [pt]）');
});
