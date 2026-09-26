import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalize, stableStringify } from './cache-key.ts';

test('オブジェクトのキー順に依存しない', () => {
  const a = stableStringify({ x: 1, y: 2 });
  const b = stableStringify({ y: 2, x: 1 });
  assert.equal(a, b);
});

test('ネストしたオブジェクト・配列のキー順にも依存しない', () => {
  const a = stableStringify({ outer: { b: 2, a: 1 }, list: [{ q: 1, p: 2 }] });
  const b = stableStringify({ list: [{ p: 2, q: 1 }], outer: { a: 1, b: 2 } });
  assert.equal(a, b);
});

test('配列の要素順は意味を持つので変えると別のキーになる', () => {
  const a = stableStringify([1, 2, 3]);
  const b = stableStringify([3, 2, 1]);
  assert.notEqual(a, b);
});

test('内容が違えば別のキーになる', () => {
  assert.notEqual(stableStringify({ a: 1 }), stableStringify({ a: 2 }));
});

test('Mapは挿入順に依存せず、キーで並べ替えて正規化する', () => {
  const a = new Map([['b', 2], ['a', 1]]);
  const b = new Map([['a', 1], ['b', 2]]);
  assert.equal(stableStringify(a), stableStringify(b));
});

test('Mapのキーがオブジェクトでも正規化できる（Layout.faceLayerIds相当）', () => {
  const keyA = { trigger: ['x'], mode: 'prefix' };
  const keyB = { trigger: ['y'], mode: 'suffix' };
  const a = new Map([[keyB, 'layer-b'], [keyA, 'layer-a']]);
  const b = new Map([[keyA, 'layer-a'], [keyB, 'layer-b']]);
  assert.equal(stableStringify(a), stableStringify(b));
});

test('Setは要素順に依存せず正規化する', () => {
  const a = new Set(['x', 'y', 'z']);
  const b = new Set(['z', 'x', 'y']);
  assert.equal(stableStringify(a), stableStringify(b));
});

test('undefinedのプロパティはJSON.stringifyと同じく省略される', () => {
  const withUndefined = stableStringify({ a: 1, b: undefined });
  const without = stableStringify({ a: 1 });
  assert.equal(withUndefined, without);
});

test('canonicalizeはMap/SetをJSON化できる形（オブジェクト・配列のみ）へ変換する', () => {
  const result = canonicalize(new Map([['a', 1]]));
  assert.equal(JSON.stringify(result), JSON.stringify({ $map: [['a', 1]] }));
});
