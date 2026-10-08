import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { ADJACENT_PAIRS, ALL_FINGERS, dist, PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { resolveEngineInput, type ResolvedInput } from '#engine/resolved-input.ts';
import { createEngineCache } from '#engine/cache.ts';
import { comparisonDefinition } from '#analyzers/comparison/extract.ts';
import { DEFAULT_COMPARISON_OPTIONS } from '#analyzers/comparison/options.ts';
import { checkOptionsDiscipline } from '#analyzers/options.ts';
import { fingerDistanceDefinition, type FingerDistanceExtracted } from './extract.ts';
import { DEFAULT_FINGER_DISTANCE_OPTIONS, fingerDistanceOptions } from './options.ts';
import { chartSpecOf, formatShare } from './chart-data.ts';

/**
 * 指ごとの距離の抽出（仕様 §11.1・§11.2・§11.6）を、実際のengine経路（解決 → Trace → Metrics → 抽出）で検証する。
 * 期待値は、仕様の式から手で導ける小さいテキストと、Traceから仕様の式で数え直した値の2通りで確かめる。
 */

/** 右親指キーが2つあり、space以外のキーをホームにした物理配列。右親指がspaceでホームから動く。 */
const TWO_THUMB_SHAPE: PhysicalShape = {
  ...PHYSICAL_SHAPES['row-staggered'],
  id: 'row-staggered-two-thumbs',
  thumbs: [...PHYSICAL_SHAPES['row-staggered'].thumbs, { id: 'thumb-r2', finger: 'RT', col: 6.5, y: 4 }],
  thumbHome: { RT: 'thumb-r2' },
};

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>([...Object.values(PHYSICAL_SHAPES), TWO_THUMB_SHAPE].map((shape) => [shape.id, shape])),
};

