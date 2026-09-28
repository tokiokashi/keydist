import assert from 'node:assert/strict';
import test from 'node:test';
import type { AnalysisTarget } from '#input/setup/index.ts';
import { ANALYZER_TARGET_SELECTION_CODEC } from './analyzer-target-selection-codec.ts';

const QWERTY: AnalysisTarget = { kind: 'layout', layoutId: 'qwerty' };
const SETUP_A: AnalysisTarget = { kind: 'setup', setupId: 'a' };

test('ANALYZER_TARGET_SELECTION_CODEC: encode→decodeで往復する', () => {
  const state = { 'bigram-flow': QWERTY, comparison: SETUP_A };
  const decoded = ANALYZER_TARGET_SELECTION_CODEC.decode(ANALYZER_TARGET_SELECTION_CODEC.encode(state));
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value : undefined, state);
});

test('ANALYZER_TARGET_SELECTION_CODEC: Analyzer idはpayload.selectionsへネストされ、versionと同じ名前空間にならない', () => {
  const encoded = ANALYZER_TARGET_SELECTION_CODEC.encode({ 'bigram-flow': QWERTY });
  assert.equal(encoded.version, 1);
  assert.ok('selections' in encoded);
  assert.equal('bigram-flow' in encoded, false);
});

test('ANALYZER_TARGET_SELECTION_CODEC: "version"という名前のAnalyzer idがあってもcodecの予約語と衝突しない', () => {
  const state = { version: QWERTY };
  const decoded = ANALYZER_TARGET_SELECTION_CODEC.decode(ANALYZER_TARGET_SELECTION_CODEC.encode(state));
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value : undefined, state);
});

test('ANALYZER_TARGET_SELECTION_CODEC: 壊れた対象（未知kind）はその1件だけ捨てて読む', () => {
  const decoded = ANALYZER_TARGET_SELECTION_CODEC.decode({
    version: 1,
    selections: { 'bigram-flow': QWERTY, comparison: { kind: 'workspace', workspaceId: 'x' } },
  });
  assert.equal(decoded.ok, true);
  const value = decoded.ok ? decoded.value : {};
  assert.deepEqual(value['bigram-flow'], QWERTY);
  assert.equal('comparison' in value, false);
  assert.ok(decoded.ok && decoded.diagnostics.length > 0);
});

test('ANALYZER_TARGET_SELECTION_CODEC: 予約された名前（__proto__等）のAnalyzer idはその1件だけ捨てる', () => {
  const decoded = ANALYZER_TARGET_SELECTION_CODEC.decode({
    version: 1,
    selections: JSON.parse('{"__proto__": {"kind":"layout","layoutId":"x"}, "bigram-flow": {"kind":"layout","layoutId":"qwerty"}}'),
  });
  assert.equal(decoded.ok, true);
  const value = decoded.ok ? decoded.value : {};
  assert.equal(Object.hasOwn(value, '__proto__'), false);
  assert.deepEqual(value['bigram-flow'], QWERTY);
});

test('ANALYZER_TARGET_SELECTION_CODEC: selections自体が無ければ空の資産へ戻す', () => {
  const decoded = ANALYZER_TARGET_SELECTION_CODEC.decode({ version: 1 });
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value : undefined, {});
});

test('ANALYZER_TARGET_SELECTION_CODEC: selectionsがobject形式でなければ空へ戻す', () => {
  const decoded = ANALYZER_TARGET_SELECTION_CODEC.decode({ version: 1, selections: 'not-an-object' });
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value : undefined, {});
});

test('ANALYZER_TARGET_SELECTION_CODEC: object形式でなければdecode自体が失敗する', () => {
  const decoded = ANALYZER_TARGET_SELECTION_CODEC.decode('not-an-object');
  assert.equal(decoded.ok, false);
});
