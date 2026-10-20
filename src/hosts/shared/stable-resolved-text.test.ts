import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTextSelection } from '#input/text/resolve.ts';
import { sameResolvedText } from './stable-resolved-text.ts';

const LIBRARY = [] as unknown as Parameters<typeof resolveTextSelection>[1];
const builtin = (id: string) => resolveTextSelection({ ref: { kind: 'builtin', id } }, LIBRARY);

test('sameResolvedText: 呼び直して別のオブジェクトになっても、中身が同じなら同じ', () => {
  const a = builtin('builtin:ja.legacy');
  const b = builtin('builtin:ja.legacy');
  assert.notEqual(a, b);
  assert.equal(sameResolvedText(a, b), true);
});

test('sameResolvedText: テキスト・言語・参照が違えば別物', () => {
  const ja = builtin('builtin:ja.legacy');
  assert.equal(sameResolvedText(ja, { ...ja, text: `${ja.text}。` }), false);
  assert.equal(sameResolvedText(ja, { ...ja, language: ja.language === 'ja' ? 'en' : 'ja' }), false);
  assert.equal(sameResolvedText(ja, { ...ja, ref: { kind: 'user', id: ja.ref.id } }), false);
  assert.equal(sameResolvedText(ja, { ...ja, name: `${ja.name}2` }), false);
});

test('sameResolvedText: 読みの直しが違えば別物で、同じ中身なら同じ', () => {
  const ja = builtin('builtin:ja.legacy');
  assert.equal(sameResolvedText({ ...ja, readingCorrections: { 吾輩: 'わがはい' } }, { ...ja, readingCorrections: { 吾輩: 'わがはい' } }), true);
  assert.equal(sameResolvedText({ ...ja, readingCorrections: { 吾輩: 'わがはい' } }, { ...ja, readingCorrections: { 吾輩: 'われ' } }), false);
  assert.equal(sameResolvedText(ja, { ...ja, readingCorrections: { 吾輩: 'わがはい' } }), false);
});
