import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { ALL_FINGERS, PHYSICAL_SHAPES, type Finger, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { AnalysisTarget, Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import { createEngineCache } from '#engine/cache.ts';
import { noRemember } from '#analyzers/contract.ts';
import { computeFingerDistanceExtraction } from '#analyzers/finger-distance/extract.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { findOptionsKeyDisciplineViolations, findViewOptionsExtractionViolations } from '#analyzers/options.ts';
import { analyzeHandRhythm } from '#interpretation/structure/hand-rhythm.ts';
import { handRhythmDefinition } from '#analyzers/hand-rhythm/extract.ts';
import { pairRowsOf } from '#analyzers/hand-rhythm/value-rows.ts';
import { computeComparisonExtraction, computeComparisonRowValues, fixtureMetrics, fixturePress, fixtureStroke, FIXTURE_TRACE } from './extract.ts';
import { DEFAULT_HAND_RHYTHM_OPTIONS } from '#analyzers/hand-rhythm/options.ts';
import { ALTERNATE_COMPARISON_OPTIONS, COMPARISON_COLUMNS, DEFAULT_COMPARISON_OPTIONS, comparisonOptions } from './options.ts';

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
    keepSymbols: resolution.input.keepSymbols,
    reading: resolution.input.reading,
  });

  const engineMetrics = cache.getInterpretation(resolution.input).metrics;
  // 実行値の確認（AGENTS.md「数値は必ず実行して出す」）: engine経由・直接呼び出しの
  // どちらも同じ入力なので、同じ値になるはず（テスト自身の前提確認）。
  assert.equal(engineMetrics.totalUnits, directMetrics.totalUnits);

  const row = computeComparisonRowValues(engineMetrics, traceResult.trace);
  const adjacentMean = directMetrics.adjacent.reduce((sum, item) => sum + item.meanExcess, 0) / directMetrics.adjacent.length;
  const adjacentStdDev = directMetrics.adjacent.reduce((sum, item) => sum + item.stdDev, 0) / directMetrics.adjacent.length;

  const {
    rightHandDistanceShare,
    rightHandPressShare,
    physicalBigramCombinations,
    logicalBigramCombinations,
    alternationCoverage,
    sameHandContinuationRate,
    handSwitches,
    handContinuations,
    bothHandPairShare,
    bothHandStrokes,
    alternationRuns,
    alternationMeanLength,
    alternationMaxLength,
    ...existing
  } = row;
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
  assert.ok(physicalBigramCombinations > 0 && logicalBigramCombinations >= physicalBigramCombinations);
  const { aggregate: handRhythm } = analyzeHandRhythm(traceResult.trace.strokes);
  assert.ok(handRhythm.alternation.coverage.rate !== handRhythm.continuationRate);
  assert.equal(alternationCoverage, handRhythm.alternation.coverage.rate * 100);
  assert.equal(sameHandContinuationRate, handRhythm.continuationRate * 100);
  assert.equal(handSwitches, handRhythm.switches);
  assert.equal(handContinuations, handRhythm.continuations);
  assert.equal(bothHandPairShare, 0);
  assert.equal(bothHandStrokes, 0);
  assert.equal(alternationRuns, handRhythm.alternation.runs);
  assert.equal(alternationMeanLength, handRhythm.alternation.meanLength);
  assert.equal(alternationMaxLength, handRhythm.alternation.maxLength);
});

const HAND_RHYTHM_CASES: readonly { readonly layoutId: string; readonly text: string; readonly language: 'en' | 'ja' }[] = [
  { layoutId: 'qwerty', text: 'the quick brown fox jumps over the lazy dog', language: 'en' },
  { layoutId: 'shingeta', text: 'こんにちは、せかいのみなさん', language: 'ja' },
  { layoutId: 'nicola', text: 'こんにちは、せかいのみなさん', language: 'ja' },
  { layoutId: 'naginata-v18', text: 'こんにちは、せかいのみなさん', language: 'ja' },
];

function handRhythmRowOf(layoutId: string, text: string, language: 'en' | 'ja') {
  const shapeId = LAYOUT_BY_ID.get(layoutId)?.requiresJisShape === true ? 'jis-row-staggered' : 'row-staggered';
  const setup: Setup = { id: 'setup-a', number: 1, layoutId, shapeId };
  const resolution = resolveEngineInput({
    target: { kind: 'setup', setupId: setup.id },
    setups: new Map([[setup.id, setup]]),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text,
    language,
  });
  assert.ok(resolution.ok, layoutId);
  if (!resolution.ok) throw new Error('unreachable');
  const cache = createEngineCache();
  const { trace } = cache.getTrace(resolution.input);
  const row = computeComparisonRowValues(cache.getInterpretation(resolution.input).metrics, trace);
  const extracted = cache.getExtraction(resolution.input, handRhythmDefinition, DEFAULT_HAND_RHYTHM_OPTIONS).extracted;
  return { row, extracted };
}

