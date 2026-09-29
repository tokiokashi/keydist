import assert from 'node:assert/strict';
import test from 'node:test';
import type { Finger, Key, Point } from '#input/shapes/geometry.ts';
import type { Press, Stroke, StrokeParticipation, Trace } from '#trace/generate.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import type { SingleAnalyzerDefinition } from '#analyzers/contract.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { resolveEngineInput, type ResolvedInput } from '#engine/resolved-input.ts';
import { createEngineCache } from '#engine/cache.ts';
import {
  aggregateBigramVectors,
  buildBigramVectors,
  directionDensity,
  directionSummary,
  filterBigramVectors,
  meanDisplacement,
  relativeVectors,
  repeatCountsByKey,
} from './bigram-vectors.ts';
import { findOptionsKeyDisciplineViolations, findViewOptionsExtractionViolations } from '#analyzers/options.ts';
import { nonStationaryVectors } from './options.ts';
import {
  bigramFlowDefinition,
  computeBigramFlowExtraction,
  type BigramFlowExtracted,
} from './extract.ts';
import {
  ALTERNATE_BIGRAM_FLOW_OPTIONS,
  DEFAULT_BIGRAM_FLOW_OPTIONS,
  bigramFlowOptions,
  decodeBigramFlowOptions,
  type BigramFlowOptions,
} from './options.ts';

/**
 * `computeBigramFlowExtraction`（`extract.ts`）が、旧`bigram-flow-view.tsx`が
 * componentの中で直接計算していたのと同じ値を返すことを検証する（#544 §7の
 * 「抽出」への切り出し。数値そのものは動かないのが正しい。AGENTS.md「リファクタでは
 * 数値が動かないのが正しい」）。旧経路の関数（`bigram-vectors.ts`の各集計関数）を
 * ここで直接呼び、`computeBigramFlowExtraction`の出力と突き合わせる。
 */

const key = (id: string, finger: Finger, x: number, y = 2): Key => ({
  id,
  finger,
  x,
  y,
  row: 2,
  col: 0,
});

const press = (
  finger: Finger,
  id: string,
  x: number,
  y = 2,
  target?: Point,
): Press => ({
  finger,
  keys: [key(id, finger, x, y)],
  target: target ?? { x, y },
  gap: 1,
  distance: 0,
  sfb: false,
});

const participation = (p: Press): StrokeParticipation => ({
  hand: p.finger.startsWith('L') ? 'left' : 'right',
  finger: p.finger,
  keys: p.keys,
  roles: ['output'],
});

const stroke = (index: number, presses: Press[]): Stroke => ({
  index,
  char: String(index),
  inputChar: String(index),
  inputIndex: index,
  aggregationGroupId: 'single',
  classifications: [],
  triggerKeys: [],
  pairedTriggerKeys: [],
  participations: presses.map(participation),
  presses,
  distance: 0,
  positions: {} as Stroke['positions'],
});

/**
 * 実Stroke bigram・手内bigram・同一キーrepeat・cross-handのどれも含む
 * fixture Trace。指の組は index/middle/pinky を使う。
 */
function fixtureTrace(): Trace {
  const strokes = [
    stroke(0, [press('LI', 'f', 4)]),
    stroke(1, [press('LI', 'f', 4)]), // 直前と同じキー = repeat（distance 0）
    stroke(2, [press('LM', 'd', 3)]),
    stroke(3, [press('RI', 'j', 7)]), // cross-hand
    stroke(4, [press('LP', 'a', 1)]),
    stroke(5, [press('LM', 'd', 3)]),
  ];
  return {
    strokes,
    errors: [],
    skipped: 0,
    inputChars: strokes.length,
    comboHits: [],
    comboDefinitions: 0,
    layerDefinitions: [],
  };
}

