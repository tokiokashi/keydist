import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '../shapes/geometry.ts';
import { generateTrace } from '../../trace/generate.ts';
import { computeMetrics } from '../../interpretation/metrics.ts';
import { compileFaceSemanticInputs } from '../semantics/index.ts';
import { displayTriggerKeys, layerDefinitionsWithLabels } from './layers.ts';
import { faceFromEntries, fromFaces, type Face } from './types.ts';

const geometry = buildGeometry('row-staggered');
const opts = { windowSize: 3, sfbHomeCost: true };

const base: Face = {
  ...faceFromEntries([], 'simultaneous', { k: 'ひ', l: 'み', a: 'あ' }),
  inputRole: 'layer',
};
/** 前置j、出力キー、後置suffixの3打の面 */
const threeStroke = (suffix: string, outputs: Record<string, string>): Face => ({
  ...faceFromEntries(['j'], 'prefix', outputs),
  suffixTrigger: [suffix],
  inputRole: 'layer',
  triggerPersistence: 'single',
});
const twoStroke: Face = {
  ...faceFromEntries(['j'], 'prefix', { a: 'ぁ' }),
  inputRole: 'layer',
  triggerPersistence: 'single',
};
const layout = () => fromFaces('three-stroke', '3打の面', [base, twoStroke, threeStroke('e', { k: 'ひゃ', l: 'みゃ' }), threeStroke('s', { k: 'ひょ' })]);

const keysOf = (stroke: { presses: { keys: { id: string }[] }[] }) => stroke.presses.flatMap((press) => press.keys.map((key) => key.id)).sort();

test('3打の面の入力は、前置・出力キー・後置の順序の順次打鍵になる', () => {
  const alternative = layout().canonicalInputs.get('ひゃ')![0]!;
  assert.deepEqual(
    alternative.baseRealizations.map((realization) => realization.actions),
    [[['j'], ['k'], ['e']]],
  );
  const [input] = alternative.semanticInputs;
  assert.deepEqual(input.physicalKeys, ['e', 'j', 'k']);
  assert.deepEqual(input.requirements, [
    { kind: 'order', before: ['j'], after: ['k'] },
    { kind: 'order', before: ['k'], after: ['e'] },
  ]);
});

test('「ひゃ」は3打で打たれ、skippedにならない', () => {
  const trace = generateTrace('ひゃ', layout(), geometry, opts);
  assert.equal(trace.skipped, 0);
  assert.deepEqual(trace.strokes.map(keysOf), [['j'], ['k'], ['e']]);
  assert.deepEqual(
    trace.strokes.map((stroke) => stroke.triggerKeys),
    [['j'], [], ['e']],
  );
});

test('3打は、その面の1つの層に計上され、コンボ枠とコンボ命中数に入らない', () => {
  const l = layout();
  const trace = generateTrace('ひゃ', l, geometry, opts);
  const groups = new Set(trace.strokes.map((stroke) => stroke.aggregationGroupId));
  assert.equal(groups.size, 1);
  const metrics = computeMetrics(trace, geometry);
  assert.equal(metrics.comboPresses, 0);
  assert.equal(metrics.combos.definitions, 0);
  assert.equal(metrics.combos.hits, 0);
  const [layerId] = groups;
  const stat = metrics.layers.find((layer) => layer.id === layerId)!;
  assert.equal(stat.presses, 3);
  assert.equal(stat.triggerKeyCounts.get('j'), 1);
  assert.equal(stat.triggerKeyCounts.get('e'), 1);
});

test('後置triggerが違う面は別の層になり、層の入力方式に前置と後置の両方が出る', () => {
  const l = layout();
  const e = generateTrace('ひゃ', l, geometry, opts).strokes[0]!.aggregationGroupId;
  const s = generateTrace('ひょ', l, geometry, opts).strokes[0]!.aggregationGroupId;
  assert.notEqual(e, s);
  const definitions = layerDefinitionsWithLabels(l);
  assert.equal(definitions.find((definition) => definition.id === e)?.presentationModeLabel, '前置・後置');
  assert.equal(definitions.find((definition) => definition.id === 'face:1')?.presentationModeLabel, '前置');
});

