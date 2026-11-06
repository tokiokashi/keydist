import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMPARISON_COLUMN_IDS,
  COMPARISON_COLUMNS,
  COMPARISON_DEFAULT_HIDDEN_COLUMNS,
  COMPARISON_UNIT_NOTE,
  comparisonOptions,
  defaultVisibleColumns,
} from './options.ts';
import { COMPARISON_PANE_META } from './pane-meta.ts';

/**
 * 列ごとの表示形式（一律ルールではなく列の宣言に持たせる）。
 * 個数・距離の列は整数、率の列は小数第1位と%の表記になっていることを確認する。列の並びは`COMPARE_HEADERS`と同じ順（`options.ts`の
 * コメント参照）。
 */

test('COMPARISON_COLUMNS: 個数の列は整数のまま（桁を丸めない）', () => {
  assert.equal(COMPARISON_COLUMNS.actions.format(123), '123');
  assert.equal(COMPARISON_COLUMNS.sameFinger.format(7), '7');
});

test('COMPARISON_COLUMNS: 手の切り替えと同じ手の続きは0.5刻みが読める小数第1位', () => {
  assert.equal(COMPARISON_COLUMNS.handSwitches.format(520.5), '520.5');
  assert.equal(COMPARISON_COLUMNS.handSwitches.format(295), '295.0');
  assert.equal(COMPARISON_COLUMNS.handContinuations.format(702.5), '702.5');
});

test('COMPARISON_COLUMNS: 距離は整数（小数第0位）', () => {
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
  assert.equal(COMPARISON_COLUMNS.rightHandDistanceShare.format(48.76), '48.8%');
  assert.equal(COMPARISON_COLUMNS.rightHandPressShare.format(0), '0.0%');
});

test('COMPARISON_COLUMNS: 動いた押下の割合は%付き、動いた押下1回あたりの距離は小数第3位までで%を付けない', () => {
  assert.equal(COMPARISON_COLUMNS.movedPressShare.format(45.4545), '45.5%');
  assert.equal(COMPARISON_COLUMNS.movedPressShare.format(0), '0.0%');
  assert.equal(COMPARISON_COLUMNS.perMovedPressUnits.format(1.23456), '1.235');
  assert.equal(COMPARISON_COLUMNS.perMovedPressUnits.format(0), '0.000');
});

test('COMPARISON_COLUMNS: 文字数に関わる4つの列は小数第3位までで、%を付けない', () => {
  for (const id of ['textCharsPerAction', 'actionsPerUnit', 'textCharsPerUnit', 'unitsPerTextChar'] as const) {
    assert.equal(COMPARISON_COLUMNS[id].format(1.23456), '1.235', id);
    assert.equal(COMPARISON_COLUMNS[id].format(0), '0.000', id);
  }
  assert.deepEqual(
    (['textCharsPerAction', 'actionsPerUnit', 'textCharsPerUnit', 'unitsPerTextChar'] as const).map((id) => COMPARISON_COLUMNS[id].label),
    ['文字/アクション', 'アクション/u', '文字/u', 'u/文字'],
  );
});

test('COMPARISON_COLUMNS: 全34列表示形式が定義されている', () => {
  const ids = Object.keys(COMPARISON_COLUMNS);
  assert.equal(ids.length, 34);
  for (const id of ids) {
    const def = COMPARISON_COLUMNS[id as keyof typeof COMPARISON_COLUMNS];
    assert.equal(typeof def.label, 'string');
    assert.equal(typeof def.format(1), 'string');
  }
});

test('表示する列: 既定は、全列から既定で表示しない列（動いた押下の割合・動いた押下1回あたりの距離・文字数に関わる4つの比）を除いた並び', () => {
  assert.deepEqual(
    [...COMPARISON_DEFAULT_HIDDEN_COLUMNS],
    ['movedPressShare', 'perMovedPressUnits', 'textCharsPerAction', 'actionsPerUnit', 'textCharsPerUnit', 'unitsPerTextChar'],
  );
  const expected = COMPARISON_COLUMN_IDS.filter((id) => !COMPARISON_DEFAULT_HIDDEN_COLUMNS.has(id));
  for (const hidden of COMPARISON_DEFAULT_HIDDEN_COLUMNS) assert.ok(!expected.includes(hidden), hidden);
  // 文字数に関わる4つの列は既定で表示しないが、選べば表示する列に入る
  for (const id of ['textCharsPerAction', 'actionsPerUnit', 'textCharsPerUnit', 'unitsPerTextChar'] as const) {
    assert.ok(!defaultVisibleColumns().includes(id), id);
    assert.ok(COMPARISON_COLUMN_IDS.includes(id), id);
  }
  assert.deepEqual(defaultVisibleColumns(), expected);
  assert.deepEqual(comparisonOptions.defaultOptions.visibleColumns, expected);
});

