import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defineItem, type CascadeOverrides, type RegistryValueMap } from '#input/settings/index.ts';
import { applyPresetValues } from './index.ts';

// 実際の項目登録（engine）に依らず、仕組みだけを小さなレジストリで確かめる
const REGISTRY = {
  windowSize: defineItem<number>({ id: 'windowSize', allowedLevels: new Set(['global', 'layout']), defaultValue: 3 }),
  onlyGlobal: defineItem<boolean>({ id: 'onlyGlobal', allowedLevels: new Set(['global']), defaultValue: false }),
  contextual: defineItem<string>({
    id: 'contextual',
    allowedLevels: new Set(['global', 'layout']),
    defaultValue: () => 'ctx',
  }),
};
type V = RegistryValueMap<typeof REGISTRY>;
const GLOBAL = { kind: 'global' } as const;
const LAYOUT = { kind: 'layout', layoutId: 'qwerty' } as const;

test('置き換え: プリセットに無い項目の上書きは消えて既定へ戻る', () => {
  const overrides: CascadeOverrides<V> = { global: { windowSize: 5, onlyGlobal: true } };
  const result = applyPresetValues(REGISTRY, overrides, GLOBAL, { windowSize: 7 });
  assert.deepEqual(result.overrides.global, { windowSize: 7 });
  assert.deepEqual(result.skipped, []);
});

test('置き換え: 既定と同じ値は上書きとして残さない。全部消えればレベルごと消える', () => {
  const overrides: CascadeOverrides<V> = { global: { windowSize: 5 } };
  const result = applyPresetValues(REGISTRY, overrides, GLOBAL, { windowSize: 3, onlyGlobal: false });
  assert.deepEqual(result.overrides, {});
});

test('置き換え: 既定が文脈で決まる項目は既定を判定できないので値を残す', () => {
  const result = applyPresetValues(REGISTRY, {}, GLOBAL, { contextual: 'ctx' });
  assert.deepEqual(result.overrides.global, { contextual: 'ctx' });
});

test('置き換え: 対象レベルの許可に無い項目は入れず、入れなかった項目を返す', () => {
  const result = applyPresetValues(REGISTRY, {}, LAYOUT, { windowSize: 6, onlyGlobal: true });
  assert.deepEqual(result.overrides.layout?.qwerty, { windowSize: 6 });
  assert.deepEqual(result.skipped, ['onlyGlobal']);
});

test('置き換え: 他のレベルの上書きは触らない', () => {
  const overrides: CascadeOverrides<V> = { global: { windowSize: 5 }, layout: { qwerty: { windowSize: 8 } } };
  const result = applyPresetValues(REGISTRY, overrides, GLOBAL, {});
  assert.deepEqual(result.overrides, { layout: { qwerty: { windowSize: 8 } } });
});

test('置き換え: 結果が今と同じなら同一参照（キーの並びが違うだけでも）', () => {
  const overrides: CascadeOverrides<V> = { global: { windowSize: 5, contextual: 'x' } };
  const result = applyPresetValues(REGISTRY, overrides, GLOBAL, { contextual: 'x', windowSize: 5 });
  assert.equal(result.overrides, overrides);
});

test('置き換え: レジストリに無い項目・予約名は入れず、入れなかった項目に返す', () => {
  const values = JSON.parse('{"__proto__":{"windowSize":9},"nothing":1,"windowSize":4}');
  const result = applyPresetValues(REGISTRY, {}, GLOBAL, values);
  assert.deepEqual(result.overrides.global, { windowSize: 4 });
  assert.deepEqual([...result.skipped].sort(), ['__proto__', 'nothing']);
  assert.equal(({} as Record<string, unknown>).windowSize, undefined);
});
