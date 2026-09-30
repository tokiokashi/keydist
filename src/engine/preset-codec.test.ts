import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PresetLibrary } from '#input/presets/index.ts';
import { PRESET_LIBRARY_CODEC } from './preset-codec.ts';
import { DEFAULT_ACTION_REALIZATION_POLICY } from '#input/semantics/index.ts';
import type { SettingsValueMap } from './settings-items.ts';

const LIBRARY: PresetLibrary<SettingsValueMap> = {
  presets: [
    { id: 'p1', name: '厳しめ', values: { windowSize: 5, sfbHomeCost: false } },
    { id: 'p2', name: '空', values: {} },
    {
      id: 'p3',
      name: 'オブジェクト',
      values: { actionRealizationPolicy: { ...DEFAULT_ACTION_REALIZATION_POLICY, triggerActivation: 'semantic' } },
    },
  ],
};

function decodeOk(input: unknown) {
  const result = PRESET_LIBRARY_CODEC.decode(input);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('unreachable');
  return result;
}

test('PRESET_LIBRARY_CODEC: encode→decodeで往復できる（空の値のプリセットも残る）', () => {
  const result = decodeOk(PRESET_LIBRARY_CODEC.encode(LIBRARY));
  assert.deepEqual(result.value, LIBRARY);
  assert.deepEqual(result.diagnostics, []);
});

test('PRESET_LIBRARY_CODEC: 未来の版は失敗として報告する', () => {
  const result = PRESET_LIBRARY_CODEC.decode({ version: 999, presets: [] });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason.kind, 'future-version');
});

test('PRESET_LIBRARY_CODEC: name が無い・空のプリセットは診断付きで捨て、他は残す', () => {
  const result = decodeOk({
    version: 1,
    presets: [
      { id: 'a', values: { windowSize: 4 } },
      { id: 'b', name: '   ', values: {} },
      { id: 'c', name: 5, values: {} },
      { id: 'd', name: '残る', values: { windowSize: 4 } },
    ],
  });
  assert.deepEqual(result.value.presets, [{ id: 'd', name: '残る', values: { windowSize: 4 } }]);
  assert.equal(result.diagnostics.length, 3);
});

test('PRESET_LIBRARY_CODEC: id が無い・重複・values が壊れたプリセットは診断付きで捨てる', () => {
  const result = decodeOk({
    version: 1,
    presets: [
      { name: 'idなし', values: {} },
      { id: 'x', name: '1つめ', values: {} },
      { id: 'x', name: '2つめ', values: {} },
      { id: 'y', name: 'valuesなし' },
      'ゴミ',
    ],
  });
  assert.deepEqual(result.value.presets.map((preset) => preset.name), ['1つめ']);
  assert.equal(result.diagnostics.length, 4);
});

test('PRESET_LIBRARY_CODEC: 不正な値・未知の項目は捨てて診断を積み、プリセットは残す（全部捨てても空で残る）', () => {
  const result = decodeOk({
    version: 1,
    presets: [
      { id: 'a', name: '一部', values: { windowSize: 4, sfbHomeCost: 'yes', unknownItem: 1 } },
      { id: 'b', name: '全滅', values: { windowSize: 'x' } },
    ],
  });
  assert.deepEqual(result.value.presets, [
    { id: 'a', name: '一部', values: { windowSize: 4 } },
    { id: 'b', name: '全滅', values: {} },
  ]);
  assert.equal(result.diagnostics.length, 3);
});

test('PRESET_LIBRARY_CODEC: __proto__ などの予約名は値に入らず、診断を積む', () => {
  const raw = JSON.parse(
    '{"version":1,"presets":[{"id":"a","name":"悪意","values":{"__proto__":{"windowSize":9},"constructor":1,"windowSize":4}}]}',
  );
  const result = decodeOk(raw);
  const values = result.value.presets[0].values;
  assert.deepEqual(values, { windowSize: 4 });
  assert.equal(Object.getPrototypeOf(values), Object.prototype);
  assert.equal(Object.hasOwn(values, '__proto__'), false);
  assert.equal(result.diagnostics.length, 2);
});

test('PRESET_LIBRARY_CODEC: 名前は前後の空白を落として読む', () => {
  const result = decodeOk({ version: 1, presets: [{ id: 'a', name: '  名前  ', values: {} }] });
  assert.equal(result.value.presets[0].name, '名前');
});
