import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_TEXTS, DEFAULT_BUILTIN_TEXT_ID } from './builtin.ts';
import { appendCopiedUserText, emptyTextLibrary, setUserTextLanguageOverride } from './library.ts';
import { resolveTextSelection } from './resolve.ts';
import { DEFAULT_TEXT_REF } from './selection.ts';

const JA_LEGACY = BUILTIN_TEXTS.find((entry) => entry.id === DEFAULT_BUILTIN_TEXT_ID)!;

test('resolveTextSelection: 組み込みを選んでいれば、その本文と固定言語を返す', () => {
  const resolved = resolveTextSelection({ ref: DEFAULT_TEXT_REF }, emptyTextLibrary());
  assert.equal(resolved.isBuiltin, true);
  assert.equal(resolved.text, JA_LEGACY.text);
  assert.equal(resolved.language, JA_LEGACY.language);
  assert.equal(resolved.languageOverride, undefined);
});

test('resolveTextSelection: ユーザーテキストを選んでいれば、その本文と自動判定言語を返す', () => {
  let library = appendCopiedUserText(emptyTextLibrary(), () => 'text-1', { text: 'hello world', name: 'マイテキスト' }).library;
  const resolved = resolveTextSelection({ ref: { kind: 'user', id: 'text-1' } }, library);
  assert.equal(resolved.isBuiltin, false);
  assert.equal(resolved.text, 'hello world');
  assert.equal(resolved.name, 'マイテキスト');
  assert.equal(resolved.language, 'en');

  library = setUserTextLanguageOverride(library, 'text-1', 'ja');
  const overridden = resolveTextSelection({ ref: { kind: 'user', id: 'text-1' } }, library);
  assert.equal(overridden.language, 'ja', '手動上書きが自動判定より優先される');
  assert.equal(overridden.languageOverride, 'ja');
});

test('resolveTextSelection: 参照先のユーザーテキストが手持ちに無ければ既定の組み込みへフォールバックする', () => {
  const resolved = resolveTextSelection({ ref: { kind: 'user', id: 'no-such-id' } }, emptyTextLibrary());
  assert.equal(resolved.isBuiltin, true);
  assert.deepEqual(resolved.ref, DEFAULT_TEXT_REF);
});

test('resolveTextSelection: 参照先の組み込みidが不正でも既定の組み込みへフォールバックする', () => {
  const resolved = resolveTextSelection({ ref: { kind: 'builtin', id: 'builtin:no-such-id' } }, emptyTextLibrary());
  assert.deepEqual(resolved.ref, DEFAULT_TEXT_REF);
});
