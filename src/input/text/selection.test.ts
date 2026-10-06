import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BUILTIN_TEXT_ID } from './builtin.ts';
import { DEFAULT_TEXT_REF, initialTextSelection, textRefEquals, withTextSelection } from './selection.ts';

test('initialTextSelection: 既定の組み込み（ja.legacy）を指す', () => {
  const selection = initialTextSelection();
  assert.deepEqual(selection, { ref: { kind: 'builtin', id: DEFAULT_BUILTIN_TEXT_ID } });
});

test('DEFAULT_TEXT_REF: initialTextSelectionと同じ参照を指す', () => {
  assert.deepEqual(DEFAULT_TEXT_REF, { kind: 'builtin', id: DEFAULT_BUILTIN_TEXT_ID });
});

test('textRefEquals: kindとidが両方一致する時だけtrue', () => {
  assert.equal(textRefEquals({ kind: 'user', id: 'a' }, { kind: 'user', id: 'a' }), true);
  assert.equal(textRefEquals({ kind: 'user', id: 'a' }, { kind: 'user', id: 'b' }), false);
  assert.equal(textRefEquals({ kind: 'user', id: 'a' }, { kind: 'builtin', id: 'a' }), false);
});

test('withTextSelection: 参照を差し替える', () => {
  const selection = initialTextSelection();
  const next = withTextSelection(selection, { kind: 'user', id: 'text-1' });
  assert.deepEqual(next, { ref: { kind: 'user', id: 'text-1' } });
});

test('withTextSelection: 同じ参照なら同一参照を返す', () => {
  const selection = initialTextSelection();
  const result = withTextSelection(selection, { ...selection.ref });
  assert.equal(result, selection);
});
