import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGeometry, type Finger, type Key } from '#input/shapes/geometry.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { fromRows, type Layout } from '#input/layouts/types.ts';
import { DEFAULT_TRACE_POLICY, generateTrace, type Stroke, type Trace } from '#trace/generate.ts';
import { computeHeatmapExtraction } from './extract.ts';

/**
 * ヒートマップの抽出（キー × 面の押下数）。期待値は、打つ文字から手で数えられる小さいテキストで固定する。
 */

const geometry = buildGeometry('row-staggered');

/** 単打の層だけを持つ配列（Shiftの面を作らない）。 */
const SINGLE_LAYER_LAYOUT = fromRows('single-layer', '単層', ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./']);

function extractFor(layoutId: string, text: string) {
  const layout: Layout | undefined = layoutId === SINGLE_LAYER_LAYOUT.id ? SINGLE_LAYER_LAYOUT : LAYOUT_BY_ID.get(layoutId);
  assert.ok(layout, layoutId);
  const trace = generateTrace(text, layout, geometry, DEFAULT_TRACE_POLICY);
  assert.equal(trace.skipped, 0);
  return computeHeatmapExtraction(trace);
}

const entries = (map: ReadonlyMap<string, number>) => [...map].sort(([a], [b]) => a.localeCompare(b));

test('層が1つの配列: 統合と唯一の層が同じ押下数になる', () => {
  const extracted = extractFor('single-layer', 'aaq');
  assert.deepEqual(entries(extracted.integrated.keyCounts), [['a', 2], ['q', 1]]);
  assert.equal(extracted.integrated.presses, 3);
  assert.equal(extracted.integrated.maxCount, 2);
  assert.deepEqual(extracted.layers.map((layer) => layer.id), ['single']);
  const [single] = extracted.layers;
  assert.deepEqual(entries(single.keyCounts), [['a', 2], ['q', 1]]);
  assert.deepEqual(entries(single.colorCounts), [['a', 2], ['q', 1]]);
  assert.equal(single.presses, 3);
  assert.equal(extracted.sharedMaxColorCount, 2);
  assert.equal(extracted.combo, undefined);
});

test('層が複数の配列(Shiftあり): 統合は合算、層別は層のidごとに分かれる', () => {
  // "aAa": a(単打) + A(右Shift + a) + a(単打)。Shiftの層は右Shiftの押下と a の押下を1回ずつ持つ
  const extracted = extractFor('qwerty', 'aAa');
  assert.deepEqual(entries(extracted.integrated.keyCounts), [['a', 3], ['shift-r', 1]]);
  assert.equal(extracted.integrated.presses, 4);
  assert.equal(extracted.integrated.maxCount, 3);

  assert.deepEqual(extracted.layers.map((layer) => layer.id), ['single', 'layer:Shift']);
  const [single, shift] = extracted.layers;
  assert.deepEqual(entries(single.keyCounts), [['a', 2]]);
  assert.deepEqual(entries(shift.keyCounts), [['a', 1], ['shift-r', 1]]);
  assert.deepEqual(entries(shift.triggerKeyCounts), [['shift-r', 1]]);
  assert.equal(shift.role, 'modifier');
  // 色用の押下数では、層操作として押したShiftを除く
  assert.deepEqual(entries(shift.colorCounts), [['a', 1]]);
  assert.equal(extracted.sharedMaxColorCount, 2);
  // 層の合計は統合と一致する
  assert.equal(single.presses + shift.presses, extracted.integrated.presses);
});

test('層が複数のかな配列: 使わなかった層も宣言順に空の面として残る', () => {
  // 新下駄の "あいがぱ": 単打(あ・い)と中指シフト(が・ぱ)
  const extracted = extractFor('shingeta', 'あいがぱ');
  assert.deepEqual(entries(extracted.integrated.keyCounts), [['d', 2], ['j', 1], ['k', 1], ['o', 1], ['u', 1]]);
  assert.deepEqual(
    extracted.layers.map((layer) => [layer.id, layer.presses]),
    [['single', 2], ['layer:中指シフト', 4], ['layer:薬指シフト', 0], ['layer:拗音1', 0], ['layer:拗音2', 0]],
  );
  const middle = extracted.layers.find((layer) => layer.id === 'layer:中指シフト');
  assert.ok(middle);
  assert.deepEqual(entries(middle.keyCounts), [['d', 2], ['j', 1], ['u', 1]]);
  assert.deepEqual(entries(middle.triggerKeyCounts), [['d', 2]]);
  assert.deepEqual(entries(middle.colorCounts), [['j', 1], ['u', 1]]);
  assert.equal(extracted.sharedMaxColorCount, 1);
});

test('テキストが空なら、すべて0で面の構成だけが残る', () => {
  const extracted = extractFor('qwerty', '');
  assert.equal(extracted.integrated.presses, 0);
  assert.equal(extracted.integrated.maxCount, 0);
  assert.equal(extracted.sharedMaxColorCount, 0);
  assert.deepEqual(extracted.layers.map((layer) => layer.id), ['single', 'layer:Shift']);
});

const key = (id: string, finger: Finger): Key => ({ id, finger, x: 0, y: 0, row: 0, col: 0 });

function syntheticStroke(groupId: string, keys: readonly Key[], triggerKeys: string[], pairedTriggerKeys: string[]): Stroke {
  return {
    index: 0,
    char: 'x',
    inputChar: 'x',
    inputIndex: 0,
    aggregationGroupId: groupId,
    classifications: [],
    triggerKeys,
    pairedTriggerKeys,
    participations: [],
    presses: keys.map((k) => ({ finger: k.finger, keys: [k], target: { x: 0, y: 0 }, gap: 1, distance: 0, sfb: false })),
    distance: 0,
    positions: {} as Stroke['positions'],
  };
}

function syntheticTrace(strokes: Stroke[], layerDefinitions: Trace['layerDefinitions']): Trace {
  return { strokes, skipped: 0, inputChars: strokes.length, comboHits: [], comboDefinitions: 0, layerDefinitions, errors: [] };
}

test('同時押下したトリガーは色用の押下数へ足し戻し、修飾面では足し戻さない', () => {
  const f = key('f', 'LI');
  const j = key('j', 'RI');
  const a = key('a', 'LP');
  const trace = syntheticTrace(
    [
      // 通常の層: j と f を同時に押し、どちらもトリガー。a が出力
      syntheticStroke('layer:L', [j, f, a], ['j', 'f'], ['j', 'f']),
      // 修飾面: 同じ押し方でも足し戻さない
      syntheticStroke('layer:M', [j, f, a], ['j', 'f'], ['j', 'f']),
    ],
    [
      { id: 'single', kind: 'layer', label: '単打' },
      { id: 'layer:L', kind: 'layer', label: 'L', presentationRole: 'layer' },
      { id: 'layer:M', kind: 'layer', label: 'M', presentationRole: 'modifier' },
    ],
  );
  const extracted = computeHeatmapExtraction(trace);
  const byId = new Map(extracted.layers.map((layer) => [layer.id, layer]));
  assert.deepEqual(entries(byId.get('layer:L')!.colorCounts), [['a', 1], ['f', 1], ['j', 1]]);
  assert.deepEqual(entries(byId.get('layer:M')!.colorCounts), [['a', 1]]);
  assert.deepEqual(entries(byId.get('layer:L')!.keyCounts), [['a', 1], ['f', 1], ['j', 1]]);
});

test('コンボ枠は層に含めず別に持つ。押下が無ければ持たない', () => {
  const a = key('a', 'LP');
  const definitions: Trace['layerDefinitions'] = [
    { id: 'single', kind: 'layer', label: '単打' },
    { id: 'combo', kind: 'combo', label: 'コンボ' },
  ];
  const used = computeHeatmapExtraction(syntheticTrace([syntheticStroke('combo', [a], [], [])], definitions));
  assert.deepEqual(used.layers.map((layer) => layer.id), ['single']);
  assert.equal(used.combo?.id, 'combo');
  assert.deepEqual(entries(used.combo!.keyCounts), [['a', 1]]);
  assert.deepEqual(entries(used.integrated.keyCounts), [['a', 1]]);
  assert.equal(used.sharedMaxColorCount, 0);

  const unused = computeHeatmapExtraction(syntheticTrace([syntheticStroke('single', [a], [], [])], definitions));
  assert.equal(unused.combo, undefined);
});

test('定義に無い面のidでも、初出の順で面を作る', () => {
  const a = key('a', 'LP');
  const extracted = computeHeatmapExtraction(
    syntheticTrace([syntheticStroke('layer:未宣言', [a], [], [])], [{ id: 'single', kind: 'layer', label: '単打' }]),
  );
  assert.deepEqual(extracted.layers.map((layer) => layer.id), ['single', 'layer:未宣言']);
  assert.equal(extracted.layers[1].label, 'layer:未宣言');
});

test('Metricsのキー別の集計と一致する', async () => {
  const { computeMetrics } = await import('#interpretation/metrics.ts');
  for (const [layoutId, text] of [['qwerty', 'aAa Hello'], ['shingeta', 'あいがぱきゃ'], ['nicola', 'あいが']] as const) {
    const layout = LAYOUT_BY_ID.get(layoutId)!;
    const trace = generateTrace(text, layout, geometry, DEFAULT_TRACE_POLICY);
    const metrics = computeMetrics(trace, geometry);
    const extracted = computeHeatmapExtraction(trace);
    assert.deepEqual(entries(extracted.integrated.keyCounts), entries(metrics.keyCounts), layoutId);
    for (const stat of metrics.layers) {
      const layer = extracted.layers.find((entry) => entry.id === stat.id);
      assert.ok(layer, `${layoutId}/${stat.id}`);
      assert.deepEqual(entries(layer.keyCounts), entries(stat.keyCounts), `${layoutId}/${stat.id}`);
      assert.deepEqual(entries(layer.triggerKeyCounts), entries(stat.triggerKeyCounts), `${layoutId}/${stat.id}`);
      assert.deepEqual(entries(layer.pairedTriggerKeyCounts), entries(stat.pairedTriggerKeyCounts), `${layoutId}/${stat.id}`);
    }
  }
});
