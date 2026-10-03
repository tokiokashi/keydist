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
  const options = { visibleColumns: ['totalUnits', 'actions'], showBaselineRatio: false, sort: null } as const;
  const params = comparisonOptions.encodeOptionsToUrl(options);
  const diagnostics: { path: string; message: string }[] = [];
  const decoded = comparisonOptions.decodeOptionsFromUrl(new URLSearchParams(params.toString()), diagnostics);
  assert.deepEqual(decoded.values, { visibleColumns: options.visibleColumns, showBaselineRatio: false });
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

test('見出し: 単位 [u] は、値が距離そのもので名前に単位が入っていない列にだけ付く', () => {
  const withUnit = Object.entries(COMPARISON_COLUMNS).filter(([, def]) => def.label.endsWith(' [u]')).map(([id]) => id);
  assert.deepEqual(withUnit, ['totalUnits', 'adjacentMean', 'adjacentStdDev']);
  // 名前に単位を含む列（u/打鍵・u/文字）には重ねて付けない。
  assert.equal(COMPARISON_COLUMNS.meanPerStroke.label, 'u/打鍵');
  assert.equal(COMPARISON_COLUMNS.perCharUnits.label, 'u/文字');
  assert.equal(COMPARISON_COLUMNS.adjacentMean.label, '指間平均 [u]');
  assert.equal(COMPARISON_COLUMNS.adjacentStdDev.label, '指間σ [u]');
});

test('見出し: 全列に説明があり、内部の語や英語のmeanを使わない', () => {
  for (const [id, def] of Object.entries(COMPARISON_COLUMNS)) {
    assert.ok(def.description.length > 0, id);
    for (const word of ['Policy', 'fresh', 'Stroke', 'physical', 'mean']) {
      assert.ok(!def.description.includes(word) && !def.label.includes(word), `${id}: ${word}`);
    }
  }
});

test('並び替え: 既定はなし。URLは 列:向き で往復し、解除はURLに出ない', () => {
  assert.equal(comparisonOptions.defaultOptions.sort, null);
  const sort = { column: 'sameFingerRate', direction: 'desc' } as const;
  const params = comparisonOptions.encodeOptionsToUrl({ ...comparisonOptions.defaultOptions, sort });
  assert.equal(params.get('sort'), 'sameFingerRate:desc');
  const decoded = comparisonOptions.decodeOptionsFromUrl(new URLSearchParams(params.toString()), []);
  assert.deepEqual(decoded.values, { sort });
});

test('並び替え: URLの壊れた値は診断を積んで捨てる', () => {
  for (const raw of ['nope:asc', 'totalUnits:up', 'totalUnits', 'totalUnits:asc:x']) {
    const diagnostics: { path: string; message: string }[] = [];
    const decoded = comparisonOptions.decodeOptionsFromUrl(new URLSearchParams({ sort: raw }), diagnostics);
    assert.deepEqual(decoded.values, {}, raw);
    assert.equal(diagnostics.length, 1, raw);
  }
});

test('並び替え: 保存値は往復し、壊れた値は既定（なし）へ戻る', () => {
  const stored = { sort: { column: 'totalUnits', direction: 'asc' } };
  assert.deepEqual(comparisonOptions.decodeOptions(stored, []).sort, stored.sort);
  const diagnostics: { path: string; message: string }[] = [];
  assert.equal(comparisonOptions.decodeOptions({ sort: { column: 'x', direction: 'asc' } }, diagnostics).sort, null);
  assert.equal(diagnostics.length, 1);
});

test('並び替えは抽出の値に効かない（affects: view）', () => {
  const key = (sort: unknown) => JSON.stringify(comparisonOptions.extractKeyOf({ ...comparisonOptions.defaultOptions, sort } as never));
  assert.equal(key(null), key({ column: 'totalUnits', direction: 'asc' }));
});
