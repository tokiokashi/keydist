import assert from 'node:assert/strict';
import test from 'node:test';
import { createScaleRegistry, mergeScaleRanges, scaleRangeWithZero } from './shared-scale.ts';

test('mergeScaleRangesは全部の範囲を含む最小と最大を返す', () => {
  assert.deepEqual(
    mergeScaleRanges([{ min: 0, max: 69.7 }, { min: -2, max: 110.5 }, { min: 0, max: 40 }]),
    { min: -2, max: 110.5 },
  );
});

test('mergeScaleRangesは範囲が1つも無ければundefined', () => {
  assert.equal(mergeScaleRanges([]), undefined);
});

test('scaleRangeWithZeroは0を常に含める', () => {
  assert.deepEqual(scaleRangeWithZero([3, 5]), { min: 0, max: 5 });
  assert.deepEqual(scaleRangeWithZero([-4, -1]), { min: -4, max: 0 });
  assert.deepEqual(scaleRangeWithZero([]), { min: 0, max: 0 });
});

test('レジストリは同じキーの報告を集め、報告を外すと残りの範囲に戻る', () => {
  const registry = createScaleRegistry();
  registry.report('k', 'a', { min: 0, max: 110 });
  registry.report('k', 'b', { min: 0, max: 70 });
  assert.deepEqual(registry.rangeOf('k'), { min: 0, max: 110 });
  registry.report('k', 'a', undefined);
  assert.deepEqual(registry.rangeOf('k'), { min: 0, max: 70 });
  registry.report('k', 'b', undefined);
  assert.equal(registry.rangeOf('k'), undefined);
});

test('レジストリはキーが違う報告を混ぜない', () => {
  const registry = createScaleRegistry();
  registry.report('distance', 'a', { min: 0, max: 110 });
  registry.report('presses', 'b', { min: 0, max: 900 });
  assert.deepEqual(registry.rangeOf('distance'), { min: 0, max: 110 });
  assert.deepEqual(registry.rangeOf('presses'), { min: 0, max: 900 });
});

test('レジストリは同じペインの報告を置き換える', () => {
  const registry = createScaleRegistry();
  registry.report('k', 'a', { min: 0, max: 110 });
  registry.report('k', 'a', { min: 0, max: 50 });
  assert.deepEqual(registry.rangeOf('k'), { min: 0, max: 50 });
});

test('レジストリは全体の範囲が変わらない報告では通知せず、参照も変えない', () => {
  const registry = createScaleRegistry();
  registry.report('k', 'a', { min: 0, max: 110 });
  const before = registry.rangeOf('k');
  let calls = 0;
  registry.subscribe(() => { calls += 1; });
  registry.report('k', 'b', { min: 0, max: 70 });
  registry.report('k', 'a', { min: 0, max: 110 });
  registry.report('k', 'c', undefined);
  assert.equal(calls, 0);
  assert.equal(registry.rangeOf('k'), before);
  registry.report('k', 'a', undefined);
  assert.equal(calls, 1);
});

test('レジストリは購読を外すと通知しない', () => {
  const registry = createScaleRegistry();
  let calls = 0;
  const off = registry.subscribe(() => { calls += 1; });
  off();
  registry.report('k', 'a', { min: 0, max: 1 });
  assert.equal(calls, 0);
});
