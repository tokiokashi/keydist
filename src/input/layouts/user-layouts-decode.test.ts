import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeUserLayouts, type UserLayout } from './user-layouts.ts';
import { load, loadWithDiagnostics, save, USER_LAYOUTS_STORAGE_KEY } from '#platform/assets/user-layouts-storage.ts';

const layout = (id: string): UserLayout => ({
  id,
  name: `配列 ${id}`,
  rows: ['1234567890', 'qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'],
  romaji: 'kunrei',
});

test('配列でない値は空にして診断を1件積む（nullを含む）', () => {
  for (const value of ['text', { a: 1 }, 3, null]) {
    const result = decodeUserLayouts(value);
    assert.deepEqual(result.value, [], JSON.stringify(value));
    assert.equal(result.diagnostics.length, 1, JSON.stringify(value));
  }
});

test('undefinedは診断なしの空', () => {
  assert.deepEqual(decodeUserLayouts(undefined), { value: [], diagnostics: [] });
});

test('正常な一覧は値が変わらず診断も無い', () => {
  const layouts = [layout('user-a'), { ...layout('user-b'), direct: true, homeKeys: { 'L-index': 'f' } }];
  const result = decodeUserLayouts(structuredClone(layouts));
  assert.deepEqual(result.value, layouts);
  assert.deepEqual(result.diagnostics, []);
});

test('壊れた要素とid重複は捨てて、その数だけ診断を積む', () => {
  const result = decodeUserLayouts([layout('user-a'), { id: 1 }, null, layout('user-a'), layout('user-c')]);
  assert.deepEqual(result.value.map((l) => l.id), ['user-a', 'user-c']);
  assert.deepEqual(result.diagnostics.map((d) => d.path), ['[1]', '[2]', '[3]']);
});

test('storage: 保存が壊れている時は診断付きの空、往復では値が変わらない', () => {
  const values = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    },
  });
  try {
    assert.deepEqual(loadWithDiagnostics(), { value: [], diagnostics: [] });

    const layouts = [layout('user-a')];
    save(layouts);
    assert.deepEqual(load(), layouts);
    assert.deepEqual(loadWithDiagnostics().diagnostics, []);

    values.set(USER_LAYOUTS_STORAGE_KEY, 'null');
    assert.equal(loadWithDiagnostics().diagnostics.length, 1);
    values.set(USER_LAYOUTS_STORAGE_KEY, '{"oops":');
    assert.deepEqual(loadWithDiagnostics().value, []);
    assert.equal(loadWithDiagnostics().diagnostics.length, 1);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