test('トリガーの表示は前置と後置の両方を含む', () => {
  assert.deepEqual([...displayTriggerKeys(threeStroke('e', { k: 'ひゃ' }))].sort(), ['e', 'j']);
});

test('2打の面と3打の面は、同じ前置triggerでも別の層に分かれる（例外にならない）', () => {
  const l = layout();
  const two = generateTrace('ぁ', l, geometry, opts).strokes[0]!.aggregationGroupId;
  const three = generateTrace('ひゃ', l, geometry, opts).strokes[0]!.aggregationGroupId;
  assert.notEqual(two, three);
});

test('順序が違う同じ3キーの面は、両立しないので共存できる', () => {
  const reversed: Face = {
    ...faceFromEntries(['j', 'e'], 'prefix', { k: 'ひゅ' }),
    inputRole: 'layer',
    triggerPersistence: 'single',
  };
  assert.doesNotThrow(() => compileFaceSemanticInputs([base, threeStroke('e', { k: 'ひゃ' }), reversed]));
});

test('同じ打鍵が別の層に別の出力で出る時は、これまでどおり例外になる', () => {
  const same = (output: string): Face => threeStroke('e', { k: output });
  assert.throws(() => compileFaceSemanticInputs([base, same('ひゃ'), same('ひゅ')]), /同一physical operationに異なるoutput/);
  const a: Face = { ...same('ひゃ'), layer: 'x' };
  const b: Face = { ...same('ひゃ'), layer: 'y' };
  assert.throws(() => compileFaceSemanticInputs([base, a, b]), /異なるaggregationGroupId/);
});

test('suffixTriggerの条件を満たさない面は定義時に例外になる', () => {
  const build = (patch: Partial<Face>) => () => fromFaces('x', 'x', [base, { ...threeStroke('e', { k: 'ひゃ' }), ...patch }]);
  assert.throws(build({ mode: 'simultaneous' }), /mode=prefix/);
  assert.throws(build({ suffixTrigger: [] }), /1キー以上/);
  assert.throws(build({ suffixTrigger: ['j'] }), /重ならない/);
  assert.throws(build({ triggerPersistence: 'hold-capable' }), /single/);
  assert.throws(build({ inputRole: 'modifier' }), /modifier/);
  assert.throws(build({ inputRole: 'composition', compositionAggregation: 'combo' }), /layer/);
  assert.throws(build({ trigger: [] }), /前置trigger/);
});

test('suffixTriggerを持つcompositionの面は、層に計上される', () => {
  const composition: Face = {
    ...threeStroke('e', { k: 'ひゃ' }),
    inputRole: 'composition',
    compositionAggregation: 'layer',
  };
  const l = fromFaces('c', 'c', [base, composition]);
  const trace = generateTrace('ひゃ', l, geometry, opts);
  assert.notEqual(trace.strokes[0]!.aggregationGroupId, 'combo');
  assert.equal(computeMetrics(trace, geometry).comboPresses, 0);
});

test('後置triggerの集合が違う面は、同じlayerへ畳めない', () => {
  const a: Face = { ...threeStroke('e', { k: 'ひゃ' }), layer: 'x' };
  const b: Face = {
    ...faceFromEntries(['f'], 'prefix', { l: 'みゃ' }),
    suffixTrigger: ['s'],
    inputRole: 'layer',
    triggerPersistence: 'single',
    layer: 'x',
  };
  assert.throws(() => fromFaces('x', 'x', [base, a, b]), /後置trigger/);
});

test('後置triggerが違うcompositionの面は、前置triggerが同じでも2枚置け、後置も同じなら例外になる', () => {
  const composition = (suffix: string, key: string, output: string): Face => ({
    ...threeStroke(suffix, { [key]: output }),
    inputRole: 'composition',
    compositionAggregation: 'layer',
  });
  assert.doesNotThrow(() => fromFaces('c', 'c', [base, composition('e', 'k', 'ひゃ'), composition('s', 'k', 'ひょ')]));
  assert.throws(() => fromFaces('c', 'c', [base, composition('e', 'k', 'ひゃ'), composition('e', 'l', 'みゃ')]), /2枚以上/);
});
