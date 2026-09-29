import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { AnalysisTarget, Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import { createEngineCache } from '#engine/cache.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { findOptionsKeyDisciplineViolations, findViewOptionsExtractionViolations } from '#analyzers/options.ts';
import { computeComparisonExtraction, computeComparisonRowValues } from './extract.ts';
import { ALTERNATE_COMPARISON_OPTIONS, DEFAULT_COMPARISON_OPTIONS, comparisonOptions } from './options.ts';

/**
 * `computeComparisonRowValues`（`extract.ts`）が、`interpretation/metrics.ts`の
 * `computeMetrics`を同条件で直接呼んだ値と一致することを検証する
 * （AGENTS.md「比較表に出る数値を、同条件でinterpretation/metrics.tsを直接呼んだ値と
 * 突き合わせる」）。条件: 配列qwerty・物理配列row-staggered・指割当既定・テキスト
 * "hello world"・windowSize等はengineの既定（`EMPTY_SETTINGS_OVERRIDES`）。
 */

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

test('computeComparisonRowValues: interpretation/metrics.tsを同条件で直接呼んだ値と一致する', () => {
  const setup: Setup = { id: 'setup-a', layoutId: 'qwerty', shapeId: 'row-staggered' };
  const resolution = resolveEngineInput({
    target: { kind: 'setup', setupId: setup.id },
    setups: new Map([[setup.id, setup]]),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: 'hello world',
    language: 'en',
  });
  assert.ok(resolution.ok);
  if (!resolution.ok) return;

  const cache = createEngineCache();
  const traceResult = cache.getTrace(resolution.input);
  const directMetrics = computeMetrics(traceResult.trace, resolution.input.geometry, {
    windowSize: resolution.input.tracePolicy.windowSize,
    sfbHomeCost: resolution.input.tracePolicy.sfbHomeCost,
    preferOppositeThumb: resolution.input.tracePolicy.preferOppositeThumb ?? false,
    chainInterpretation: resolution.input.chainInterpretation,
    arpeggioInterpretation: resolution.input.arpeggioInterpretation,
    triggerRealizationPolicy: resolution.input.tracePolicy.triggerRealizationPolicy!,
    actionRealizationPolicy: resolution.input.tracePolicy.actionRealizationPolicy!,
    romajiRuleId: resolution.input.romajiRuleId,
  });

  const engineMetrics = cache.getInterpretation(resolution.input).metrics;
  // 実行値の確認（AGENTS.md「数値は必ず実行して出す」）: engine経由・直接呼び出しの
  // どちらも同じ入力なので、同じ値になるはず（テスト自身の前提確認）。
  assert.equal(engineMetrics.totalUnits, directMetrics.totalUnits);

  const row = computeComparisonRowValues(engineMetrics);
  const adjacentMean = directMetrics.adjacent.reduce((sum, item) => sum + item.meanExcess, 0) / directMetrics.adjacent.length;
  const adjacentStdDev = directMetrics.adjacent.reduce((sum, item) => sum + item.stdDev, 0) / directMetrics.adjacent.length;

  assert.deepEqual(row, {
    actions: directMetrics.actions,
    totalUnits: directMetrics.totalUnits,
    meanPerStroke: directMetrics.meanPerStroke,
    perCharUnits: directMetrics.perCharUnits,
    perCharSteps: directMetrics.perCharSteps,
    perCharPresses: directMetrics.perCharPresses,
    singleTapLayerRate: directMetrics.singleTapLayerRate,
    singleTapRate: directMetrics.singleTapRate,
    singleKeyRate: directMetrics.singleKeyRate,
    sameFinger: directMetrics.sameFinger,
    sameFingerRate: (directMetrics.sameFinger / Math.max(1, directMetrics.strokes)) * 100,
    adjacentMean,
    adjacentStdDev,
  });
});

test('computeComparisonExtraction: 解決できたメンバーはok行、失敗はfailed行になる（行を消さない）', () => {
  const setup: Setup = { id: 'setup-a', layoutId: 'qwerty', shapeId: 'row-staggered' };
  const resolution = resolveEngineInput({
    target: { kind: 'setup', setupId: setup.id },
    setups: new Map([[setup.id, setup]]),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: 'hello world',
    language: 'en',
  });
  assert.ok(resolution.ok);
  if (!resolution.ok) return;

  const cache = createEngineCache();
  const traceResult = cache.getTrace(resolution.input);
  const interpretationResult = cache.getInterpretation(resolution.input);

  const targetA: AnalysisTarget = { kind: 'setup', setupId: 'setup-a' };
  const targetDeleted: AnalysisTarget = { kind: 'setup', setupId: 'setup-deleted' };
  const extracted = computeComparisonExtraction(
    [{
      target: targetA,
      trace: traceResult.trace,
      analysis: interpretationResult.analysis,
      metrics: interpretationResult.metrics,
      requestTrace: { requestTrace: () => { throw new Error('unused'); } },
    }],
    [{ target: targetDeleted, kind: 'reference', message: '配列が見つからない（削除された可能性がある）' }],
  );

  assert.equal(extracted.rows.length, 2);
  const okRow = extracted.rows.find((row) => row.targetKey === 'setup:setup-a');
  const failedRow = extracted.rows.find((row) => row.targetKey === 'setup:setup-deleted');
  assert.equal(okRow?.kind, 'ok');
  assert.equal(failedRow?.kind, 'failed');
  if (failedRow?.kind === 'failed') {
    assert.equal(failedRow.failureKind, 'reference');
    assert.match(failedRow.message, /削除/);
  }
});

test('optionsDiscipline: affectsの宣言どおりの入れ忘れが無い（比較表は全項目がview）', () => {
  const keyViolations = findOptionsKeyDisciplineViolations(
    comparisonOptions,
    DEFAULT_COMPARISON_OPTIONS,
    ALTERNATE_COMPARISON_OPTIONS,
  );
  assert.deepEqual(keyViolations, []);

  // 比較表は全項目がaffects:'view'なので、extractForTestはoptionsを無視した
  // ダミー関数でよい（実際の`extractForTest`は`comparisonDefinition.optionsDiscipline`側）。
  const viewViolations = findViewOptionsExtractionViolations(
    comparisonOptions,
    DEFAULT_COMPARISON_OPTIONS,
    ALTERNATE_COMPARISON_OPTIONS,
    () => 'dummy',
  );
  assert.deepEqual(viewViolations, []);
});