function resolve(layoutId: string, shapeId: string, text: string): ResolvedInput {
  const setup: Setup = { id: 'setup-finger-distance', number: 1, layoutId, shapeId };
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

function extract(input: ResolvedInput): FingerDistanceExtracted {
  return createEngineCache().getExtraction(input, fingerDistanceDefinition, DEFAULT_FINGER_DISTANCE_OPTIONS).extracted;
}

const near = (actual: number, expected: number, message?: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ''} actual=${actual} expected=${expected}`);

const fingerOf = (extracted: FingerDistanceExtracted, finger: string) => {
  const item = extracted.fingers.find((candidate) => candidate.finger === finger);
  assert.ok(item, finger);
  return item;
};

test('「ae」: 左中指がdからeへ動いた距離だけが計上され、指間距離の標準偏差も手で導ける', () => {
  // QWERTY / row-staggered / 既定の指割り当て。a（左小指）はホームなので距離0、
  // e（左中指）はホームのdから、上段へ1u・横へ0.25u（段ずれ）離れているので、距離は `hypot(0.25, 1)`。
  const extracted = extract(resolve('qwerty', 'row-staggered', 'ae'));
  const eMove = Math.hypot(0.25, 1);

  near(fingerOf(extracted, 'LM').distance, eMove);
  near(fingerOf(extracted, 'LP').distance, 0);
  assert.equal(fingerOf(extracted, 'LM').presses, 1);
  assert.equal(fingerOf(extracted, 'LP').presses, 1);
  near(extracted.totalDistance, eMove);
  near(extracted.hands.left.distance, eMove);
  near(extracted.hands.left.distanceShare, 1);
  near(extracted.hands.right.distance, 0);
  assert.equal(extracted.totalPresses, 2);
  near(fingerOf(extracted, 'LM').pressShare, 0.5);

  // 左薬指–左中指: 2打鍵の超過が [0, 0.25]（eを打った時に中指が1u上へ0.25u横へ動き、薬指との間隔が0.25開く）。
  // 母標準偏差は偏差の2乗の平均の平方根 = 0.125。
  const pair = extracted.adjacent.find((item) => item.pair[0] === 'LR' && item.pair[1] === 'LM');
  assert.ok(pair);
  near(pair.stdDev, 0.125);
  near(pair.meanExcess, 0.125);
  near(pair.maxExcess, 0.25);
  // 左手の他の組・右手は動かないので0。
  assert.equal(extracted.adjacent.find((item) => item.pair[1] === 'LR')?.stdDev, 0);
  assert.equal(extracted.adjacent.filter((item) => item.hand === 'right').every((item) => item.stdDev === 0), true);
});

/** 実機の経路（Trace）から、仕様の式で指ごとの値を数え直す。抽出の実装には頼らない。 */
function recountFromTrace(input: ResolvedInput) {
  const { trace } = createEngineCache().getTrace(input);
  assert.ok(trace);
  const distance = new Map(ALL_FINGERS.map((finger) => [finger, 0]));
  const presses = new Map(ALL_FINGERS.map((finger) => [finger, 0]));
  for (const stroke of trace.strokes) {
    for (const press of stroke.presses) {
      distance.set(press.finger, distance.get(press.finger)! + press.distance);
      presses.set(press.finger, presses.get(press.finger)! + press.keys.length);
    }
  }
  const stdDev = ADJACENT_PAIRS.map(([a, b]) => {
    const homeGap = dist(input.geometry.homes[a], input.geometry.homes[b]);
    const samples = trace.strokes.map((stroke) => dist(stroke.positions[a], stroke.positions[b]) - homeGap);
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    return Math.sqrt(samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length);
  });
  return { distance, presses, stdDev };
}

const CASES = [
  { name: 'QWERTY / row-staggered', layoutId: 'qwerty', shapeId: 'row-staggered' },
  { name: 'Colemak-DH / row-staggered', layoutId: 'colemak-dh', shapeId: 'row-staggered' },
] as const;

for (const item of CASES) {
  test(`${item.name}「hello world」: 指ごとの距離・押下数・指間距離の標準偏差がTraceからの数え直しと一致する`, () => {
    const input = resolve(item.layoutId, item.shapeId, 'hello world');
    const extracted = extract(input);
    const recount = recountFromTrace(input);

    for (const finger of ALL_FINGERS) {
      near(fingerOf(extracted, finger).distance, recount.distance.get(finger)!, `${finger}の距離`);
      assert.equal(fingerOf(extracted, finger).presses, recount.presses.get(finger), `${finger}の押下数`);
    }
    extracted.adjacent.forEach((entry, i) => {
      assert.deepEqual(entry.pair, ADJACENT_PAIRS[i]);
      near(entry.stdDev, recount.stdDev[i]!, `${entry.pair.join('-')}の標準偏差`);
    });
    assert.equal(extracted.adjacent.length, 6);
  });
}

test('固定値: QWERTY / row-staggered / 「hello world」', () => {
  const extracted = extract(resolve('qwerty', 'row-staggered', 'hello world'));
  const slanted = Math.hypot(0.25, 1);
  assert.deepEqual(
    extracted.fingers.map((item) => [item.finger, item.presses]),
    [['LP', 0], ['LR', 1], ['LM', 2], ['LI', 1], ['LT', 0], ['RT', 1], ['RI', 1], ['RM', 0], ['RR', 5], ['RP', 0]],
  );
  near(fingerOf(extracted, 'LR').distance, slanted);
  near(fingerOf(extracted, 'LM').distance, slanted);
  near(fingerOf(extracted, 'LI').distance, slanted);
  near(fingerOf(extracted, 'RI').distance, 1);
  near(fingerOf(extracted, 'RR').distance, slanted);
  near(extracted.totalDistance, 5.1231056256176615);
  assert.equal(extracted.totalPresses, 11);
  assert.deepEqual(
    extracted.adjacent.map((item) => [item.pair.join('-'), Number(item.stdDev.toFixed(6))]),
    [['LP-LR', 0.07187], ['LR-LM', 0.180312], ['LM-LI', 0.180312], ['RI-RM', 0.28748], ['RM-RR', 0.120261], ['RR-RP', 0.289003]],
  );
  near(extracted.hands.left.distance + extracted.hands.right.distance, extracted.totalDistance);
  near(extracted.hands.left.distanceShare + extracted.hands.right.distanceShare, 1);
  near(extracted.hands.left.pressShare + extracted.hands.right.pressShare, 1);
});

test('固定値: Colemak-DH / row-staggered / 「hello world」', () => {
  const extracted = extract(resolve('colemak-dh', 'row-staggered', 'hello world'));
  near(fingerOf(extracted, 'RI').distance, 3.1795868015587256);
  assert.equal(fingerOf(extracted, 'RI').presses, 4);
  near(fingerOf(extracted, 'LI').distance, 1.118033988749895);
  near(extracted.totalDistance, 5.328397196713036);
  assert.deepEqual(
    extracted.adjacent.map((item) => [item.pair.join('-'), Number(item.stdDev.toFixed(6))]),
    [['LP-LR', 0.07187], ['LR-LM', 0.172712], ['LM-LI', 0.230782], ['RI-RM', 0.263108], ['RM-RR', 0], ['RR-RP', 0]],
  );
});

test('指ごとの移動距離の合計は、比較表の総移動距離と一致する', () => {
  for (const item of CASES) {
    const input = resolve(item.layoutId, item.shapeId, 'hello world');
    const extracted = extract(input);
    const cache = createEngineCache();
    const comparison = cache.getSetExtraction(
      [{ target: { kind: 'setup', setupId: 'setup-finger-distance' }, resolution: { ok: true, input } }],
      comparisonDefinition,
      DEFAULT_COMPARISON_OPTIONS,
    ).extracted;
    const row = comparison.rows[0];
    assert.ok(row && row.kind === 'ok');
    const sumOfFingers = extracted.fingers.reduce((sum, entry) => sum + entry.distance, 0);
    near(sumOfFingers, row.values.totalUnits, `${item.name}: 指ごとの合計と比較表の総移動距離`);
    near(extracted.totalDistance, row.values.totalUnits);
  }
});

test('親指キーが複数ある物理配列では、親指の移動距離も合計に入り、比較表の総移動距離と一致する', () => {
  const input = resolve('qwerty', TWO_THUMB_SHAPE.id, 'a b c');
  const extracted = extract(input);
  const comparison = createEngineCache().getSetExtraction(
    [{ target: { kind: 'setup', setupId: 'setup-finger-distance' }, resolution: { ok: true, input } }],
    comparisonDefinition,
    DEFAULT_COMPARISON_OPTIONS,
  ).extracted;
  const row = comparison.rows[0];
  assert.ok(row && row.kind === 'ok');
  const thumb = fingerOf(extracted, 'RT');
  assert.ok(thumb.distance > 0, '右親指の距離が0（親指が動く入力になっていない）');
  const all = extracted.fingers.reduce((sum, entry) => sum + entry.distance, 0);
  const withoutThumbs = extracted.fingers.filter((entry) => !entry.finger.endsWith('T')).reduce((sum, entry) => sum + entry.distance, 0);
  near(thumb.distance, 1, '右親指の距離');
  near(all, 3.9208096264818897, '10本の合計');
  near(withoutThumbs, 2.9208096264818897, '8本の合計');
  near(all, row.values.totalUnits, '10本の合計と比較表の総移動距離');
  assert.ok(Math.abs(withoutThumbs - row.values.totalUnits) > 0.1, '8本の合計が総移動距離と同じになっている');
  near(extracted.hands.right.distance + extracted.hands.left.distance, row.values.totalUnits);
});

test('移動も押下も無いテキストでは、割合は0で出て非数にならない', () => {
  const extracted = extract(resolve('qwerty', 'row-staggered', ''));
  assert.equal(extracted.totalDistance, 0);
  assert.equal(extracted.totalPresses, 0);
  for (const item of extracted.fingers) {
    assert.equal(item.distanceShare, 0);
    assert.equal(item.pressShare, 0);
  }
  for (const item of extracted.adjacent) assert.equal(item.stdDev, 0);
});

test('入れ忘れ防止: 見る量は表示専用で、抽出キーは空になる', () => {
  assert.deepEqual(Object.keys(fingerDistanceOptions.items), ['chartMetric']);
  assert.deepEqual(fingerDistanceOptions.extractKeyOf(DEFAULT_FINGER_DISTANCE_OPTIONS), {});
  assert.deepEqual(
    checkOptionsDiscipline(fingerDistanceOptions, fingerDistanceDefinition.optionsDiscipline),
    { keyViolations: [], viewExtractionViolations: [] },
  );
});

test('既定の見る量は移動距離', () => {
  assert.equal(DEFAULT_FINGER_DISTANCE_OPTIONS.chartMetric, 'distance');
});

test('グラフの棒は左手の小指から右手の小指の順で、値は抽出結果と同じ', () => {
  const extracted = extract(resolve('qwerty', 'row-staggered', 'the quick brown fox'));
  const distance = chartSpecOf(extracted, 'distance');
  assert.deepEqual(distance.bars.map((bar) => bar.key), ['LP', 'LR', 'LM', 'LI', 'LT', 'RT', 'RI', 'RM', 'RR', 'RP']);
  assert.deepEqual(distance.bars.map((bar) => bar.value), extracted.fingers.map((item) => item.distance));
  assert.deepEqual(distance.bars.map((bar) => bar.hand), [...Array(5).fill('left'), ...Array(5).fill('right')]);
  assert.deepEqual(chartSpecOf(extracted, 'presses').bars.map((bar) => bar.value), extracted.fingers.map((item) => item.presses));
  // 割合はツールチップに出る
  assert.ok(distance.bars[0]!.tip.includes(formatShare(extracted.fingers[0]!.distanceShare)));

  const pairs = extracted.adjacent;
  assert.deepEqual(chartSpecOf(extracted, 'stdDev').bars.map((bar) => bar.value), pairs.map((item) => item.stdDev));
  assert.deepEqual(chartSpecOf(extracted, 'mean').bars.map((bar) => bar.value), pairs.map((item) => item.meanExcess));
  assert.deepEqual(chartSpecOf(extracted, 'max').bars.map((bar) => bar.value), pairs.map((item) => item.maxExcess));
  assert.deepEqual(chartSpecOf(extracted, 'max').bars.map((bar) => bar.hand), ['left', 'left', 'left', 'right', 'right', 'right']);
});