function referenceExtraction(trace: Trace, options: BigramFlowOptions): BigramFlowExtracted {
  const vectors = buildBigramVectors(trace.strokes, options.source);
  const filtered = filterBigramVectors(vectors, options.selectedFingers);
  const aggregated = aggregateBigramVectors(filtered);
  const analysisVectors = options.selectedFingers.length === 1
    ? aggregateBigramVectors(vectors.filter((vector) =>
      vector.fromFingerClass === options.selectedFingers[0]
      && vector.toFingerClass === options.selectedFingers[0]))
    : aggregated;

  const leftRelative = relativeVectors(analysisVectors, 'left');
  const rightRelative = relativeVectors(analysisVectors, 'right');
  const allRelative = [...leftRelative, ...rightRelative];
  const relativeMaxDistance = Math.ceil(Math.max(1, ...allRelative.map((v) => Math.hypot(v.dx, v.dy))));
  const relativeMaxWeight = Math.max(1, ...allRelative.map((v) => v.weight));

  const leftDensity = directionDensity(analysisVectors, 'left', options.polarBandwidth, 192);
  const rightDensity = directionDensity(analysisVectors, 'right', options.polarBandwidth, 192);

  const movingVectors = nonStationaryVectors(aggregated);
  const maxWeight = Math.max(1, ...movingVectors.map((v) => v.weight));
  const repeatCounts = repeatCountsByKey(aggregated);

  return {
    keyboardFlow: { vectors: aggregated, repeatCounts, maxWeight },
    rawCount: filtered.reduce((sum, v) => sum + v.weight, 0),
    hands: {
      left: {
        relative: leftRelative,
        summary: directionSummary(analysisVectors, 'left'),
        mean: meanDisplacement(analysisVectors, 'left'),
        density: leftDensity,
      },
      right: {
        relative: rightRelative,
        summary: directionSummary(analysisVectors, 'right'),
        mean: meanDisplacement(analysisVectors, 'right'),
        density: rightDensity,
      },
    },
    relativeMaxDistance,
    relativeMaxWeight,
    hasCrossHandInAnalysis: options.source === 'actual' && analysisVectors.some((v) => v.hand === 'cross'),
  };
}

test('computeBigramFlowExtractionは旧view実装が計算していたのと同じ値を返す（既定options）', () => {
  const trace = fixtureTrace();
  const extracted = computeBigramFlowExtraction(trace, DEFAULT_BIGRAM_FLOW_OPTIONS);
  const reference = referenceExtraction(trace, DEFAULT_BIGRAM_FLOW_OPTIONS);

  assert.deepEqual(extracted.keyboardFlow.vectors, reference.keyboardFlow.vectors);
  assert.deepEqual([...extracted.keyboardFlow.repeatCounts], [...reference.keyboardFlow.repeatCounts]);
  assert.equal(extracted.keyboardFlow.maxWeight, reference.keyboardFlow.maxWeight);
  assert.equal(extracted.rawCount, reference.rawCount);
  assert.deepEqual(extracted.hands.left, reference.hands.left);
  assert.deepEqual(extracted.hands.right, reference.hands.right);
  assert.equal(extracted.relativeMaxDistance, reference.relativeMaxDistance);
  assert.equal(extracted.relativeMaxWeight, reference.relativeMaxWeight);
  assert.equal(extracted.hasCrossHandInAnalysis, reference.hasCrossHandInAnalysis);
});

test('computeBigramFlowExtractionは1指選択・within-hand・bandwidth変更でも旧実装と同じ値になる', () => {
  const trace = fixtureTrace();
  const variants: BigramFlowOptions[] = [
    { ...DEFAULT_BIGRAM_FLOW_OPTIONS, selectedFingers: ['index'] },
    { ...DEFAULT_BIGRAM_FLOW_OPTIONS, selectedFingers: ['index', 'middle'] },
    { ...DEFAULT_BIGRAM_FLOW_OPTIONS, source: 'within-hand' },
    { ...DEFAULT_BIGRAM_FLOW_OPTIONS, polarBandwidth: 20 },
  ];

  for (const options of variants) {
    const extracted = computeBigramFlowExtraction(trace, options);
    const reference = referenceExtraction(trace, options);
    assert.deepEqual(extracted, reference, JSON.stringify(options));
  }
});

