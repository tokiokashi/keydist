import assert from 'node:assert/strict';
import test from 'node:test';
import { FINGER_MATRIX_COLUMN_IDS, fingerMatrixOptions } from './options.ts';

test('並び替えの既定は並び替えなしで、面の切り替えと独立に持つ', () => {
  assert.equal(fingerMatrixOptions.defaultOptions.sort, null);
  assert.equal(fingerMatrixOptions.defaultOptions.surface, 'distance');
});

test('列のidは指10本と指間6組で、重ならない', () => {
  assert.equal(FINGER_MATRIX_COLUMN_IDS.length, 16);
  assert.equal(new Set(FINGER_MATRIX_COLUMN_IDS).size, 16);
  assert.ok(FINGER_MATRIX_COLUMN_IDS.includes('LT'));
  assert.ok(FINGER_MATRIX_COLUMN_IDS.includes('LP-LR'));
});

test('並び替えは列id:向きでURLに読み書きできる。指の組の列も読める', () => {
  for (const sort of [{ column: 'LI', direction: 'desc' }, { column: 'LP-LR', direction: 'asc' }] as const) {
    const params = fingerMatrixOptions.encodeOptionsToUrl({ ...fingerMatrixOptions.defaultOptions, sort });
    assert.equal(params.get('sort'), `${sort.column}:${sort.direction}`);
    const decoded = fingerMatrixOptions.decodeOptionsFromUrl(params, []);
    assert.deepEqual(decoded.values, { sort });
  }
  assert.equal(fingerMatrixOptions.encodeOptionsToUrl(fingerMatrixOptions.defaultOptions).has('sort'), false);
});

test('未知の列や向きのURL・保存値は捨てて並び替えなしに戻す', () => {
  for (const raw of ['x:asc', 'LP:up', 'LP', 'LP:asc:desc']) {
    const diagnostics: unknown[] = [];
    const decoded = fingerMatrixOptions.decodeOptionsFromUrl(new URLSearchParams({ sort: raw }), diagnostics as never);
    assert.deepEqual(decoded.values, {}, raw);
    assert.equal(diagnostics.length, 1, raw);
  }
  assert.equal(fingerMatrixOptions.decodeOptions({ sort: { column: 'x', direction: 'asc' } }, []).sort, null);
});

test('並び替えは表示だけの設定で、抽出のキーに入らない', () => {
  const key = (sort: unknown) => JSON.stringify(fingerMatrixOptions.extractKeyOf({ ...fingerMatrixOptions.defaultOptions, sort } as never));
  assert.equal(key({ column: 'LP', direction: 'asc' }), key(null));
});
