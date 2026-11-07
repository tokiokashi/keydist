import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeSharedOptions } from './shared-options-merge.ts';

test('mergeSharedOptions: リンクに無い項目は保存済みの値が残り、リンクにある項目だけが置き換わる', () => {
  const current = { lineScale: 'sqrt', windowSize: 3, source: 'actual' };
  assert.deepEqual(mergeSharedOptions(current, { windowSize: 5 }), { lineScale: 'sqrt', windowSize: 5, source: 'actual' });
});

test('mergeSharedOptions: リンクから読めた項目が無ければ書き込みを起こさない', () => {
  assert.equal(mergeSharedOptions({ windowSize: 3 }, {}), undefined);
});
