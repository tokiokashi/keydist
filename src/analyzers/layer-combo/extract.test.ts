import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { fromRows, type Layout } from '#input/layouts/types.ts';
import { checkOptionsDiscipline } from '#analyzers/options.ts';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { computeLayerComboExtraction, layerComboDefinition } from './extract.ts';
import { DEFAULT_LAYER_COMBO_OPTIONS, layerComboOptions } from './options.ts';
import { attributionShare } from './share.ts';

/**
 * レイヤーとコンボの内訳の抽出（帰属先ごとの押下数）。期待値は、打つ文字から手で数えられる小さいテキストで固定する。
 * 物理配列はrow-staggered、`DEFAULT_TRACE_POLICY`。
 */

const geometry = buildGeometry('row-staggered');

/** 単打のレイヤーだけを持つ配列（Shiftのレイヤーを作らない）。 */
const SINGLE_LAYER_LAYOUT = fromRows('single-layer', '単層', ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./']);

function extractFor(layoutId: string, text: string) {
  const layout: Layout | undefined = layoutId === SINGLE_LAYER_LAYOUT.id ? SINGLE_LAYER_LAYOUT : LAYOUT_BY_ID.get(layoutId);
  assert.ok(layout, layoutId);
  const trace = generateTrace(text, layout, geometry, DEFAULT_TRACE_POLICY);
  assert.equal(trace.skipped, 0);
  const metrics = computeMetrics(trace, geometry);
  return { extracted: computeLayerComboExtraction({ trace, metrics }), metrics };
}

const pairs = (rows: readonly { readonly id: string; readonly presses: number }[]) => rows.map((row) => [row.id, row.presses]);

test('レイヤーが1つの配列: 唯一のレイヤーが全押下を持つ', () => {
  const { extracted } = extractFor('single-layer', 'aaq');
  assert.equal(extracted.presses, 3);
  assert.deepEqual(extracted.rows.map((row) => [row.id, row.kind, row.presses]), [['single', 'layer', 3]]);
});

test('Shiftのレイヤーを持つ配列: "aAa" は単打2、Shift2。Shiftのレイヤーは修飾', () => {
  // A は右Shiftとaの2押下をShiftのレイヤーへ数える
  const { extracted } = extractFor('qwerty', 'aAa');
  assert.equal(extracted.presses, 4);
  assert.deepEqual(pairs(extracted.rows), [['single', 2], ['layer:Shift', 2]]);
  assert.equal(extracted.rows[1]!.role, 'modifier');
  assert.equal(extracted.rows[1]!.label, 'Shift');
});

test('レイヤーが複数のかな配列: 使わなかったレイヤーも宣言順に0で残る', () => {
  // 新下駄の "あいがぱ": 単打(あ・い)と中指シフト(が・ぱ)
  const { extracted } = extractFor('shingeta', 'あいがぱ');
  assert.equal(extracted.presses, 6);
  assert.deepEqual(
    pairs(extracted.rows),
    [['single', 2], ['layer:中指シフト', 4], ['layer:薬指シフト', 0], ['layer:拗音1', 0], ['layer:拗音2', 0]],
  );
});

test('コンボ枠は末尾に1行。押下が無くても、配列がコンボを持つなら行は残る', () => {
  // 新小梅の「ぴ」はgとuの同時押しのコンボ
  const used = extractFor('shin-koume', 'ぴ').extracted;
  assert.deepEqual(used.rows.at(-1), { id: 'combo', label: 'コンボ', kind: 'combo', role: undefined, presses: 2 });
  assert.equal(used.rows.filter((row) => row.kind === 'combo').length, 1);
  assert.equal(used.presses, 2);

  const unused = extractFor('shin-koume', 'あ').extracted;
  assert.deepEqual(unused.rows.at(-1), { id: 'combo', label: 'コンボ', kind: 'combo', role: undefined, presses: 0 });
});

test('コンボを持たない配列には、コンボ枠の行が無い', () => {
  assert.equal(extractFor('qwerty', 'aAa').extracted.rows.some((row) => row.kind === 'combo'), false);
  assert.equal(extractFor('nicola', 'あ').extracted.rows.some((row) => row.kind === 'combo'), false);
});

test('テキストが空なら、押下数はすべて0でレイヤーの構成だけが残る', () => {
  const { extracted } = extractFor('qwerty', '');
  assert.equal(extracted.presses, 0);
  assert.deepEqual(pairs(extracted.rows), [['single', 0], ['layer:Shift', 0]]);
});

test('割合は全体に対する百分率。全体が0なら0.0%', () => {
  assert.equal(attributionShare(1, 4), '25.0%');
  assert.equal(attributionShare(2, 3), '66.7%');
  assert.equal(attributionShare(0, 0), '0.0%');
});

test('宣言と、抽出に効く設定の入れ忘れが無い', () => {
  assert.deepEqual(Object.keys(layerComboOptions.items), []);
  assert.deepEqual(
    checkOptionsDiscipline(layerComboOptions, layerComboDefinition.optionsDiscipline),
    { keyViolations: [], viewExtractionViolations: [] },
  );
  assert.deepEqual(DEFAULT_LAYER_COMBO_OPTIONS, {});
});
