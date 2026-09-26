import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setOverride } from './write.ts';
import { EMPTY_CASCADE_OVERRIDES } from './overrides.ts';

test('setOverrideはイミュータブル: 元のoverridesを変えない', () => {
  const original = EMPTY_CASCADE_OVERRIDES;
  const result = setOverride(original, { kind: 'global' }, 'windowSize', 5);
  assert.ok(result.ok);
  assert.deepEqual(original, {});
  assert.notEqual(result.ok ? result.overrides : undefined, original);
});

test('同じレベルへ別項目を書き足しても、先に書いた項目は残る', () => {
  const first = setOverride(EMPTY_CASCADE_OVERRIDES, { kind: 'global' }, 'windowSize', 5);
  assert.ok(first.ok);
  const second = setOverride(first.overrides, { kind: 'global' }, 'sfbHomeCost', false);
  assert.ok(second.ok);
  assert.deepEqual(second.overrides, { global: { windowSize: 5, sfbHomeCost: false } });
});

test('レベルの種類ごとに別のインスタンスidで独立して保存される', () => {
  let overrides = EMPTY_CASCADE_OVERRIDES;
  const a = setOverride(overrides, { kind: 'layout', layoutId: 'layout-a' }, 'windowSize', 1);
  assert.ok(a.ok);
  overrides = a.overrides;
  const b = setOverride(overrides, { kind: 'layout', layoutId: 'layout-b' }, 'windowSize', 2);
  assert.ok(b.ok);
  overrides = b.overrides;

  assert.deepEqual(overrides.layout, {
    'layout-a': { windowSize: 1 },
    'layout-b': { windowSize: 2 },
  });
});
