import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineItem, type ItemRegistry } from './items.ts';
import { setOverride } from './write.ts';
import { emptyCascadeOverrides, type CascadeOverrides } from './overrides.ts';

const TEST_ITEMS = {
  windowSize: defineItem<number>({
    id: 'windowSize',
    allowedLevels: new Set(['global', 'layout', 'setup']),
    defaultValue: 3,
  }),
  sfbHomeCost: defineItem<boolean>({
    id: 'sfbHomeCost',
    allowedLevels: new Set(['global', 'layout', 'setup']),
    defaultValue: true,
  }),
} as const satisfies ItemRegistry;

type TestOverrides = CascadeOverrides<{ windowSize: number; sfbHomeCost: boolean }>;
const EMPTY: TestOverrides = emptyCascadeOverrides();

test('setOverrideはイミュータブル: 元のoverridesを変えない', () => {
  const result = setOverride(TEST_ITEMS, EMPTY, { kind: 'global' }, 'windowSize', 5);
  assert.ok(result.ok);
  assert.deepEqual(EMPTY, {});
  assert.notEqual(result.ok ? result.overrides : undefined, EMPTY);
});

test('同じレベルへ別項目を書き足しても、先に書いた項目は残る', () => {
  const first = setOverride(TEST_ITEMS, EMPTY, { kind: 'global' }, 'windowSize', 5);
  assert.ok(first.ok);
  const second = setOverride(TEST_ITEMS, first.overrides, { kind: 'global' }, 'sfbHomeCost', false);
  assert.ok(second.ok);
  assert.deepEqual(second.overrides, { global: { windowSize: 5, sfbHomeCost: false } });
});

test('レベルの種類ごとに別のインスタンスidで独立して保存される', () => {
  let overrides = EMPTY;
  const a = setOverride(TEST_ITEMS, overrides, { kind: 'layout', layoutId: 'layout-a' }, 'windowSize', 1);
  assert.ok(a.ok);
  overrides = a.overrides;
  const b = setOverride(TEST_ITEMS, overrides, { kind: 'layout', layoutId: 'layout-b' }, 'windowSize', 2);
  assert.ok(b.ok);
  overrides = b.overrides;

  assert.deepEqual(overrides.layout, {
    'layout-a': { windowSize: 1 },
    'layout-b': { windowSize: 2 },
  });
});
