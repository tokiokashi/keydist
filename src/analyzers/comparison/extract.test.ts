import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { ALL_FINGERS, PHYSICAL_SHAPES, type Finger, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { AnalysisTarget, Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import { createEngineCache } from '#engine/cache.ts';
import { computeFingerDistanceExtraction } from '#analyzers/finger-distance/extract.ts';
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
  const setup: Setup = { id: 'setup-a', number: 1, layoutId: 'qwerty', shapeId: 'row-staggered' };
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

  const { rightHandDistanceShare, rightHandPressShare, ...existing } = row;
  assert.deepEqual(existing, {
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
  assert.ok(rightHandDistanceShare > 0 && rightHandDistanceShare < 100);
  assert.ok(rightHandPressShare > 0 && rightHandPressShare < 100);
});

test('右手の割合: 指ごとの距離のAnalyzerの右手の小計と同じ値（%）になる', () => {
  for (const text of ['hello world', 'the quick brown fox jumps over the lazy dog', 'asdf']) {
    const setup: Setup = { id: 'setup-a', number: 1, layoutId: 'qwerty', shapeId: 'row-staggered' };
    const resolution = resolveEngineInput({
      target: { kind: 'setup', setupId: setup.id },
      setups: new Map([[setup.id, setup]]),
      catalog: CATALOG,
      userLayouts: new Map(),
      overrides: EMPTY_SETTINGS_OVERRIDES,
      text,
      language: 'en',
    });
    assert.ok(resolution.ok);
    if (!resolution.ok) return;
    const { metrics } = createEngineCache().getInterpretation(resolution.input);
    const right = computeFingerDistanceExtraction(metrics).hands.right;
    const row = computeComparisonRowValues(metrics);
    assert.ok(Math.abs(row.rightHandDistanceShare - right.distanceShare * 100) < 1e-9, text);
    assert.ok(Math.abs(row.rightHandPressShare - right.pressShare * 100) < 1e-9, text);
  }
});

test('右手の割合: 右手だけ・左手だけ・0の入力で、親指を右手に数え、0除算しない', () => {
  const zero = Object.fromEntries(ALL_FINGERS.map((finger) => [finger, 0])) as Record<Finger, number>;
  const setup: Setup = { id: 'setup-a', number: 1, layoutId: 'qwerty', shapeId: 'row-staggered' };
  const resolution = resolveEngineInput({
    target: { kind: 'setup', setupId: setup.id },
    setups: new Map([[setup.id, setup]]),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: 'a',
    language: 'en',
  });
  assert.ok(resolution.ok);
  if (!resolution.ok) return;
  const base = createEngineCache().getInterpretation(resolution.input).metrics;
  const only = (fingers: readonly Finger[]) => Object.assign({ ...zero }, ...fingers.map((finger) => ({ [finger]: 1 })));
  const row = (perFinger: Record<Finger, number>, perFingerPresses: Record<Finger, number>) =>
    computeComparisonRowValues({ ...base, perFinger, perFingerPresses });

  const none = row(zero, zero);
  assert.equal(none.rightHandDistanceShare, 0);
  assert.equal(none.rightHandPressShare, 0);

  const thumb = row(only(['RT']), only(['RT']));
  assert.equal(thumb.rightHandDistanceShare, 100);
  assert.equal(thumb.rightHandPressShare, 100);

  const left = row(only(['LT', 'LI']), only(['LP']));
  assert.equal(left.rightHandDistanceShare, 0);
  assert.equal(left.rightHandPressShare, 0);

  const mixed = row(only(['LI', 'RI', 'RM']), only(['LI', 'RI', 'RT', 'LM']));
  assert.ok(Math.abs(mixed.rightHandDistanceShare - (2 / 3) * 100) < 1e-9);
  assert.equal(mixed.rightHandPressShare, 50);
});

test('computeComparisonExtraction: 解決できたメンバーはok行、失敗はfailed行になる（行を消さない）', () => {
  const setup: Setup = { id: 'setup-a', number: 1, layoutId: 'qwerty', shapeId: 'row-staggered' };
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
    [{ target: targetDeleted, kind: 'reference', message: '配列が見つかりません（削除された可能性があります）' }],
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
