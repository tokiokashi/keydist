import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID, withRomaji } from '#input/layouts/index.ts';
import { fromRows, type Layout } from '#input/layouts/types.ts';
import { tableForRule } from '#input/romaji/rules.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { computeKeyDetails } from '#interpretation/key-detail.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { nonStationaryVectors } from '../keyboard-flow-lines.ts';
import { computeBigramFlowExtraction } from '../bigram-flow/extract.ts';
import { DEFAULT_BIGRAM_FLOW_OPTIONS } from '../bigram-flow/options.ts';
import { computeHeatmapExtraction, sharedMaxCount, sharedMaxFlowWeight } from './extract.ts';

/**
 * ヒートマップの抽出（キーごとの押下数）。期待値は、打つ文字から手で数えられる小さいテキストで固定する。
 */

const geometry = buildGeometry('row-staggered');

/** 単打の層だけを持つ配列（Shiftの層を作らない）。 */
const SINGLE_LAYER_LAYOUT = fromRows('single-layer', '単層', ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./']);

function traceFor(layoutId: string, text: string, rule?: string) {
  const base: Layout | undefined = layoutId === SINGLE_LAYER_LAYOUT.id ? SINGLE_LAYER_LAYOUT : LAYOUT_BY_ID.get(layoutId);
  assert.ok(base, layoutId);
  const layout = rule ? withRomaji(base, tableForRule(rule)) : base;
  const trace = generateTrace(text, layout, geometry, DEFAULT_TRACE_POLICY);
  assert.equal(trace.skipped, 0);
  return trace;
}

function extractFor(layoutId: string, text: string, rule?: string) {
  const trace = traceFor(layoutId, text, rule);
  return computeHeatmapExtraction({ metrics: computeMetrics(trace, geometry), keyDetails: computeKeyDetails(trace, geometry), trace });
}

const entries = (map: ReadonlyMap<string, number>) => [...map].sort(([a], [b]) => a.localeCompare(b));

test('層が1つの配列: 押したキーの押下数と最大値を持つ', () => {
  const extracted = extractFor('single-layer', 'aaq');
  assert.deepEqual(entries(extracted.keyCounts), [
    ['a', 2],
    ['q', 1],
  ]);
  assert.equal(extracted.presses, 3);
  assert.equal(extracted.maxCount, 2);
});

test('層が複数の配列(Shiftあり): 全部の層の押下を物理キーで合算する', () => {
  // "aAa": a(単打) + A(右Shift + a) + a(単打)
  const extracted = extractFor('qwerty', 'aAa');
  assert.deepEqual(entries(extracted.keyCounts), [
    ['a', 3],
    ['shift-r', 1],
  ]);
  assert.equal(extracted.presses, 4);
  assert.equal(extracted.maxCount, 3);
});

test('層が複数のかな配列: 層操作のキーも合算に含む', () => {
  // 新下駄の "あいがぱ": 単打(あ・い)と中指シフト(が・ぱ)
  const extracted = extractFor('shingeta', 'あいがぱ');
  assert.deepEqual(entries(extracted.keyCounts), [
    ['d', 2],
    ['j', 1],
    ['k', 1],
    ['o', 1],
    ['u', 1],
  ]);
});

test('コンボの押下も合算に含む', () => {
  // かわせみ配列+の「あい」はlと;の同時押しのコンボ
  const extracted = extractFor('kawasemi-plus', 'あい');
  assert.deepEqual(entries(extracted.keyCounts), [
    [';', 1],
    ['l', 1],
  ]);
});

test('テキストが空なら、すべて0', () => {
  const extracted = extractFor('qwerty', '');
  assert.equal(extracted.presses, 0);
  assert.equal(extracted.maxCount, 0);
});

test('キーの詳細の押下数は、ヒートマップの押下数と全キーで一致する', () => {
  const cases: Array<[string, string, string | undefined]> = [
    ['shingeta', 'がきゃ。ぱかかか、んー', undefined],
    ['qwerty', 'しゃかんじょうほうがっこう', 'kunrei'],
    ['qwerty', 'かんかんがんじゃくらんこう', 'azik'],
    ['shin-koume', 'ぴあぴかぴ', undefined],
  ];
  for (const [layoutId, text, rule] of cases) {
    const extracted = extractFor(layoutId, text, rule);
    const merged = new Map([...extracted.keyDetails.merged].map(([id, detail]) => [id, detail.presses]));
    assert.deepEqual(merged, new Map(extracted.keyCounts), layoutId);
    assert.equal(
      [...merged.values()].reduce((a, b) => a + b, 0),
      extracted.presses,
      layoutId,
    );
  }
});

test('色の尺度の最大値: 並べた図の全部の最大値を取り、全部0なら1にする', () => {
  assert.equal(sharedMaxCount([3, 10, 7]), 10);
  assert.equal(sharedMaxCount([4]), 4);
  assert.equal(sharedMaxCount([0, 0]), 1);
  assert.equal(sharedMaxCount([]), 1);
});

test('色の尺度と同じく、線の太さの尺度の最大値は並べた図の全部の最大値を取り、線が無ければ1にする', () => {
  assert.equal(sharedMaxFlowWeight([3, 10, 7]), 10);
  assert.equal(sharedMaxFlowWeight([1, 1]), 1);
  assert.equal(sharedMaxFlowWeight([]), 1);
});

test('線の組は、指を絞らない時のBigram FlowのKeyboard Flowと、組の個数も各組の回数も一致する', () => {
  const cases: Array<[string, string, string | undefined]> = [
    ['qwerty', 'the quick brown fox jumps over the lazy dog aaa', undefined],
    ['qwerty', 'しゃかんじょうほうがっこう', 'kunrei'],
    ['shingeta', 'がきゃ。ぱかかか、んー', undefined],
    ['kawasemi-plus', 'あいあいうえお', undefined],
  ];
  for (const [layoutId, text, rule] of cases) {
    const trace = traceFor(layoutId, text, rule);
    const heatmap = computeHeatmapExtraction({ metrics: computeMetrics(trace, geometry), keyDetails: computeKeyDetails(trace, geometry), trace });
    for (const source of ['actual', 'within-hand'] as const) {
      const flow = computeBigramFlowExtraction(trace, { ...DEFAULT_BIGRAM_FLOW_OPTIONS, source });
      const expected = nonStationaryVectors(flow.keyboardFlow.vectors);
      const actual = heatmap.flowLines[source];
      assert.ok(actual.vectors.length > 0, `${layoutId}/${source}: 組が1つも無い入力では検査にならない`);
      assert.equal(actual.vectors.length, expected.length, `${layoutId}/${source}: 組の個数`);
      assert.deepEqual(
        actual.vectors.map((vector) => [vector.id, vector.weight]),
        expected.map((vector) => [vector.id, vector.weight]),
        `${layoutId}/${source}: 各組の回数`,
      );
      assert.equal(actual.maxWeight, flow.keyboardFlow.maxWeight, `${layoutId}/${source}: 太さの最大値`);
    }
  }
});

test('線の組から、連打と親指のキーを含む組は除かれる', () => {
  // "aaa" は同じキーへ戻る連打だけ。空白（親指）を含む組は、親指のキーを含むので描かない
  const trace = traceFor('qwerty', 'aaa a', undefined);
  const heatmap = computeHeatmapExtraction({ metrics: computeMetrics(trace, geometry), keyDetails: computeKeyDetails(trace, geometry), trace });
  for (const source of ['actual', 'within-hand'] as const) {
    for (const vector of heatmap.flowLines[source].vectors) {
      assert.ok(vector.distance >= 1e-6, 'repeat');
      assert.ok(!vector.fromFinger.endsWith('T') && !vector.toFinger.endsWith('T'), 'thumb');
    }
  }
  assert.equal(heatmap.flowLines.actual.vectors.length, 0);
});
