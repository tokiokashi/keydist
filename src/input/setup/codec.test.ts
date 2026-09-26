import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as v from 'valibot';
import type { ItemSchemaMap } from '#input/settings/index.ts';
import { setupLibraryCodec } from './codec.ts';
import type { Setup } from './types.ts';
import type { SetupLibrary } from './collection.ts';

interface TestValueMap {
  readonly windowSize: number;
}

const testItemSchemas: ItemSchemaMap<TestValueMap> = {
  windowSize: v.pipe(v.number(), v.integer(), v.minValue(1)),
};

const codec = setupLibraryCodec(testItemSchemas, 1);

const setupA: Setup = { id: 's-1', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 };
const setupB: Setup = { id: 's-2', layoutId: 'oonishi', shapeId: 'row-staggered', label: 'かな比較用', colorIndex: 3 };

test('decode: トップレベルがオブジェクトでなければ資産全体をnot-an-objectで失敗させる', () => {
  for (const input of [null, 'x', 42, [], true]) {
    const result = codec.decode(input);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason.kind, 'not-an-object');
  }
});

test('decode: setupsが配列でなければ空扱いにする（寛容。payload自体は不正扱いにしない）', () => {
  const result = codec.decode({ version: 1, setups: 'not-an-array' });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value.setups, []);
});

test('decode: setups/overridesが無ければ空の手持ちとして読む', () => {
  const result = codec.decode({ version: 1 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, { setups: [], overrides: {} });
    assert.deepEqual(result.diagnostics, []);
  }
});

test('decode: 妥当なSetupの配列と上書きをそのまま読める', () => {
  const raw = {
    version: 1,
    setups: [setupA, setupB],
    overrides: { setup: { 's-1': { windowSize: 4 } } },
  };
  const result = codec.decode(raw);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.setups, [setupA, setupB]);
    assert.deepEqual(result.value.overrides, { setup: { 's-1': { windowSize: 4 } } });
    assert.deepEqual(result.diagnostics, []);
  }
});

test('decode: id/layoutId/shapeIdを欠くSetupは要素ごと捨てて診断を積む（他は残す）', () => {
  const broken = { id: 's-3', layoutId: 'qwerty' }; // shapeId が無い
  const result = codec.decode({ version: 1, setups: [setupA, broken] });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.setups, [setupA]);
    assert.equal(result.diagnostics.length, 1);
    assert.match(result.diagnostics[0].path, /^setups\[1\]/);
  }
});

test('decode: colorIndexが壊れていてもSetup自体は残り、既定色(0)へ静かに戻る（診断なし）', () => {
  const broken: Record<string, unknown> = { id: 's-4', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: -1 };
  const result = codec.decode({ version: 1, setups: [broken] });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.setups, [{ id: 's-4', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 }]);
    assert.deepEqual(result.diagnostics, []);
  }
});

test('decode: idが重複するSetupは後のものを捨てて診断を積む', () => {
  const duplicate: Setup = { ...setupA, shapeId: 'different-shape' };
  const result = codec.decode({ version: 1, setups: [setupA, duplicate] });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.setups, [setupA]);
    assert.equal(result.diagnostics.length, 1);
    assert.match(result.diagnostics[0].message, /重複/);
  }
});

test('encode→decode: 往復で同じ手持ちに戻る（roundtrip）', () => {
  const library: SetupLibrary<TestValueMap> = {
    setups: [setupA, setupB],
    overrides: { global: { windowSize: 5 }, setup: { 's-2': { windowSize: 2 } } },
  };
  const decoded = codec.decode(codec.encode(library));
  assert.equal(decoded.ok, true);
  if (decoded.ok) {
    assert.deepEqual(decoded.value, library);
    assert.deepEqual(decoded.diagnostics, []);
  }
});
