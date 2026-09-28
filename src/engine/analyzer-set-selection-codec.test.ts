import assert from 'node:assert/strict';
import test from 'node:test';
import type { AnalysisTarget } from '#input/setup/index.ts';
import { ANALYZER_SET_SELECTION_CODEC } from './analyzer-set-selection-codec.ts';

const A: AnalysisTarget = { kind: 'setup', setupId: 'a' };
const B: AnalysisTarget = { kind: 'setup', setupId: 'b' };
const C: AnalysisTarget = { kind: 'layout', layoutId: 'c' };

test('ANALYZER_SET_SELECTION_CODEC: encode→decodeで往復する', () => {
  const state = {
    comparison: { targets: [A, B], baseline: A, colorSlots: [2, 0] },
    'n-sensitivity': { targets: [C], baseline: undefined, colorSlots: [0] },
  };
  const decoded = ANALYZER_SET_SELECTION_CODEC.decode(ANALYZER_SET_SELECTION_CODEC.encode(state));
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value : undefined, state);
});

test('ANALYZER_SET_SELECTION_CODEC: Analyzer idはpayload.selectionsへネストされ、versionと同じ名前空間にならない', () => {
  const encoded = ANALYZER_SET_SELECTION_CODEC.encode({ comparison: { targets: [A], baseline: undefined, colorSlots: [0] } });
  assert.equal(encoded.version, 2);
  assert.ok('selections' in encoded);
  // トップレベルにAnalyzer idが直接展開されていない（"comparison"というキーがversionと並ばない）。
  assert.equal('comparison' in encoded, false);
});

test('ANALYZER_SET_SELECTION_CODEC: "version"という名前のAnalyzer idがあってもcodecの予約語と衝突しない', () => {
  const state = { version: { targets: [A], baseline: undefined, colorSlots: [0] } };
  const decoded = ANALYZER_SET_SELECTION_CODEC.decode(ANALYZER_SET_SELECTION_CODEC.encode(state));
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value : undefined, state);
});

test('ANALYZER_SET_SELECTION_CODEC: 重複した対象は1つに畳んで読む', () => {
  const decoded = ANALYZER_SET_SELECTION_CODEC.decode({
    version: 2,
    selections: { comparison: { targets: [A, B, A] } },
  });
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value.comparison?.targets : undefined, [A, B]);
  assert.ok(decoded.ok && decoded.diagnostics.length > 0, '重複を畳んだことの診断が残る');
});

test('ANALYZER_SET_SELECTION_CODEC: 選択に含まれないbaselineは基準なしへ戻す（不変条件をdecode時にも保証）', () => {
  const decoded = ANALYZER_SET_SELECTION_CODEC.decode({
    version: 2,
    selections: { comparison: { targets: [A], baseline: B } },
  });
  assert.equal(decoded.ok, true);
  assert.equal(decoded.ok ? decoded.value.comparison?.baseline : undefined, undefined);
});

test('ANALYZER_SET_SELECTION_CODEC: 壊れた対象（未知kind）はその1件だけ捨てて読む', () => {
  const decoded = ANALYZER_SET_SELECTION_CODEC.decode({
    version: 2,
    selections: { comparison: { targets: [A, { kind: 'workspace', workspaceId: 'x' }, B] } },
  });
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value.comparison?.targets : undefined, [A, B]);
});

test('ANALYZER_SET_SELECTION_CODEC: 予約された名前（__proto__等）のAnalyzer idはその1件だけ捨てる', () => {
  const decoded = ANALYZER_SET_SELECTION_CODEC.decode({
    version: 2,
    selections: JSON.parse('{"__proto__": {"targets": [{"kind":"setup","setupId":"a"}]}, "comparison": {"targets": [{"kind":"setup","setupId":"b"}]}}'),
  });
  assert.equal(decoded.ok, true);
  const value = decoded.ok ? decoded.value : {};
  assert.equal(Object.hasOwn(value, '__proto__'), false);
  assert.deepEqual(value.comparison?.targets, [B]);
});

test('ANALYZER_SET_SELECTION_CODEC: selections自体が無ければ空の資産へ戻す', () => {
  const decoded = ANALYZER_SET_SELECTION_CODEC.decode({ version: 2 });
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value : undefined, {});
});

test('ANALYZER_SET_SELECTION_CODEC: selectionsが配列等object形式でなければ空へ戻す', () => {
  const decoded = ANALYZER_SET_SELECTION_CODEC.decode({ version: 2, selections: 'not-an-object' });
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value : undefined, {});
});

test('ANALYZER_SET_SELECTION_CODEC: object形式でなければdecode自体が失敗する', () => {
  const decoded = ANALYZER_SET_SELECTION_CODEC.decode('not-an-object');
  assert.equal(decoded.ok, false);
});

test('ANALYZER_SET_SELECTION_CODEC: 色の番号が無ければ並びの順に配り直す（診断なし）', () => {
  const decoded = ANALYZER_SET_SELECTION_CODEC.decode({
    version: 2,
    selections: { comparison: { targets: [A, B] } },
  });
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value.comparison?.colorSlots : undefined, [0, 1]);
  assert.deepEqual(decoded.ok ? decoded.diagnostics : undefined, []);
});

test('ANALYZER_SET_SELECTION_CODEC: 捨てた対象の番号は読まず、残った対象は自分の番号を保つ', () => {
  const decoded = ANALYZER_SET_SELECTION_CODEC.decode({
    version: 2,
    selections: { comparison: { targets: [A, { kind: 'workspace', workspaceId: 'x' }, B], colorSlots: [3, 0, 1] } },
  });
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value.comparison?.colorSlots : undefined, [3, 1]);
});

test('ANALYZER_SET_SELECTION_CODEC: 範囲外の色の番号は壊れた値として配り直す', () => {
  const decoded = ANALYZER_SET_SELECTION_CODEC.decode({
    version: 2,
    selections: { comparison: { targets: [A, B], colorSlots: [0, 12] } },
  });
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value.comparison?.colorSlots : undefined, [0, 1]);
});
