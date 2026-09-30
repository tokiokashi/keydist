import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addPreset,
  appendImportedPresets,
  deletePreset,
  emptyPresetLibrary,
  renamePreset,
  uniquePresetName,
  type PresetLibrary,
} from './index.ts';

type V = { readonly a: number; readonly b: boolean };

let next = 0;
const generateId = () => `preset-${++next}`;

test('addPreset: 名前を整えて複製した値を末尾へ足す。元の値とは参照を共有しない', () => {
  const values = { a: 5 };
  const library = addPreset<V>(emptyPresetLibrary(), '  厳しめ  ', values, generateId);
  assert.ok(library);
  assert.equal(library.presets.length, 1);
  assert.equal(library.presets[0].name, '厳しめ');
  assert.deepEqual(library.presets[0].values, { a: 5 });
  assert.notEqual(library.presets[0].values, values);
});

test('addPreset: 上書きが無い（undefined）なら空の値のプリセットになる。名前が空なら拒否', () => {
  const library = addPreset<V>(emptyPresetLibrary(), '空', undefined, generateId);
  assert.deepEqual(library?.presets[0].values, {});
  assert.equal(addPreset<V>(emptyPresetLibrary(), '   ', { a: 1 }, generateId), undefined);
});

test('addPreset: 同名でも足せる（識別はid）', () => {
  const one = addPreset<V>(emptyPresetLibrary(), 'A', {}, generateId);
  assert.ok(one);
  const two = addPreset<V>(one, 'A', {}, generateId);
  assert.equal(two?.presets.length, 2);
  assert.notEqual(two?.presets[0].id, two?.presets[1].id);
});

test('renamePreset: 名前を変える。同じ名前・存在しないidは同一参照、空は拒否', () => {
  const library = addPreset<V>(emptyPresetLibrary(), 'A', { a: 1 }, generateId);
  assert.ok(library);
  const id = library.presets[0].id;
  const renamed = renamePreset(library, id, ' B ');
  assert.equal(renamed?.presets[0].name, 'B');
  assert.deepEqual(renamed?.presets[0].values, { a: 1 });
  assert.equal(renamePreset(library, id, 'A'), library);
  assert.equal(renamePreset(library, 'none', 'X'), library);
  assert.equal(renamePreset(library, id, '  '), undefined);
});

test('deletePreset: 消す。存在しないidは同一参照', () => {
  const library = addPreset<V>(emptyPresetLibrary(), 'A', {}, generateId);
  assert.ok(library);
  assert.deepEqual(deletePreset(library, library.presets[0].id).presets, []);
  assert.equal(deletePreset(library, 'none'), library);
});

test('uniquePresetName: 使われていなければそのまま、使われていれば番号を付ける', () => {
  assert.equal(uniquePresetName(new Set(), '名前'), '名前');
  assert.equal(uniquePresetName(new Set(['名前']), '名前'), '名前 2');
  assert.equal(uniquePresetName(new Set(['名前', '名前 2']), '名前'), '名前 3');
});

test('appendImportedPresets: 新しいidで足し、同名は番号を付ける（既存・読み込み内の先行分の両方と重ならない）', () => {
  const existing: PresetLibrary<V> = { presets: [{ id: 'keep', name: '厳しめ', values: { a: 9 } }] };
  const result = appendImportedPresets<V>(
    existing,
    [
      { name: '厳しめ', values: { a: 1 } },
      { name: '厳しめ', values: { a: 2 } },
      { name: '緩め', values: {} },
    ],
    generateId,
  );
  assert.deepEqual(result.presets.map((preset) => preset.name), ['厳しめ', '厳しめ 2', '厳しめ 3', '緩め']);
  // 既存は上書きしない
  assert.deepEqual(result.presets[0], existing.presets[0]);
  // idは付け直す（重ならない）
  assert.equal(new Set(result.presets.map((preset) => preset.id)).size, 4);
  assert.deepEqual(result.presets[1].values, { a: 1 });
});

test('appendImportedPresets: 足すものが無ければ同一参照', () => {
  const library = emptyPresetLibrary<V>();
  assert.equal(appendImportedPresets(library, [], generateId), library);
});
