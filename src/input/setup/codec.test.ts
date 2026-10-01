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

const setupA: Setup = { id: 's-1', number: 1, layoutId: 'qwerty', shapeId: 'row-staggered' };
const setupB: Setup = { id: 's-2', number: 2, layoutId: 'oonishi', shapeId: 'row-staggered', label: 'かな比較用' };

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
  const broken = { id: 's-3', number: 1, layoutId: 'qwerty' }; // shapeId が無い
  const result = codec.decode({ version: 1, setups: [setupA, broken] });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.setups, [setupA]);
    assert.equal(result.diagnostics.length, 1);
    assert.match(result.diagnostics[0].path, /^setups\[1\]/);
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

test('decode: 存在しないSetup idのoverrides.setupは孤児として診断付きで捨てる', () => {
  const result = codec.decode({
    version: 1,
    setups: [setupA],
    overrides: { setup: { 's-1': { windowSize: 4 }, 'ghost-id': { windowSize: 9 } } },
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.overrides, { setup: { 's-1': { windowSize: 4 } } });
    assert.equal(result.diagnostics.length, 1);
    assert.match(result.diagnostics[0].message, /孤児として捨てた/);
    assert.equal(result.diagnostics[0].path, 'overrides.setup.ghost-id');
  }
});

test('decode: Setup要素が壊れて捨てられた場合も、そのidのoverrides.setupを孤児として捨てる', () => {
  const broken = { id: 's-3', number: 1, layoutId: 'qwerty' }; // shapeId が無いため要素ごと捨てられる
  const result = codec.decode({
    version: 1,
    setups: [setupA, broken],
    overrides: { setup: { 's-1': { windowSize: 4 }, 's-3': { windowSize: 9 } } },
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.setups, [setupA]);
    assert.deepEqual(result.value.overrides, { setup: { 's-1': { windowSize: 4 } } });
    // 診断は「Setup要素を捨てた」旨と「孤児のoverridesを捨てた」旨の2件になる。
    assert.equal(result.diagnostics.length, 2);
    assert.ok(result.diagnostics.some((d) => d.message.includes('孤児として捨てた') && d.path === 'overrides.setup.s-3'));
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

test('decode: setupsが配列でない値（文字列・オブジェクト・数値・null）なら診断を1件積んで空にする', () => {
  for (const setups of ['not-an-array', { a: 1 }, 42, null]) {
    const result = codec.decode({ version: 1, setups });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.value.setups, []);
      assert.equal(result.diagnostics.length, 1);
      assert.equal(result.diagnostics[0].path, 'setups');
    }
  }
});

test('decode: setupsが無い（undefined）時は診断を積まない', () => {
  const result = codec.decode({ version: 1 });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.diagnostics, []);
});

test('decode: 番号が無い・不正・重複するSetupには、並びの順で最大＋1を配り、持っている番号は動かさない', () => {
  const result = codec.decode({
    version: 1,
    setups: [
      { id: 'a', layoutId: 'qwerty', shapeId: 'row-staggered' },
      { id: 'b', number: 5, layoutId: 'qwerty', shapeId: 'row-staggered' },
      { id: 'c', number: 'x', layoutId: 'qwerty', shapeId: 'row-staggered' },
      { id: 'd', number: 5, layoutId: 'qwerty', shapeId: 'row-staggered' },
      { id: 'e', number: 2, layoutId: 'qwerty', shapeId: 'row-staggered' },
    ],
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value.setups.map((setup) => [setup.id, setup.number]), [['a', 6], ['b', 5], ['c', 7], ['d', 8], ['e', 2]]);
});