test('repeatは同一キーへ戻るvectorだけを数え、cross-handはactual/hasCrossHandInAnalysisへ現れる', () => {
  const trace = fixtureTrace();
  const extracted = computeBigramFlowExtraction(trace, DEFAULT_BIGRAM_FLOW_OPTIONS);

  assert.equal(extracted.keyboardFlow.repeatCounts.get('f'), 1);
  assert.equal(extracted.hasCrossHandInAnalysis, true);
});

test('extractKeyOf: 見た目だけの設定（lineScale等）を変えても抽出キーは変わらない', () => {
  const base = DEFAULT_BIGRAM_FLOW_OPTIONS;
  const changedView: BigramFlowOptions = {
    ...base,
    lineScale: 'log',
    layerOrder: 'cross-hand-top',
    hoverScale: 'global',
    polarGain: 2.5,
  };
  assert.deepEqual(
    bigramFlowDefinition.extractKeyOf(base),
    bigramFlowDefinition.extractKeyOf(changedView),
  );
});

test('extractKeyOf: 抽出に効く設定（source / selectedFingers / polarBandwidth）を変えると抽出キーが変わる', () => {
  const base = DEFAULT_BIGRAM_FLOW_OPTIONS;
  const changedSource: BigramFlowOptions = { ...base, source: 'within-hand' };
  const changedFingers: BigramFlowOptions = { ...base, selectedFingers: ['pinky'] };
  const changedBandwidth: BigramFlowOptions = { ...base, polarBandwidth: 30 };

  assert.notDeepEqual(bigramFlowDefinition.extractKeyOf(base), bigramFlowDefinition.extractKeyOf(changedSource));
  assert.notDeepEqual(bigramFlowDefinition.extractKeyOf(base), bigramFlowDefinition.extractKeyOf(changedFingers));
  assert.notDeepEqual(bigramFlowDefinition.extractKeyOf(base), bigramFlowDefinition.extractKeyOf(changedBandwidth));
});

test('extractKeyOf: selectedFingersは選んだ順ではなく集合として効く', () => {
  const a: BigramFlowOptions = { ...DEFAULT_BIGRAM_FLOW_OPTIONS, selectedFingers: ['index', 'middle'] };
  const b: BigramFlowOptions = { ...DEFAULT_BIGRAM_FLOW_OPTIONS, selectedFingers: ['middle', 'index'] };
  assert.deepEqual(bigramFlowDefinition.extractKeyOf(a), bigramFlowDefinition.extractKeyOf(b));
});

test('decodeBigramFlowOptions: 壊れた値は既定値へ戻し診断を積む', () => {
  const diagnostics: { path: string; message: string }[] = [];
  const decoded = decodeBigramFlowOptions({
    source: 'diagonal', // 未知の値
    selectedFingers: ['thumb', 'index', 'middle', 'ring'], // 未知の値混入 + 3件超過
    lineScale: 42, // 型違い
    polarBandwidth: 999, // 範囲外
    polarGain: 'huge', // 型違い
  }, diagnostics);

  assert.equal(decoded.source, DEFAULT_BIGRAM_FLOW_OPTIONS.source);
  assert.deepEqual(decoded.selectedFingers, ['index', 'middle']);
  assert.equal(decoded.lineScale, DEFAULT_BIGRAM_FLOW_OPTIONS.lineScale);
  assert.equal(decoded.polarBandwidth, DEFAULT_BIGRAM_FLOW_OPTIONS.polarBandwidth);
  assert.equal(decoded.polarGain, DEFAULT_BIGRAM_FLOW_OPTIONS.polarGain);
  assert.ok(diagnostics.length >= 5, `診断が積まれていない: ${JSON.stringify(diagnostics)}`);
});

test('decodeBigramFlowOptions: 未知の形式（配列・null・文字列）は丸ごと既定値へ戻す', () => {
  const diagnostics: { path: string; message: string }[] = [];
  assert.deepEqual(decodeBigramFlowOptions(null, diagnostics), DEFAULT_BIGRAM_FLOW_OPTIONS);
  assert.deepEqual(decodeBigramFlowOptions(['not', 'a', 'record'], diagnostics), DEFAULT_BIGRAM_FLOW_OPTIONS);
  assert.deepEqual(decodeBigramFlowOptions('nope', diagnostics), DEFAULT_BIGRAM_FLOW_OPTIONS);
  assert.ok(diagnostics.length >= 3);
});

