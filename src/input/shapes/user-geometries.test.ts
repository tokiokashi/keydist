import assert from 'node:assert/strict';
import test from 'node:test';
import { PHYSICAL_SHAPES } from './geometry.ts';
import { load, loadWithDiagnostics, save } from '#platform/assets/user-geometries-storage.ts';
import { decodeUserGeometryShapes } from './user-geometries.ts';

function fakeStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    clear: () => { values.clear(); },
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

test('名前付きカスタム物理配列を複数保存・復元できる', () => {
  const storage = fakeStorage();
  const first = {
    ...structuredClone(PHYSICAL_SHAPES['row-staggered']),
    id: 'shape-first',
    name: '手元の60%',
    rowStagger: [0, 0.4, 0.8, 1.1],
  };
  const second = {
    ...structuredClone(PHYSICAL_SHAPES.ortholinear),
    id: 'shape-second',
    name: '直交配列',
  };

  save([first, second], storage);
  const restored = load(storage);
  assert.deepEqual(restored, [first, second]);
});

test('保存データの無効な物理配列idは除外する', () => {
  const storage = fakeStorage();
  storage.setItem('keydist:geometry-shapes', JSON.stringify([
    { ...PHYSICAL_SHAPES['row-staggered'], id: 'row-staggered', name: '組み込みの偽装' },
    { ...PHYSICAL_SHAPES['row-staggered'], id: 'shape-valid', name: '有効' },
  ]));

  assert.deepEqual(load(storage).map((shape) => shape.id), ['shape-valid']);
});


test('名前付きカスタム物理配列のextraKeysを保存・復元できる', () => {
  const storage = fakeStorage();
  const custom = {
    ...structuredClone(PHYSICAL_SHAPES['row-staggered']),
    id: 'shape-extra-keys',
    name: '周辺キー付き',
    extraKeys: [
      { id: 'tab', row: 1, col: -1, x: -1, y: 1, width: 1.5 },
      { id: 'escape', row: 0, col: -1, x: -1, y: 0 },
    ],
  };

  save([custom], storage);
  const restored = load(storage);

  assert.equal(restored.length, 1);
  assert.deepEqual(restored[0]?.extraKeys, custom.extraKeys);
});

test('配列でない保存は空にして診断を1件積む（nullを含む）', () => {
  for (const value of ['text', { a: 1 }, 3, null]) {
    const result = decodeUserGeometryShapes(value);
    assert.deepEqual(result.value, [], JSON.stringify(value));
    assert.equal(result.diagnostics.length, 1, JSON.stringify(value));
  }
  assert.deepEqual(decodeUserGeometryShapes(undefined), { value: [], diagnostics: [] });
});

test('壊れた要素は捨てた数だけ診断を積み、正常な要素は診断なしで読む', () => {
  const valid = { ...structuredClone(PHYSICAL_SHAPES['row-staggered']), id: 'shape-valid', name: '有効' };
  const result = decodeUserGeometryShapes([valid, { id: 'row-staggered' }, 7]);
  assert.deepEqual(result.value.map((shape) => shape.id), ['shape-valid']);
  assert.deepEqual(result.diagnostics.map((d) => d.path), ['[1]', '[2]']);
  assert.deepEqual(decodeUserGeometryShapes([valid]).diagnostics, []);
});

test('storage: 保存が無ければ診断なし、壊れていれば診断付きの空', () => {
  const storage = fakeStorage();
  assert.deepEqual(loadWithDiagnostics(storage), { value: [], diagnostics: [] });
  storage.setItem('keydist:geometry-shapes', 'null');
  assert.equal(loadWithDiagnostics(storage).diagnostics.length, 1);
  storage.setItem('keydist:geometry-shapes', '{"oops":');
  assert.equal(loadWithDiagnostics(storage).diagnostics.length, 1);
  assert.deepEqual(load(storage), []);
});
