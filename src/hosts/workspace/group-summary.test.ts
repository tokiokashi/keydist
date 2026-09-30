import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeNames } from './group-summary.ts';

test('summarizeNames: 0件は未選択、2件までは並べ、3件以上は先頭2件と他N件に畳む', () => {
  assert.equal(summarizeNames([]), '未選択');
  assert.equal(summarizeNames(['QWERTY']), 'QWERTY');
  assert.equal(summarizeNames(['QWERTY', 'Colemak-DH']), 'QWERTY、Colemak-DH');
  assert.equal(summarizeNames(['A', 'B', 'C']), 'A、B 他1件');
  assert.equal(summarizeNames(['A', 'B', 'C', 'D', 'E']), 'A、B 他3件');
});
