import assert from 'node:assert/strict';
import test from 'node:test';
import { ANALYZER_SET_SELECTION_CODEC } from './analyzer-set-selection-codec.ts';

test('ANALYZER_SET_SELECTION_CODEC: encode→decodeで往復する', () => {
  const state = {
    comparison: { setupIds: ['a', 'b'], baselineSetupId: 'a' },
    'n-sensitivity': { setupIds: ['c'], baselineSetupId: undefined },
  };
  const decoded = ANALYZER_SET_SELECTION_CODEC.decode(ANALYZER_SET_SELECTION_CODEC.encode(state));
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value : undefined, state);
});

test('ANALYZER_SET_SELECTION_CODEC: Analyzer idはpayload.selectionsへネストされ、versionと同じ名前空間にならない', () => {
  const encoded = ANALYZER_SET_SELECTION_CODEC.encode({ comparison: { setupIds: ['a'], baselineSetupId: undefined } });
  assert.equal(encoded.version, 1);
  assert.ok('selections' in encoded);
  // トップレベルにAnalyzer idが直接展開されていない（"comparison"というキーがversionと並ばない）。
  assert.equal('comparison' in encoded, false);
});

test('ANALYZER_SET_SELECTION_CODEC: "version"という名前のAnalyzer idがあってもcodecの予約語と衝突しない', () => {
  const state = { version: { setupIds: ['a'], baselineSetupId: undefined } };
  const decoded = ANALYZER_SET_SELECTION_CODEC.decode(ANALYZER_SET_SELECTION_CODEC.encode(state));
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value : undefined, state);
});

test('ANALYZER_SET_SELECTION_CODEC: 重複したSetup idは1つに畳んで読む', () => {
  const decoded = ANALYZER_SET_SELECTION_CODEC.decode({
    version: 1,
    selections: { comparison: { setupIds: ['a', 'b', 'a'] } },
  });
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value.comparison?.setupIds : undefined, ['a', 'b']);
  assert.ok(decoded.ok && decoded.diagnostics.length > 0, '重複を畳んだことの診断が残る');
});

test('ANALYZER_SET_SELECTION_CODEC: 選択に含まれないbaselineSetupIdは基準なしへ戻す（不変条件をdecode時にも保証）', () => {
  const decoded = ANALYZER_SET_SELECTION_CODEC.decode({
    version: 1,
    selections: { comparison: { setupIds: ['a'], baselineSetupId: 'not-in-selection' } },
  });
  assert.equal(decoded.ok, true);
  assert.equal(decoded.ok ? decoded.value.comparison?.baselineSetupId : undefined, undefined);
});

test('ANALYZER_SET_SELECTION_CODEC: 予約された名前（__proto__等）のAnalyzer idはその1件だけ捨てる', () => {
  const decoded = ANALYZER_SET_SELECTION_CODEC.decode({
    version: 1,
    selections: JSON.parse('{"__proto__": {"setupIds": ["a"]}, "comparison": {"setupIds": ["b"]}}'),
  });
  assert.equal(decoded.ok, true);
  const value = decoded.ok ? decoded.value : {};
  assert.equal(Object.hasOwn(value, '__proto__'), false);
  assert.deepEqual(value.comparison?.setupIds, ['b']);
});

test('ANALYZER_SET_SELECTION_CODEC: selections自体が無ければ空の資産へ戻す', () => {
  const decoded = ANALYZER_SET_SELECTION_CODEC.decode({ version: 1 });
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value : undefined, {});
});

test('ANALYZER_SET_SELECTION_CODEC: selectionsが配列等object形式でなければ空へ戻す', () => {
  const decoded = ANALYZER_SET_SELECTION_CODEC.decode({ version: 1, selections: 'not-an-object' });
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value : undefined, {});
});

test('ANALYZER_SET_SELECTION_CODEC: object形式でなければdecode自体が失敗する', () => {
  const decoded = ANALYZER_SET_SELECTION_CODEC.decode('not-an-object');
  assert.equal(decoded.ok, false);
});
