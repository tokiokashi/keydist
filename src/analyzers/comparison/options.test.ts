import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPARISON_COLUMNS, comparisonOptions } from './options.ts';

/**
 * 列ごとの表示形式（コーディネーターレビュー対応: 一律ルールではなく列の宣言に持たせる）。
 * 旧実装（`src/legacy/analyzer-metrics-content.tsx`の`COMPARE_FORMATS`）と同じ桁数・
 * %表記になっていることを確認する。列の並びは`COMPARE_HEADERS`と同じ順（`options.ts`の
 * コメント参照）。
 */

test('COMPARISON_COLUMNS: 個数の列は整数のまま（桁を丸めない）', () => {
  assert.equal(COMPARISON_COLUMNS.actions.format(123), '123');
  assert.equal(COMPARISON_COLUMNS.sameFinger.format(7), '7');
});

test('COMPARISON_COLUMNS: 距離[u]は整数（小数第0位）', () => {
  assert.equal(COMPARISON_COLUMNS.totalUnits.format(1234.567), '1235');
});

test('COMPARISON_COLUMNS: u系・指間系は小数第3位まで', () => {
  assert.equal(COMPARISON_COLUMNS.meanPerStroke.format(1.23456), '1.235');
  assert.equal(COMPARISON_COLUMNS.perCharUnits.format(0.1), '0.100');
  assert.equal(COMPARISON_COLUMNS.perCharSteps.format(1), '1.000');
  assert.equal(COMPARISON_COLUMNS.perCharPresses.format(1), '1.000');
  assert.equal(COMPARISON_COLUMNS.adjacentMean.format(-0.02345), '-0.023');
  assert.equal(COMPARISON_COLUMNS.adjacentStdDev.format(0.5), '0.500');
});

test('COMPARISON_COLUMNS: 率の列は率として読める表示（小数第1位 + %）', () => {
  assert.equal(COMPARISON_COLUMNS.singleTapLayerRate.format(87.654), '87.7%');
  assert.equal(COMPARISON_COLUMNS.singleTapRate.format(100), '100.0%');
  assert.equal(COMPARISON_COLUMNS.singleKeyRate.format(0), '0.0%');
  assert.equal(COMPARISON_COLUMNS.sameFingerRate.format(12.34), '12.3%');
});

test('COMPARISON_COLUMNS: 全13列に表示形式が定義されている', () => {
  const ids = Object.keys(COMPARISON_COLUMNS);
  assert.equal(ids.length, 13);
  for (const id of ids) {
    const def = COMPARISON_COLUMNS[id as keyof typeof COMPARISON_COLUMNS];
    assert.equal(typeof def.label, 'string');
    assert.equal(typeof def.format(1), 'string');
  }
});

test('URL: 既定値なら何も書かず、変えた項目だけが往復する', () => {
  assert.equal(comparisonOptions.encodeOptionsToUrl(comparisonOptions.defaultOptions).toString(), '');
  const options = { visibleColumns: ['totalUnits', 'actions'], showBaselineRatio: false } as const;
  const params = comparisonOptions.encodeOptionsToUrl(options);
  const diagnostics: { path: string; message: string }[] = [];
  const decoded = comparisonOptions.decodeOptionsFromUrl(new URLSearchParams(params.toString()), diagnostics);
  assert.deepEqual(decoded.values, options);
  assert.deepEqual(diagnostics, []);
});

test('URL: 0列は空のまま往復し、全列へ戻らない', () => {
  const params = comparisonOptions.encodeOptionsToUrl({ ...comparisonOptions.defaultOptions, visibleColumns: [] });
  const decoded = comparisonOptions.decodeOptionsFromUrl(new URLSearchParams(params.toString()), []);
  assert.deepEqual(decoded.values.visibleColumns, []);
});

test('URL: 未知の列や真偽値は診断を積んで捨てる', () => {
  const diagnostics: { path: string; message: string }[] = [];
  const decoded = comparisonOptions.decodeOptionsFromUrl(new URLSearchParams('columns=actions,nope&baselineRatio=maybe'), diagnostics);
  assert.deepEqual(decoded.values, { visibleColumns: ['actions'] });
  assert.equal(diagnostics.length, 2);
});