test('表示する列: 保存値が無い時と配列でない時も、既定で表示しない列を除いた既定へ戻す', () => {
  const expected = defaultVisibleColumns();
  const absent: { path: string; message: string }[] = [];
  assert.deepEqual(comparisonOptions.decodeOptions({}, absent).visibleColumns, expected);
  assert.deepEqual(comparisonOptions.decodeOptions(undefined, absent).visibleColumns, expected);
  assert.deepEqual(absent, []);
  const broken: { path: string; message: string }[] = [];
  assert.deepEqual(comparisonOptions.decodeOptions({ visibleColumns: 'all' }, broken).visibleColumns, expected);
  assert.deepEqual(
    broken.map((item) => item.message),
    ['配列でないため既定の列へ戻しました'],
  );
});

test('表示する列: 既定で表示しない列も、選べば保存値とURLを往復する', () => {
  const chosen = [
    ...defaultVisibleColumns(),
    'movedPressShare',
    'perMovedPressUnits',
    'textCharsPerAction',
    'actionsPerUnit',
    'textCharsPerUnit',
    'unitsPerTextChar',
  ] as const;
  assert.deepEqual(comparisonOptions.decodeOptions({ visibleColumns: chosen }, []).visibleColumns, chosen);
  const params = comparisonOptions.encodeOptionsToUrl({ ...comparisonOptions.defaultOptions, visibleColumns: chosen });
  const diagnostics: { path: string; message: string }[] = [];
  assert.deepEqual(comparisonOptions.decodeOptionsFromUrl(new URLSearchParams(params.toString()), diagnostics).values.visibleColumns, chosen);
  assert.deepEqual(diagnostics, []);
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

test('見出し: 単位は付けず、距離の列の説明に単位uを書く', () => {
  for (const def of Object.values(COMPARISON_COLUMNS)) assert.ok(!def.label.includes('['), def.label);
  assert.equal(COMPARISON_COLUMNS.totalUnits.label, '距離');
  assert.equal(COMPARISON_COLUMNS.adjacentMean.label, '指間平均');
  assert.equal(COMPARISON_COLUMNS.adjacentStdDev.label, '指間σ');
  for (const id of ['totalUnits', 'meanPerStroke', 'perCharUnits', 'adjacentMean', 'adjacentStdDev'] as const) {
    assert.match(COMPARISON_COLUMNS[id].description, /（u(\/アクション|\/かな)?）/, id);
  }
  assert.match(COMPARISON_UNIT_NOTE, /キーの幅を1とした距離/);
});

test('見出し: 全列に説明があり、内部の語や英語のmeanを使わない', () => {
  for (const [id, def] of Object.entries(COMPARISON_COLUMNS)) {
    assert.ok(def.description.length > 0, id);
    for (const word of ['Policy', 'fresh', 'Stroke', 'physical', 'mean']) {
      assert.ok(!def.description.includes(word) && !def.label.includes(word), `${id}: ${word}`);
    }
  }
});

test('見出しのⓘの説明: 全列を列の定義と同じ名前・説明で並べ、単位の説明を添え、内部の語を使わない', () => {
  const help = COMPARISON_PANE_META.help('ja');
  assert.deepEqual(
    help.items.map((item) => item.name),
    COMPARISON_COLUMN_IDS.map((id) => COMPARISON_COLUMNS[id].label),
  );
  assert.deepEqual(
    help.items.map((item) => item.description),
    COMPARISON_COLUMN_IDS.map((id) => COMPARISON_COLUMNS[id].description),
  );
  assert.deepEqual(help.notes, [COMPARISON_UNIT_NOTE]);
  const all = [COMPARISON_PANE_META.description, ...help.notes, help.listLabel, ...help.items.flatMap((item) => [item.name, item.description])].join(
    '\n',
  );
  for (const word of ['Policy', 'fresh', 'Stroke', 'physical', 'mean']) assert.ok(!all.includes(word), word);
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
