import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { fromRows, type Layout } from '#input/layouts/types.ts';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { computeKeyDetails } from '#interpretation/key-detail.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { computeHeatmapExtraction } from './extract.ts';
import { DEFAULT_HEATMAP_OPTIONS } from './options.ts';

/**
 * ヒートマップの抽出（キー × 層の押下数）。期待値は、打つ文字から手で数えられる小さいテキストで固定する。
 */

const geometry = buildGeometry('row-staggered');

/** 単打の層だけを持つ配列（Shiftの層を作らない）。 */
const SINGLE_LAYER_LAYOUT = fromRows('single-layer', '単層', ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./']);

function extractFor(layoutId: string, text: string) {
  const layout: Layout | undefined = layoutId === SINGLE_LAYER_LAYOUT.id ? SINGLE_LAYER_LAYOUT : LAYOUT_BY_ID.get(layoutId);
  assert.ok(layout, layoutId);
  const trace = generateTrace(text, layout, geometry, DEFAULT_TRACE_POLICY);
  assert.equal(trace.skipped, 0);
  return computeHeatmapExtraction({ trace, metrics: computeMetrics(trace, geometry), keyDetails: computeKeyDetails(trace, geometry), options: DEFAULT_HEATMAP_OPTIONS });
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
  assert.equal(extracted.combo, undefined);
});

test('層が複数の配列(Shiftあり): 統合は合算、層別は層のidごとに分かれる', () => {
  // "aAa": a(単打) + A(右Shift + a) + a(単打)。Shiftの層は右Shiftとaの押下を1回ずつ持つ
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
  // 層の合計は統合と一致する
  assert.equal(single.presses + shift.presses, extracted.integrated.presses);
});

test('層が複数のかな配列: 使わなかった層も宣言順に空の層として残る', () => {
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
});

test('テキストが空なら、すべて0で層の構成だけが残る', () => {
  const extracted = extractFor('qwerty', '');
  assert.equal(extracted.integrated.presses, 0);
  assert.equal(extracted.integrated.maxCount, 0);
  assert.deepEqual(extracted.layers.map((layer) => layer.id), ['single', 'layer:Shift']);
});


test('同時押下したトリガーは、通常の層では色用の押下数へ足し戻す', () => {
  // 新下駄の「れ」は中指シフト(k)を押してdを打つ。kはトリガーかつ同時押下のトリガー
  const extracted = extractFor('shingeta', 'れ');
  const layer = extracted.layers.find((entry) => entry.id === 'layer:中指シフト');
  assert.ok(layer);
  assert.equal(layer.role, 'layer');
  assert.deepEqual(entries(layer.keyCounts), [['d', 1], ['k', 1]]);
  assert.deepEqual(entries(layer.triggerKeyCounts), [['k', 1]]);
  assert.deepEqual(entries(layer.pairedTriggerKeyCounts), [['k', 1]]);
  assert.deepEqual(entries(layer.colorCounts), [['d', 1], ['k', 1]]);
});

test('同時押下したトリガーは、修飾の層では足し戻さない', () => {
  // 薙刀式の「が」は濁音の層。jがトリガーかつ同時押下のトリガーだが、修飾の層なので色には戻さない
  const extracted = extractFor('naginata-v18', 'が');
  const layer = extracted.layers.find((entry) => entry.id === 'layer:濁音');
  assert.ok(layer);
  assert.equal(layer.role, 'modifier');
  assert.deepEqual(entries(layer.keyCounts), [['f', 1], ['j', 1]]);
  assert.deepEqual(entries(layer.triggerKeyCounts), [['j', 1]]);
  assert.deepEqual(entries(layer.pairedTriggerKeyCounts), [['j', 1]]);
  assert.deepEqual(entries(layer.colorCounts), [['f', 1]]);
});

test('コンボ枠は層に含めず別に持つ。押下が無ければ持たない', () => {
  // かわせみ配列+の「あい」はlと;の同時押しのコンボ
  const used = extractFor('kawasemi-plus', 'あい');
  assert.equal(used.combo?.id, 'combo');
  assert.deepEqual(entries(used.combo!.keyCounts), [[';', 1], ['l', 1]]);
  assert.equal(used.combo!.presses, 2);
  assert.equal(used.layers.some((layer) => layer.id === 'combo'), false);
  assert.deepEqual(entries(used.integrated.keyCounts), [[';', 1], ['l', 1]]);

  const unused = extractFor('kawasemi-plus', 'あ');
  assert.equal(unused.combo, undefined);
});

test('層に計上すると宣言された文字キーの同時押しは、層の図に載りコンボ枠には載らない', () => {
  // 新小梅の「ぴ」はgとuの同時押し
  const koume = extractFor('shin-koume', 'ぴ');
  assert.equal(koume.combo, undefined);
  const layer = koume.layers.find((entry) => entry.id !== 'single' && entry.keyCounts.size > 0);
  assert.ok(layer);
  assert.deepEqual(entries(layer.keyCounts), [['g', 1], ['u', 1]]);
  assert.deepEqual(entries(layer.triggerKeyCounts), [['g', 1]]);
});

test('かわせみ配列+の行指定キーの層は、見出しに作者の呼び名が付く', () => {
  const extracted = extractFor('kawasemi-plus', 'く');
  const layer = extracted.layers.find((entry) => entry.label === 'か行');
  assert.ok(layer);
  assert.equal(layer.presses, 2);
});
