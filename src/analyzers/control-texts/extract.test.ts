import assert from 'node:assert/strict';
import test from 'node:test';
import { createEngineCache } from '#engine/cache.ts';
import { resolveEngineInput, type ResolvedInput } from '#engine/resolved-input.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import { controlSeeds, meanDeviation } from '#interpretation/control-comparison.ts';
import { shuffledText, uniformText } from '#interpretation/control-texts.ts';
import { CONTROL_COLUMN_IDS, computeComparisonRowValues, type ControlColumnValues } from '../comparison-column-values.ts';
import { computeControlTextsExtraction, controlTextsDefinition, controlTextsWarmup, type ControlTextsOkRow } from './extract.ts';

/**
 * 実文と対照テキストの値が、比較表の列と同じ値になること、平均と母標準偏差が種ごとの値から正しく取られることを、
 * engineの経路（`createEngineCache`）で確かめる。期待値は、対照テキストごとに`Metrics`を作って比較表と同じ関数
 * （`computeComparisonRowValues`）で求めた値から、この抽出を経由せずに集計する。
 */

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

const KANA_TEXT = 'わがはいはねこである。なまえはまだない。どこでうまれたかとんとけんとうがつかぬ。';
const ENGLISH_TEXT = 'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.';

function resolve(layoutId: string, text: string, language: 'ja' | 'en') {
  const target = { kind: 'layout', layoutId } as const;
  const result = resolveEngineInput({
    target,
    setups: new Map(),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text,
    language,
  });
  assert.ok(result.ok);
  if (!result.ok) throw new Error('解決できない');
  return { target, input: result.input };
}

function extractRow(layoutId: string, text: string, language: 'ja' | 'en'): { row: ControlTextsOkRow; input: ResolvedInput } {
  const { target, input } = resolve(layoutId, text, language);
  const cache = createEngineCache();
  const { extracted } = cache.getSetExtraction([{ target, resolution: { ok: true, input } }], controlTextsDefinition, {});
  const row = extracted.rows[0];
  if (row?.kind !== 'ok') throw new Error('値が出ない');
  return { row, input };
}

/** 抽出を通さずに、テキストを測った比較表の列の値。 */
function comparisonValues(input: ResolvedInput, text: string): ControlColumnValues {
  const cache = createEngineCache();
  const changed = { ...input, text };
  const values = computeComparisonRowValues(cache.getInterpretation(changed).metrics, cache.getTrace(changed).trace);
  return Object.fromEntries(CONTROL_COLUMN_IDS.map((id) => [id, values[id]])) as ControlColumnValues;
}

for (const [name, layoutId, text, language] of [
  ['かなのテキスト・ローマ字入力の配列', 'qwerty', KANA_TEXT, 'ja'],
  ['かなのテキスト・かな配列', 'jis-kana', KANA_TEXT, 'ja'],
  ['英語のテキスト', 'qwerty', ENGLISH_TEXT, 'en'],
] as const) {
  test(`対照テキストとの比較: ${name}で、実文は比較表の値と、対照テキストの平均と標準偏差は種ごとの比較表の値の集計と一致する`, () => {
    const { row, input } = extractRow(layoutId, text, language);
    assert.deepEqual(row.actual, comparisonValues(input, input.text));
    const seeds = controlSeeds();
    for (const kind of ['shuffled', 'uniform'] as const) {
      const make = kind === 'shuffled' ? shuffledText : uniformText;
      const samples = seeds.map((seed) => comparisonValues(input, make(input.text, seed).text));
      for (const id of CONTROL_COLUMN_IDS) {
        const expected = meanDeviation(samples.map((sample) => sample[id]));
        assert.equal(row.controls[kind][id].mean, expected.mean, `${kind} ${id} の平均`);
        assert.equal(row.controls[kind][id].deviation, expected.deviation, `${kind} ${id} の標準偏差`);
      }
    }
  });
}

test('対照テキストとの比較: 同じ入力からは同じ値が出る', () => {
  const first = extractRow('qwerty', KANA_TEXT, 'ja').row;
  const second = extractRow('qwerty', KANA_TEXT, 'ja').row;
  assert.deepEqual(second, first);
});

test('対照テキストとの比較: 先に段で求めても、抽出の値は変わらない', () => {
  const { target, input } = resolve('qwerty', KANA_TEXT, 'ja');
  const member = { target, resolution: { ok: true, input } } as const;
  const plain = createEngineCache().getSetExtraction([member], controlTextsDefinition, {}).extracted;
  const cache = createEngineCache();
  for (let step = 0; step < controlTextsWarmup.steps; step++) cache.warmSetMember(member, controlTextsDefinition, step);
  assert.deepEqual(cache.getSetExtraction([member], controlTextsDefinition, {}).extracted, plain);
});

test('対照テキストとの比較: 解決に失敗した対象は失敗として運ぶ', () => {
  const extracted = computeControlTextsExtraction([], [{ target: { kind: 'setup', setupId: 'x' }, kind: 'reference', message: '失敗' }]);
  assert.equal(extracted.rows[0]?.kind, 'failed');
});
