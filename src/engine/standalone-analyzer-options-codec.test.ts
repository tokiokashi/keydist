import assert from 'node:assert/strict';
import test from 'node:test';
import { STANDALONE_ANALYZER_OPTIONS_CODEC } from './standalone-analyzer-options-codec.ts';

test('STANDALONE_ANALYZER_OPTIONS_CODEC: encode→decodeで往復する', () => {
  const state = { 'bigram-flow': { source: 'actual', polarGain: 1 } };
  const decoded = STANDALONE_ANALYZER_OPTIONS_CODEC.decode(STANDALONE_ANALYZER_OPTIONS_CODEC.encode(state));
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value : undefined, state);
});

test('STANDALONE_ANALYZER_OPTIONS_CODEC: 未知のAnalyzer idも残す（このcodecはレジストリを知らないため）', () => {
  const decoded = STANDALONE_ANALYZER_OPTIONS_CODEC.decode({
    version: 1,
    'no-such-analyzer': { anything: true },
  });
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value : undefined, { 'no-such-analyzer': { anything: true } });
});

test('STANDALONE_ANALYZER_OPTIONS_CODEC: 予約された名前のAnalyzer idは診断付きで捨てる', () => {
  // オブジェクトリテラルの`__proto__`はプロトタイプを差し替えるだけでown propertyには
  // ならない（JSでは仕様上の特別扱い）ので、own propertyとして実際に作れる
  // `JSON.parse`経由で用意する（共有リンク・importファイルが実際にこの形で届く経路と揃える。
  // `input/settings/codec.ts`冒頭コメント参照）。
  const raw = JSON.parse('{"version":1,"__proto__":{"anything":true},"bigram-flow":{"source":"actual"}}') as unknown;
  const decoded = STANDALONE_ANALYZER_OPTIONS_CODEC.decode(raw);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.deepEqual(decoded.value, { 'bigram-flow': { source: 'actual' } });
  assert.ok(decoded.diagnostics.some((diagnostic) => diagnostic.message.includes('予約された名前')));
});

test('STANDALONE_ANALYZER_OPTIONS_CODEC: object形式でない値は診断付きで捨てる', () => {
  const decoded = STANDALONE_ANALYZER_OPTIONS_CODEC.decode({
    version: 1,
    'bigram-flow': 'not-an-object',
  });
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.deepEqual(decoded.value, {});
  assert.ok(decoded.diagnostics.some((diagnostic) => diagnostic.message.includes('object形式でない')));
});

test('STANDALONE_ANALYZER_OPTIONS_CODEC: 資産全体がobjectでなければ失敗（not-an-object）', () => {
  const decoded = STANDALONE_ANALYZER_OPTIONS_CODEC.decode(['not', 'a', 'record']);
  assert.deepEqual(decoded, { ok: false, reason: { kind: 'not-an-object' } });
});

test('STANDALONE_ANALYZER_OPTIONS_CODEC: 保存が無い（versionだけ）なら空のrecord', () => {
  const decoded = STANDALONE_ANALYZER_OPTIONS_CODEC.decode({ version: 1 });
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value : undefined, {});
});

test('STANDALONE_ANALYZER_OPTIONS_CODEC: versionが無ければ失敗', () => {
  const decoded = STANDALONE_ANALYZER_OPTIONS_CODEC.decode({ 'bigram-flow': { source: 'actual' } });
  assert.equal(decoded.ok, false);
});