test('decodeBigramFlowOptions: __proto__等の予約名がselectedFingersに混ざっても未知の指クラスとして診断付きで弾かれるだけ', () => {
  const diagnostics: { path: string; message: string }[] = [];
  const decoded = decodeBigramFlowOptions({ selectedFingers: ['__proto__', 'index'] }, diagnostics);
  assert.deepEqual(decoded.selectedFingers, ['index']);
  assert.ok(diagnostics.some((d) => d.message.includes('__proto__')));
});

// ---------------------------------------------------------------------------
// engine配線（getExtraction経由）
// ---------------------------------------------------------------------------

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

function resolve(text = 'hello world'): ResolvedInput {
  const setup: Setup = { id: 'setup-bigram-flow', layoutId: 'qwerty', shapeId: 'row-staggered' };
  const result = resolveEngineInput({
    target: { kind: 'setup', setupId: setup.id },
    setups: new Map([[setup.id, setup]]),
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

/** extractの呼び出し回数を数える、同じ挙動のラッパー定義。 */
function countingDefinition(counter: { calls: number }): SingleAnalyzerDefinition<BigramFlowOptions, BigramFlowExtracted> {
  return {
    ...bigramFlowDefinition,
    extract(context) {
      counter.calls += 1;
      return bigramFlowDefinition.extract(context);
    },
  };
}

test('engineのgetExtraction経由でBigram Flowを回すと、同じ抽出キーなら1回しかextractしない', () => {
  const cache = createEngineCache();
  const counter = { calls: 0 };
  const definition = countingDefinition(counter);
  const input = resolve();

  const a = cache.getExtraction(input, definition, DEFAULT_BIGRAM_FLOW_OPTIONS);
  const b = cache.getExtraction(input, definition, DEFAULT_BIGRAM_FLOW_OPTIONS);
  assert.equal(a, b);
  assert.equal(counter.calls, 1);

  // 見た目だけの設定変更ではextractが増えない。
  // `optionsDiscipline.extractForTest`が`Options`を反変位置でもう一度使うようになった影響で、
  // ここから`Options`を推論に任せると型が広がってしまう（`lineScale`等がリテラル型では
  // なく`string`に推論される）ため、明示的に型引数を渡して`definition`と揃える。
  cache.getExtraction<BigramFlowOptions, BigramFlowExtracted>(
    input, definition, { ...DEFAULT_BIGRAM_FLOW_OPTIONS, lineScale: 'log' },
  );
  assert.equal(counter.calls, 1, '見た目だけの設定変更でextractが走った');

  // 抽出に効く設定変更では増える。
  cache.getExtraction<BigramFlowOptions, BigramFlowExtracted>(
    input, definition, { ...DEFAULT_BIGRAM_FLOW_OPTIONS, source: 'within-hand' },
  );
  assert.equal(counter.calls, 2, '抽出に効く設定変更でextractが走らなかった');
});

// ---------------------------------------------------------------------------
// 入れ忘れ防止: Bigram Flowの8項目全部を機械的に回す（#544指示書「入れ忘れ防止のテスト」）
// ---------------------------------------------------------------------------

test('入れ忘れ防止: 抽出キーはaffects:extractの項目だけで変わる（8項目全部を宣言から機械的に回す）', () => {
  const violations = findOptionsKeyDisciplineViolations(
    bigramFlowOptions,
    DEFAULT_BIGRAM_FLOW_OPTIONS,
    ALTERNATE_BIGRAM_FLOW_OPTIONS,
  );
  assert.deepEqual(violations, []);
});

test('入れ忘れ防止: affects:viewの項目を変えても実際のextract結果は変わらない（誤分類の検出）', () => {
  const trace = fixtureTrace();
  const violations = findViewOptionsExtractionViolations(
    bigramFlowOptions,
    DEFAULT_BIGRAM_FLOW_OPTIONS,
    ALTERNATE_BIGRAM_FLOW_OPTIONS,
    (options) => computeBigramFlowExtraction(trace, options),
  );
  assert.deepEqual(violations, []);
});