test('Hand Rhythmの列: 左右の手の交互のペインの抽出と同じ値で、列どうしを取り違えない', () => {
  for (const { layoutId, text, language } of HAND_RHYTHM_CASES) {
    const { row, extracted } = handRhythmRowOf(layoutId, text, language);
    const { aggregate, pairCount } = extracted;
    const { alternation, bothHandStrokes } = aggregate;
    assert.equal(row.handSwitches, aggregate.switches, layoutId);
    assert.equal(row.handContinuations, aggregate.continuations, layoutId);
    assert.equal(row.bothHandStrokes, bothHandStrokes.simultaneous + bothHandStrokes.mixed, layoutId);
    assert.equal(row.alternationRuns, alternation.runs, layoutId);
    assert.equal(row.alternationCoverage, alternation.coverage.rate * 100, layoutId);
    assert.equal(row.sameHandContinuationRate, aggregate.continuationRate * 100, layoutId);
    if (alternation.runs === 0) {
      assert.ok(Number.isNaN(row.alternationMeanLength), layoutId);
      assert.ok(Number.isNaN(row.alternationMaxLength), layoutId);
    } else {
      assert.equal(row.alternationMeanLength, alternation.meanLength, layoutId);
      assert.equal(row.alternationMaxLength, alternation.maxLength, layoutId);
    }
    // ペインの「組全体の○%」と同じ値になる。
    assert.equal(pairCount, aggregate.switches + aggregate.continuations + aggregate.bothHandPairs, layoutId);
    const paneShare = pairRowsOf(extracted).find((item) => item.id === 'both-hand-pairs')?.text;
    assert.equal(paneShare, `${aggregate.bothHandPairs}組（組全体の${COMPARISON_COLUMNS.bothHandPairShare.format(row.bothHandPairShare)}）`, layoutId);
  }
});

test('Hand Rhythmの列: 実在の配列で、列の値が互いに異なり、取り違えると落ちる', () => {
  const { row } = handRhythmRowOf('qwerty', 'the quick brown fox jumps over the lazy dog', 'en');
  // 切り替え・続き・連続の数・最長の長さは、この入力ではすべて異なる値になる。
  const distinct = [row.handSwitches, row.handContinuations, row.alternationRuns, row.alternationMaxLength];
  assert.equal(new Set(distinct).size, distinct.length);
  assert.ok(row.alternationMeanLength >= 3 && row.alternationMeanLength <= row.alternationMaxLength);
});

test('Hand Rhythmの列: 両手の打鍵を含む組の割合は、押す手が無い打鍵を含む組を分母に入れない', () => {
  // 手の切り替え2・同じ手の継続1・両手の打鍵を含む組2（合計5組）と、押す手が無い打鍵を含む組2。後者は分母に入れない。
  const left = fixtureStroke(0, [fixturePress('LI', 'f', 4)]);
  const right = fixtureStroke(1, [fixturePress('RI', 'j', 7)]);
  const both = fixtureStroke(2, [fixturePress('LI', 'f', 4), fixturePress('RI', 'j', 7)]);
  const none = fixtureStroke(3, []);
  const strokes = [left, right, left, left, both, left, none, left];
  const aggregate = analyzeHandRhythm(strokes).aggregate;
  assert.equal(aggregate.switches, 2);
  assert.equal(aggregate.continuations, 1);
  assert.equal(aggregate.bothHandPairs, 2);
  const row = computeComparisonRowValues(fixtureMetrics(1), { ...FIXTURE_TRACE, strokes });
  assert.equal(row.bothHandPairShare, (2 / 5) * 100);
});

test('Hand Rhythmの列: 打鍵が無い入力では、割合と件数が0で、平均と最長の長さは値なし', () => {
  const row = computeComparisonRowValues(fixtureMetrics(0), { ...FIXTURE_TRACE, strokes: [] });
  for (const column of [
    'handSwitches',
    'handContinuations',
    'bothHandPairShare',
    'bothHandStrokes',
    'alternationRuns',
    'alternationCoverage',
    'sameHandContinuationRate',
  ] as const) {
    assert.equal(row[column], 0, column);
  }
  assert.ok(Number.isNaN(row.alternationMeanLength));
  assert.ok(Number.isNaN(row.alternationMaxLength));
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
    const cache = createEngineCache();
    const { metrics } = cache.getInterpretation(resolution.input);
    const right = computeFingerDistanceExtraction(metrics).hands.right;
    const row = computeComparisonRowValues(metrics, cache.getTrace(resolution.input).trace);
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
  const cache = createEngineCache();
  const base = cache.getInterpretation(resolution.input).metrics;
  const { trace } = cache.getTrace(resolution.input);
  const only = (fingers: readonly Finger[]) => Object.assign({ ...zero }, ...fingers.map((finger) => ({ [finger]: 1 })));
  const row = (perFinger: Record<Finger, number>, perFingerPresses: Record<Finger, number>) =>
    computeComparisonRowValues({ ...base, perFinger, perFingerPresses }, trace);

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
    [
      {
        target: targetA,
        trace: traceResult.trace,
        analysis: interpretationResult.analysis,
        metrics: interpretationResult.metrics,
        requestTrace: {
          requestTrace: () => {
            throw new Error('unused');
          },
        },
        remember: noRemember,
      },
    ],
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
  const keyViolations = findOptionsKeyDisciplineViolations(comparisonOptions, DEFAULT_COMPARISON_OPTIONS, ALTERNATE_COMPARISON_OPTIONS);
  assert.deepEqual(keyViolations, []);

  // 比較表は全項目がaffects:'view'なので、抽出を呼ぶ関数はoptionsを無視した
  // ダミー関数でよい（定義の`extract`を通す検査は`comparisonDefinition.optionsDiscipline`側）。
  const viewViolations = findViewOptionsExtractionViolations(comparisonOptions, DEFAULT_COMPARISON_OPTIONS, ALTERNATE_COMPARISON_OPTIONS, () => 'dummy');
  assert.deepEqual(viewViolations, []);
});
