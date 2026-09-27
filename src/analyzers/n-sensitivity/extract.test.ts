import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { resolveEngineInput, type ResolvedInput } from '#engine/resolved-input.ts';
import { createEngineCache } from '#engine/cache.ts';
import { findOptionsKeyDisciplineViolations, findViewOptionsExtractionViolations } from '#analyzers/options.ts';
import { nSensitivity } from './sensitivity.ts';
import { N_SENSITIVITY_RANGE, computeMemberSeries, computeNSensitivityExtraction } from './extract.ts';
import { ALTERNATE_N_SENSITIVITY_OPTIONS, DEFAULT_N_SENSITIVITY_OPTIONS, nSensitivityOptions } from './options.ts';

/**
 * `computeMemberSeries`（`extract.ts`）が、旧実装`nSensitivity`（`sensitivity.ts`。
 * legacyの`AnalyzerSensitivityResults`が呼んでいたのと同じ関数）と全11点ビット一致することを
 * 検証する（指示書「新しいextractの点が、旧nSensitivity(...)の出力と一致することを
 * 全11N・bit-for-bitでassertする」）。
 *
 * 条件: 配列qwerty・形状row-staggered・指割当既定・テキスト"hello world"・windowSize等は
 * engineの既定（`EMPTY_SETTINGS_OVERRIDES`）。2つ目のケースとして配列colemak-dhでも同様に確認する。
 */

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

function resolve(layoutId: string, text: string): ResolvedInput {
  const setup: Setup = { id: 'setup-a', layoutId, shapeId: 'row-staggered', colorIndex: 0 };
  const result = resolveEngineInput({
    setup,
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text,
    language: 'en',
  });
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error));
  if (!result.ok) throw new Error('unreachable');
  return result.input;
}

function checkLayout(layoutId: string, text: string): void {
  const input = resolve(layoutId, text);
  const cache = createEngineCache();
  const traceResult = cache.getTrace(input);
  const interpretationResult = cache.getInterpretation(input);

  const member = {
    setupId: 'setup-a',
    trace: traceResult.trace,
    analysis: interpretationResult.analysis,
    metrics: interpretationResult.metrics,
    requestTrace: {
      requestTrace: (request: { tracePolicy?: { windowSize?: number } }) => cache.getTrace({
        ...input,
        tracePolicy: { ...input.tracePolicy, ...request.tracePolicy },
      }).trace,
    },
  };

  const series = computeMemberSeries(member);

  const legacyPoints = nSensitivity(
    input.text,
    input.layout,
    input.geometry,
    input.tracePolicy,
    [...N_SENSITIVITY_RANGE],
    input.romajiRuleId,
    input.chainInterpretation,
    input.arpeggioInterpretation,
  );

  assert.equal(series.points.length, legacyPoints.length);
  for (let i = 0; i < legacyPoints.length; i++) {
    assert.equal(series.points[i]!.windowSize, legacyPoints[i]!.windowSize, `windowSize[${i}]`);
    assert.equal(series.points[i]!.totalUnits, legacyPoints[i]!.totalUnits, `totalUnits[${i}] (N=${legacyPoints[i]!.windowSize})`);
    assert.equal(series.points[i]!.totalMm, legacyPoints[i]!.totalMm, `totalMm[${i}] (N=${legacyPoints[i]!.windowSize})`);
  }
}

test('computeMemberSeries: qwerty/"hello world" で旧nSensitivityと全11N一致する', () => {
  checkLayout('qwerty', 'hello world');
});

test('computeMemberSeries: colemak-dh/"hello world" で旧nSensitivityと全11N一致する', () => {
  checkLayout('colemak-dh', 'hello world');
});

test('computeMemberSeries: N=既定の点は、メンバー自身のMetrics（totalUnits/totalMm）と一致する', () => {
  const input = resolve('qwerty', 'hello world');
  const cache = createEngineCache();
  const traceResult = cache.getTrace(input);
  const interpretationResult = cache.getInterpretation(input);
  const member = {
    setupId: 'setup-a',
    trace: traceResult.trace,
    analysis: interpretationResult.analysis,
    metrics: interpretationResult.metrics,
    requestTrace: {
      requestTrace: (request: { tracePolicy?: { windowSize?: number } }) => cache.getTrace({
        ...input,
        tracePolicy: { ...input.tracePolicy, ...request.tracePolicy },
      }).trace,
    },
  };
  const series = computeMemberSeries(member);
  const basePoint = series.points.find((point) => point.windowSize === input.tracePolicy.windowSize);
  assert.ok(basePoint);
  assert.equal(basePoint!.totalUnits, interpretationResult.metrics.totalUnits);
  assert.equal(basePoint!.totalMm, interpretationResult.metrics.totalMm);
});

test('computeNSensitivityExtraction: 解決できたメンバーはok系列、失敗はfailed系列になる（行を消さない）', () => {
  const input = resolve('qwerty', 'hello world');
  const cache = createEngineCache();
  const traceResult = cache.getTrace(input);
  const interpretationResult = cache.getInterpretation(input);

  const extracted = computeNSensitivityExtraction(
    [{
      setupId: 'setup-a',
      trace: traceResult.trace,
      analysis: interpretationResult.analysis,
      metrics: interpretationResult.metrics,
      requestTrace: { requestTrace: () => traceResult.trace },
    }],
    [{ setupId: 'setup-deleted', kind: 'reference', message: '配列「x」が見つからない（削除された可能性）' }],
  );

  assert.equal(extracted.series.length, 2);
  const ok = extracted.series.find((s) => s.setupId === 'setup-a');
  const failed = extracted.series.find((s) => s.setupId === 'setup-deleted');
  assert.equal(ok?.kind, 'ok');
  assert.equal(failed?.kind, 'failed');
  if (failed?.kind === 'failed') {
    assert.equal(failed.failureKind, 'reference');
    assert.match(failed.message, /削除/);
  }
});

test('optionsDiscipline: affectsの宣言どおりの入れ忘れが無い（N感度は全項目がview）', () => {
  const keyViolations = findOptionsKeyDisciplineViolations(
    nSensitivityOptions,
    DEFAULT_N_SENSITIVITY_OPTIONS,
    ALTERNATE_N_SENSITIVITY_OPTIONS,
  );
  assert.deepEqual(keyViolations, []);

  const viewViolations = findViewOptionsExtractionViolations(
    nSensitivityOptions,
    DEFAULT_N_SENSITIVITY_OPTIONS,
    ALTERNATE_N_SENSITIVITY_OPTIONS,
    () => computeNSensitivityExtraction([], []),
  );
  assert.deepEqual(viewViolations, []);
});
