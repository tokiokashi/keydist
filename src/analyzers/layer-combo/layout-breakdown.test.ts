import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID, LAYOUTS, LAYOUTS_JA } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import { sampleText } from '#input/text/samples.ts';
import type { Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { resolveEngineInput, type ResolvedInput } from '#engine/resolved-input.ts';
import { generateTrace } from '#trace/generate.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { computeLayerComboExtraction } from './extract.ts';
import { comboDiagramItems, comboRows, modifierRows } from './layout-breakdown.ts';

/**
 * 配列の定義から出す修飾・コンボ表・コンボの配列図と、帰属先の保存則を、実際のengine経路
 * （解決 → Trace → Metrics）で検証する。物理配列はrow-staggered。テキストは組み込みのサンプル
 * （日本語は `legacy`、英文は `default`）。
 */

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

function tryResolve(layoutId: string, language: 'ja' | 'en', text: string) {
  const setup: Setup = { id: 'setup-layer-combo', number: 1, layoutId, shapeId: 'row-staggered' };
  return resolveEngineInput({
    target: { kind: 'setup', setupId: setup.id },
    setups: new Map([[setup.id, setup]]),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text,
    language,
  });
}

function measureInput(input: ResolvedInput) {
  const trace = generateTrace(input.text, input.layout, input.geometry, input.tracePolicy);
  const metrics = computeMetrics(trace, input.geometry);
  return { input, trace, metrics, extracted: computeLayerComboExtraction({ trace, metrics }) };
}

function measure(layoutId: string, language: 'ja' | 'en') {
  const result = tryResolve(layoutId, language, sampleText(language, language === 'ja' ? 'legacy' : 'default'));
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error));
  if (!result.ok) throw new Error('unreachable');
  return measureInput(result.input);
}

test('帰属先ごとの押下数の和は、全配列・日本語と英文のどちらでも全押下数に一致する', () => {
  const ids = [...new Set([...LAYOUTS, ...LAYOUTS_JA].map((layout) => layout.id))];
  let measured = 0;
  for (const id of ids) {
    for (const language of ['ja', 'en'] as const) {
      const result = tryResolve(id, language, sampleText(language, language === 'ja' ? 'legacy' : 'default'));
      // その言語のテキストを打てない配列は、エンジンが対象から外す
      if (!result.ok) {
        assert.equal(result.error.kind, 'incompatible-text', `${id}/${language}`);
        continue;
      }
      const { extracted, metrics } = measureInput(result.input);
      const sum = extracted.rows.reduce((total, row) => total + row.presses, 0);
      assert.equal(sum, metrics.presses, `${id}/${language}`);
      assert.equal(extracted.presses, metrics.presses, `${id}/${language}`);
      assert.ok(metrics.presses > 0, `${id}/${language}`);
      measured++;
    }
  }
  assert.ok(measured >= ids.length, `測れた組が少ない: ${measured}`);
});

test('コンボ表のコンボ定義の行数は、Traceのコンボ定義数と一致する。英文ではローマ字のコンボが外れる', () => {
  const ja = measure('oonishi-custom', 'ja');
  assert.equal(ja.trace.comboDefinitions, 73);
  assert.equal(comboRows(ja.input.layout, undefined).length, ja.trace.comboDefinitions);
  assert.deepEqual(ja.extracted.rows.map((row) => row.kind), ['layer', 'layer', 'combo']);

  const en = measure('oonishi-custom', 'en');
  assert.equal(en.trace.comboDefinitions, 0);
  assert.equal(comboRows(en.input.layout, undefined).length, 0);
  assert.equal(comboDiagramItems(en.input.layout, undefined).length, 0);
  assert.deepEqual(en.extracted.rows.map((row) => row.kind), ['layer', 'layer']);
});

test('コンボ定義の配列図は、同じ組・同じ押し方のコンボを1枚にまとめる', () => {
  const { input } = measure('oonishi-custom', 'ja');
  const items = comboDiagramItems(input.layout, undefined);
  assert.equal(items.length, 11);
  const first = comboRows(input.layout, undefined)[0]!;
  assert.deepEqual(first, { trigger: '語彙拡張: d + s + t', output: 'desita' });
  // 図に載るのは、トリガーと押す先のキーが決まっているコンボだけ。表は73件すべてを載せる
  assert.equal(items.reduce((total, item) => total + item.outputs.size, 0), 41);
});

test('コンボ枠に計上すると宣言された面は、面ごとに表の1行と図の1枚になる。層に計上する面は載らない', () => {
  const { input, trace } = measure('kawasemi-plus', 'ja');
  assert.equal(comboRows(input.layout, undefined).length, 45);
  assert.equal(comboDiagramItems(input.layout, undefined).length, 45);
  // 左手コンボ拡張は、行指定キーの面（層）とは別の面として載る
  assert.deepEqual(comboRows(input.layout, undefined)[0], { trigger: 'し', output: 'こと / する' });
  // コンボ枠の見出しの数は、面の数ではなく使える出力の数
  assert.ok(trace.comboDefinitions > comboRows(input.layout, undefined).length);

  const koume = measure('shin-koume', 'ja');
  assert.equal(koume.trace.comboDefinitions, 0);
  assert.deepEqual(comboRows(koume.input.layout, undefined), []);
  assert.deepEqual(comboDiagramItems(koume.input.layout, undefined), []);
});

test('コンボも修飾も持たない配列では、どちらも空', () => {
  const { input } = measure('nicola', 'ja');
  assert.deepEqual(modifierRows(input.layout), []);
  assert.deepEqual(comboRows(input.layout, undefined), []);
  assert.deepEqual(comboDiagramItems(input.layout, undefined), []);
});

test('修飾のレイヤー: 表示区分が修飾のレイヤーだけが、押し方と出る文字つきで並ぶ', () => {
  const qwerty = modifierRows(measure('qwerty', 'en').input.layout);
  assert.deepEqual(qwerty.map((row) => [row.id, row.label, row.trigger]), [['layer:Shift', 'Shift', 'Shift']]);
  assert.ok(qwerty[0]!.outputs.startsWith('! / @ / #'));

  const naginata = modifierRows(measure('naginata-v18', 'ja').input.layout);
  const dakuon = naginata.find((row) => row.id === 'layer:濁音');
  assert.ok(dakuon);
  assert.equal(dakuon.trigger, 'あ / か');
  // 同じ文字は1度だけ並ぶ
  const outputs = dakuon.outputs.split(' / ');
  assert.equal(new Set(outputs).size, outputs.length);
  // 単打・SandSなど、修飾でないレイヤーは載らない
  assert.equal(naginata.some((row) => row.id === 'single' || row.id === 'layer:SandS'), false);
});
