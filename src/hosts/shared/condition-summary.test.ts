import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { DEFAULT_FINGER_ASSIGNMENT, PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES, resolveSettings, setSettingsOverride, type SettingsItemId } from '#engine/settings-items.ts';
import { resolveSetupForText } from '#input/setup/index.ts';
import { DEFAULT_CHAIN_INTERPRETATION } from '#interpretation/structure/chain.ts';
import { DEFAULT_ARPEGGIO_INTERPRETATION } from '#interpretation/structure/arpeggio.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import {
  conditionHeaderInfo,
  conditionHeaderInfoFromResolvedInput,
  conditionSummaryLine,
  conditionDiagnosticText,
  formatOrigin,
  globalConditionValues,
  multiTargetConditionSummary,
  nonDefaultConditionRows,
  type ConditionSummaryRow,
  summarizeNonDefaultConditions,
  traceConditionSummary,
} from './condition-summary.ts';

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};
const NO_USER_LAYOUTS = new Map();

function setupFor(layoutId: string, shapeId = 'row-staggered'): Setup {
  return { id: 'setup-1', number: 1, layoutId, shapeId };
}

test('traceConditionSummary: 既定値のみなら全項目がdefault originになる', () => {
  const resolution = resolveSetupForText(setupFor('qwerty'), CATALOG, NO_USER_LAYOUTS, 'en');
  assert.ok(resolution.ok);
  if (!resolution.ok) return;
  const cascade = resolveSettings(EMPTY_SETTINGS_OVERRIDES, resolution.context);
  const rows = traceConditionSummary(cascade);
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.equal(row.origin.kind, row.id === 'fingerAssignmentId' || row.id === 'romajiRuleId' ? row.origin.kind : 'default');
  }
  const windowSize = rows.find((row) => row.id === 'windowSize');
  assert.equal(windowSize?.format, 'primitive');
  assert.equal(windowSize?.displayValue, '3');
});

test('traceConditionSummary: setupレベルで上書きすると出どころがそのレベルになる', () => {
  const resolution = resolveSetupForText(setupFor('qwerty'), CATALOG, NO_USER_LAYOUTS, 'en');
  assert.ok(resolution.ok);
  if (!resolution.ok) return;
  const written = setSettingsOverride(
    EMPTY_SETTINGS_OVERRIDES,
    { kind: 'setup', setupId: 'setup-1' },
    'windowSize',
    5,
  );
  assert.ok(written.ok);
  const cascade = resolveSettings(written.ok ? written.overrides : EMPTY_SETTINGS_OVERRIDES, resolution.context);
  const rows = traceConditionSummary(cascade);
  const windowSize = rows.find((row) => row.id === 'windowSize');
  assert.equal(windowSize?.displayValue, '5');
  assert.deepEqual(windowSize?.origin, { kind: 'setup', setupId: 'setup-1' });
  assert.equal(formatOrigin(windowSize!.origin), '上書き: このSetup');
});

test('traceConditionSummary: シフト系キーの項目もオブジェクトのまま出さず、短い値へ要約する', () => {
  const resolution = resolveSetupForText(setupFor('qwerty'), CATALOG, NO_USER_LAYOUTS, 'en');
  assert.ok(resolution.ok);
  if (!resolution.ok) return;
  const cascade = resolveSettings(EMPTY_SETTINGS_OVERRIDES, resolution.context);
  const rows = traceConditionSummary(cascade);
  const trigger = rows.find((row) => row.id === 'triggerRealizationPolicy');
  assert.equal(trigger?.format, 'primitive');
});

test('conditionHeaderInfo: 配列・物理配列・指割当の名前を集める', () => {
  const resolution = resolveSetupForText(setupFor('qwerty'), CATALOG, NO_USER_LAYOUTS, 'en');
  assert.ok(resolution.ok);
  if (!resolution.ok) return;
  const info = conditionHeaderInfo(resolution.layout, resolution.shape, DEFAULT_FINGER_ASSIGNMENT);
  assert.equal(info.layoutName, resolution.layout.name);
  assert.equal(info.shapeName, resolution.shape.name);
  assert.equal(info.fingerAssignmentName, DEFAULT_FINGER_ASSIGNMENT.name);
});

test('conditionHeaderInfoFromResolvedInput: ResolvedInputのgeometryから名前を集める', () => {
  const result = resolveEngineInput({
    target: { kind: 'setup', setupId: (setupFor('qwerty')).id },
    setups: new Map([[(setupFor('qwerty')).id, setupFor('qwerty')]]),
    catalog: CATALOG,
    userLayouts: NO_USER_LAYOUTS,
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: 'hello',
    language: 'en',
  });
  assert.ok(result.ok);
  if (!result.ok) return;
  const info = conditionHeaderInfoFromResolvedInput(result.input.layout, result.input.geometry);
  assert.equal(info.layoutName, result.input.layout.name);
  assert.equal(info.shapeName, result.input.geometry.name);
  assert.equal(info.fingerAssignmentName, result.input.geometry.assignment.name);
});

function resolveWith(
  target: { kind: 'layout'; layoutId: string } | { kind: 'setup'; setupId: string },
  setups: readonly Setup[],
  overrides: typeof EMPTY_SETTINGS_OVERRIDES,
  language: 'en' | 'ja',
) {
  const result = resolveEngineInput({
    target,
    setups: new Map(setups.map((setup) => [setup.id, setup])),
    catalog: CATALOG,
    userLayouts: NO_USER_LAYOUTS,
    overrides,
    text: language === 'ja' ? 'あいうえお' : 'hello',
    language,
  });
  assert.ok(result.ok);
  if (!result.ok) throw new Error('unreachable');
  return result.input;
}

test('nonDefaultConditionRows: 効かない行（Setup対象の既定の物理配列）は上書きされていても併記しない', () => {
  const written = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'defaultShapeId', 'ortholinear');
  assert.ok(written.ok);
  if (!written.ok) return;
  const setups = [setupFor('qwerty'), { ...setupFor('colemak-dh'), id: 'setup-2' }];
  for (const setup of setups) {
    const input = resolveWith({ kind: 'setup', setupId: setup.id }, setups, written.overrides, 'en');
    const rows = nonDefaultConditionRows(traceConditionSummary(input.cascade, { shapes: CATALOG.shapes }));
    assert.deepEqual(rows.map((row) => row.id), []);
    assert.equal(summarizeNonDefaultConditions(rows), undefined);
  }
});

test('traceConditionSummary: 既定の物理配列はidでなく物理配列名で出す', () => {
  const written = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'defaultShapeId', 'ortholinear');
  assert.ok(written.ok);
  if (!written.ok) return;
  const input = resolveWith({ kind: 'layout', layoutId: 'qwerty' }, [], written.overrides, 'en');
  const row = traceConditionSummary(input.cascade, CATALOG).find((r) => r.id === 'defaultShapeId')!;
  assert.equal(row.displayValue, PHYSICAL_SHAPES.ortholinear.name);
  assert.equal(row.originLabel, '上書き: 全体');
});

test('nonDefaultConditionRows: 既定の物理配列は物理配列名として別に出しているので、併記には含めない', () => {
  const written = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'defaultShapeId', 'ortholinear');
  assert.ok(written.ok);
  if (!written.ok) return;
  const input = resolveWith({ kind: 'layout', layoutId: 'qwerty' }, [], written.overrides, 'en');
  const rows = nonDefaultConditionRows(traceConditionSummary(input.cascade, CATALOG));
  assert.deepEqual(rows.map((row) => row.id), []);
});

test('traceConditionSummary: 値・上書きの置き場所のidは名前へ引き、引けないidも画面に出さない', () => {
  let overrides = EMPTY_SETTINGS_OVERRIDES;
  for (const [level, id, value] of [
    [{ kind: 'layout', layoutId: 'qwerty' }, 'romajiRuleId', 'kunrei'],
    [{ kind: 'shape', shapeId: 'row-staggered' }, 'fingerAssignmentId', 'finger-deleted-custom'],
  ] as const) {
    const written = setSettingsOverride(overrides, level, id, value);
    assert.ok(written.ok, id);
    if (!written.ok) return;
    overrides = written.overrides;
  }
  const input = resolveWith({ kind: 'layout', layoutId: 'qwerty' }, [], overrides, 'ja');
  const rows = traceConditionSummary(input.cascade, CATALOG);
  const romaji = rows.find((row) => row.id === 'romajiRuleId')!;
  assert.match(romaji.displayValue, /訓令式/);
  assert.equal(romaji.originLabel, `上書き: 配列「${LAYOUT_BY_ID.get('qwerty')!.name}」`);
  const finger = rows.find((row) => row.id === 'fingerAssignmentId')!;
  assert.equal(finger.originLabel, `上書き: 物理配列「${PHYSICAL_SHAPES['row-staggered'].name}」`);
  for (const row of rows) {
    const texts = [row.label, row.displayValue, row.originLabel, ...row.diagnostics.map((d) => conditionDiagnosticText(row, d) ?? '')];
    for (const text of texts) assert.doesNotMatch(text, /finger-deleted-custom|kunrei|row-staggered|qwerty|Realization|Policy/, text);
  }
});

test('conditionDiagnosticText: 項目id・レベル名を含む診断文は出さず、「効かない」は行の目印に任せる', () => {
  const row = { id: 'windowSize', label: '先読みN' } as ConditionSummaryRow;
  assert.equal(conditionDiagnosticText(row, { kind: 'not-applicable', message: '項目「windowSize」は効かない' }), undefined);
  const ignored = conditionDiagnosticText(row, { kind: 'ignored-disallowed-level', message: '項目「windowSize」のsetupレベル' })!;
  assert.match(ignored, /先読みN/);
  assert.doesNotMatch(ignored, /windowSize|setup/);
});

test('nonDefaultConditionRows: かな直接の配列ではローマ字規則の上書きを併記しない', () => {
  const written = setSettingsOverride(
    EMPTY_SETTINGS_OVERRIDES,
    { kind: 'layout', layoutId: 'nicola' },
    'romajiRuleId',
    'hepburn',
  );
  assert.ok(written.ok);
  if (!written.ok) return;
  const input = resolveWith({ kind: 'layout', layoutId: 'nicola' }, [], written.overrides, 'ja');
  const summary = traceConditionSummary(input.cascade);
  assert.equal(summary.find((row) => row.id === 'romajiRuleId')?.origin.kind, 'layout');
  assert.deepEqual(nonDefaultConditionRows(summary).map((row) => row.id), []);
});

function withGlobalRomaji(ruleId: string) {
  const written = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'romajiRuleId', ruleId);
  assert.ok(written.ok);
  if (!written.ok) throw new Error('unreachable');
  return written.overrides;
}

test('全体のローマ字規則: 推奨の無いローマ字入力の配列だけが変えた項目に数える。大西配列・かな配列は数えない', () => {
  const overrides = withGlobalRomaji('azik');
  const rowsOf = (layoutId: string) => traceConditionSummary(
    resolveWith({ kind: 'layout', layoutId }, [], overrides, 'ja').cascade,
    CATALOG,
  );
  const qwerty = rowsOf('qwerty');
  assert.deepEqual(nonDefaultConditionRows(qwerty).map((row) => row.id), ['romajiRuleId']);
  assert.equal(qwerty.find((row) => row.id === 'romajiRuleId')!.originLabel, '上書き: 全体');

  // 大西配列・TK音直入力法は推奨のまま（数えない）。負けた全体は行の印から分かる
  for (const layoutId of ['oonishi', 'oonishi-custom']) {
    const rows = rowsOf(layoutId);
    assert.equal(conditionSummaryLine(rows).changedCount, 0, layoutId);
    assert.equal(rows.find((row) => row.id === 'romajiRuleId')!.recommendationWinsOverGlobal, true, layoutId);
  }
  // かな配列は効かないので数えない
  const nicola = rowsOf('nicola');
  assert.equal(nicola.find((row) => row.id === 'romajiRuleId')!.applicable, false);
  assert.equal(conditionSummaryLine(nicola).changedCount, 0);
});

test('全体未設定でも、大西配列は推奨が全体の既定に勝つので理由の印が立つ。TK音直入力法と QWERTY は立たない', () => {
  const flagOf = (layoutId: string) => traceConditionSummary(
    resolveWith({ kind: 'layout', layoutId }, [], EMPTY_SETTINGS_OVERRIDES, 'ja').cascade,
    CATALOG,
  ).find((row) => row.id === 'romajiRuleId')!;
  const oonishi = flagOf('oonishi');
  assert.equal(oonishi.recommendationWinsOverGlobal, true);
  assert.equal(oonishi.origin.kind, 'default');
  assert.equal(flagOf('oonishi-custom').recommendationWinsOverGlobal, false);
  assert.equal(flagOf('qwerty').recommendationWinsOverGlobal, false);
});

test('全体のローマ字規則: 共通の行は全体の値で、推奨を持つ対象だけが差に出る（効かない対象は数えない）', () => {
  const overrides = withGlobalRomaji('azik');
  const summary = summarize(setupTargets([
    { layoutId: 'qwerty', shapeId: 'row-staggered' },
    { layoutId: 'oonishi', shapeId: 'row-staggered' },
    { layoutId: 'nicola', shapeId: 'row-staggered' },
  ], 'ja', overrides));
  const common = summary.rows.find((row) => row.id === 'romajiRuleId')!;
  assert.equal(common.originLabel, '上書き: 全体');
  assert.equal(common.displayValue.startsWith('AZIK'), true);
  assert.deepEqual(diffValue(summary, 'romajiRuleId').map(([key]) => key), ['t2']);
});

test('traceConditionSummary: シフト系キーの2項目は選べる主な値で出す（「(詳細設定)」にしない）', () => {
  const defaults = traceConditionSummary(resolveWith({ kind: 'layout', layoutId: 'qwerty' }, [], EMPTY_SETTINGS_OVERRIDES, 'en').cascade, CATALOG);
  const hold = defaults.find((row) => row.id === 'triggerRealizationPolicy')!;
  const action = defaults.find((row) => row.id === 'actionRealizationPolicy')!;
  assert.equal(hold.label, 'シフト系キーの押し続け');
  assert.equal(hold.displayValue, 'しない');
  assert.equal(action.label, '動作数の扱い');
  assert.equal(action.displayValue, 'Shift+A で1動作');

  let overrides = EMPTY_SETTINGS_OVERRIDES;
  for (const [id, value] of [
    ['triggerRealizationPolicy', { useHold: true }],
    ['actionRealizationPolicy', {
      triggerActivation: 'semantic',
      triggerActivationClassOverrides: { 'order-free': 'separate' },
      triggerActivationOverrides: [],
    }],
  ] as const) {
    const written = setSettingsOverride(overrides, { kind: 'global' }, id, value as never);
    assert.ok(written.ok, id);
    if (!written.ok) return;
    overrides = written.overrides;
  }
  const rows = traceConditionSummary(resolveWith({ kind: 'layout', layoutId: 'qwerty' }, [], overrides, 'en').cascade, CATALOG);
  assert.equal(rows.find((row) => row.id === 'triggerRealizationPolicy')!.displayValue, 'する');
  assert.equal(rows.find((row) => row.id === 'actionRealizationPolicy')!.displayValue, 'Shift→A で2動作（例外あり）');
  for (const row of rows) assert.doesNotMatch(row.displayValue, /[()]/, row.displayValue);
});

test('traceConditionSummary: 1動作の時は、残っている例外を出さない', () => {
  const written = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'actionRealizationPolicy', {
    triggerActivation: 'disabled',
    triggerActivationClassOverrides: { 'order-free': 'separate' },
    triggerActivationOverrides: [],
  } as never);
  assert.ok(written.ok);
  if (!written.ok) return;
  const rows = traceConditionSummary(resolveWith({ kind: 'layout', layoutId: 'qwerty' }, [], written.overrides, 'en').cascade, CATALOG);
  assert.equal(rows.find((row) => row.id === 'actionRealizationPolicy')!.displayValue, 'Shift+A で1動作');
});

test('チェーン・アルペジオを全体で変えても、要約の数にも対象名の差分にも出ない（今の画面に読む数値が無い）', () => {
  const rows = overrideRows([
    ['chainInterpretation', { ...DEFAULT_CHAIN_INTERPRETATION, breakOnTriggerOnly: true }],
    ['arpeggioInterpretation', { ...DEFAULT_ARPEGGIO_INTERPRETATION, includeThumb: true }],
  ]);
  assert.equal(rows.some((row) => row.id === 'chainInterpretation' || row.id === 'arpeggioInterpretation'), false);
  assert.equal(conditionSummaryLine(rows).changedCount, 0);
  assert.equal(summarizeNonDefaultConditions(nonDefaultConditionRows(rows)), undefined);
});

function overrideRows(entries: readonly (readonly [string, unknown])[]): readonly ConditionSummaryRow[] {
  let overrides = EMPTY_SETTINGS_OVERRIDES;
  for (const [id, value] of entries) {
    const written = setSettingsOverride(overrides, { kind: 'global' }, id as never, value as never);
    assert.ok(written.ok, id);
    if (!written.ok) throw new Error(id);
    overrides = written.overrides;
  }
  return traceConditionSummary(resolveWith({ kind: 'layout', layoutId: 'qwerty' }, [], overrides, 'en').cascade, CATALOG);
}

test('conditionSummaryLine: 何も変えていなければ変えた項目は0件', () => {
  const line = conditionSummaryLine(overrideRows([]));
  assert.equal(line.changedCount, 0);
  assert.deepEqual(line.shown, []);
  assert.equal(line.restCount, 0);
});

test('conditionSummaryLine: 変えた項目の先頭2件（項目の定義順）と残りの件数', () => {
  // 書いた順ではなく項目の定義順で先頭2件を取る。
  const rows = overrideRows([
    ['triggerRealizationPolicy', { useHold: true }],
    ['sfbHomeCost', false],
    ['windowSize', 5],
  ]);
  const line = conditionSummaryLine(rows);
  assert.equal(line.changedCount, 3);
  assert.deepEqual(line.shown.map((row) => row.id), ['windowSize', 'sfbHomeCost']);
  assert.equal(line.restCount, 1);
});

test('conditionSummaryLine: 効かない上書きは変えた項目に数えない', () => {
  const rows = overrideRows([['windowSize', 5]]).map((row) => (
    row.id === 'windowSize' ? { ...row, applicable: false } : row
  ));
  assert.equal(conditionSummaryLine(rows).changedCount, 0);
});

test('数えない時に例外だけ違う上書きは、変えた項目にも対象名の差分にも入れない', () => {
  const rows = overrideRows([['actionRealizationPolicy', {
    triggerActivation: 'disabled',
    triggerActivationClassOverrides: { 'order-free': 'separate' },
    triggerActivationOverrides: [],
  }]]);
  const action = rows.find((row) => row.id === 'actionRealizationPolicy')!;
  assert.equal(action.origin.kind, 'global');
  assert.equal(conditionSummaryLine(rows).changedCount, 0);
  assert.deepEqual(nonDefaultConditionRows(rows).map((row) => row.id), []);
  assert.equal(summarizeNonDefaultConditions(nonDefaultConditionRows(rows)), undefined);
});

test('数える時の上書きは、変えた項目にも対象名の差分にも入る', () => {
  const rows = overrideRows([['actionRealizationPolicy', {
    triggerActivation: 'semantic',
    triggerActivationClassOverrides: {},
    triggerActivationOverrides: [],
  }]]);
  assert.equal(conditionSummaryLine(rows).changedCount, 1);
  assert.deepEqual(nonDefaultConditionRows(rows).map((row) => row.id), ['actionRealizationPolicy']);
});

type SettingWrite = readonly [string, 'windowSize' | 'sfbHomeCost' | 'preferOppositeThumb', number | boolean];

/** setup-1..n（すべてqwerty）へ、Setupのレベルで上書きを書いた状態の、対象ごとの条件。 */
function targetsWith(
  global: readonly SettingWrite[],
  bySetup: readonly (readonly SettingWrite[])[],
  language: 'en' | 'ja' = 'en',
) {
  let overrides = EMPTY_SETTINGS_OVERRIDES;
  const write = (level: Parameters<typeof setSettingsOverride>[1], id: SettingWrite[1], value: number | boolean) => {
    const written = setSettingsOverride(overrides, level, id, value as never);
    assert.ok(written.ok, id);
    if (written.ok) overrides = written.overrides;
  };
  for (const [, id, value] of global) write({ kind: 'global' }, id, value);
  const setups = bySetup.map((_, i) => ({ ...setupFor('qwerty'), id: `s${i + 1}` }));
  bySetup.forEach((writes, i) => {
    for (const [, id, value] of writes) write({ kind: 'setup', setupId: `s${i + 1}` }, id, value);
  });
  return withOverrides(setups.map((setup) => {
    const input = resolveWith({ kind: 'setup', setupId: setup.id }, setups, overrides, language);
    return { key: setup.id, label: `Setup ${setup.id}`, rows: traceConditionSummary(input.cascade, CATALOG) };
  }), overrides);
}

/** 対象ごとの条件に、それを解決した上書きを添える（共通の行は全体のレベルの値から作るため）。 */
function withOverrides<T extends readonly object[]>(targets: T, overrides: typeof EMPTY_SETTINGS_OVERRIDES) {
  return Object.assign([...targets], { overrides }) as unknown as T & { overrides: typeof EMPTY_SETTINGS_OVERRIDES };
}

function summarize(built: ReturnType<typeof targetsWith>, options: { excludeIds?: SettingsItemId[] } = {}) {
  return multiTargetConditionSummary(built, { ...options, globalValues: globalConditionValues(built.overrides) });
}

test('multiTargetConditionSummary: 全対象が同じ条件なら差の節は空で、共通の行は出どころつき', () => {
  const summary = summarize(targetsWith([['g', 'windowSize', 5]], [[], []]));
  assert.deepEqual(summary.diffs, []);
  const n = summary.rows.find((row) => row.id === 'windowSize')!;
  assert.equal(n.displayValue, '5');
  assert.equal(n.originLabel, '上書き: 全体');
  assert.equal(conditionSummaryLine(summary.rows).changedCount, 1);
});

test('multiTargetConditionSummary: 1つだけNが違う時、共通のNは画面の値で、違う対象だけが差に出る', () => {
  const summary = summarize(targetsWith([], [[], [['s', 'windowSize', 2]], []]));
  const n = summary.rows.find((row) => row.id === 'windowSize')!;
  assert.equal(n.displayValue, '3');
  assert.equal(n.originLabel, '既定値');
  assert.deepEqual(summary.diffs, [
    { key: 's2', label: 'Setup s2', items: [{ id: 'windowSize', label: '先読みN', displayValue: '2' }] },
  ]);
  assert.equal(conditionSummaryLine(summary.rows).changedCount, 0);
});

test('multiTargetConditionSummary: 別々の項目で違えば、それぞれ違う項目だけを持つ。効かない上書き（親指キーの無い配列の親指シフト振り替え）は数えない', () => {
  const summary = summarize(targetsWith([], [
    [['s', 'windowSize', 2], ['s', 'preferOppositeThumb', true]],
    [['s', 'sfbHomeCost', false]],
    [],
  ]));
  assert.deepEqual(summary.diffs.map((d) => [d.key, d.items.map((i) => i.id)]), [
    ['s1', ['windowSize']],
    ['s2', ['sfbHomeCost']],
  ]);
});

test('multiTargetConditionSummary: 全体の上書きと同じ値を対象ごとに書いても差にしない', () => {
  const same = summarize(targetsWith([['g', 'windowSize', 4]], [[['s', 'windowSize', 4]], []]));
  assert.deepEqual(same.diffs, []);
  assert.equal(same.rows.find((row) => row.id === 'windowSize')!.originLabel, '上書き: 全体');
});

test('multiTargetConditionSummary: 全対象が同じ値へ上書きしても、共通の行は画面の値のまま、全対象が差に出る', () => {
  const summary = summarize(targetsWith([], [[['s', 'windowSize', 2]], [['s', 'windowSize', 2]]]));
  const n = summary.rows.find((row) => row.id === 'windowSize')!;
  assert.equal(n.displayValue, '3');
  assert.equal(n.originLabel, '既定値');
  assert.deepEqual(summary.diffs.map((d) => [d.key, d.items.map((i) => i.displayValue)]), [['s1', ['2']], ['s2', ['2']]]);
});

/** Setup（配列 + 物理配列）を並べた時の、対象ごとの条件。 */
function setupTargets(
  specs: readonly { layoutId: string; shapeId: string }[],
  language: 'en' | 'ja',
  overrides: typeof EMPTY_SETTINGS_OVERRIDES = EMPTY_SETTINGS_OVERRIDES,
) {
  const setups = specs.map((spec, i) => ({ id: `t${i + 1}`, number: i + 1, ...spec }));
  return withOverrides(setups.map((setup) => {
    const input = resolveWith({ kind: 'setup', setupId: setup.id }, setups, overrides, language);
    return { key: setup.id, label: setup.id, rows: traceConditionSummary(input.cascade, CATALOG) };
  }), overrides);
}

function diffValue(summary: ReturnType<typeof multiTargetConditionSummary>, id: SettingsItemId) {
  return summary.diffs.map((d) => [d.key, d.items.find((i) => i.id === id)?.displayValue] as const);
}

test('multiTargetConditionSummary: ANSIとJISのQWERTYは、共通の指の割当は列固定で、JISだけが差に出る', () => {
  const summary = summarize(setupTargets([
    { layoutId: 'qwerty', shapeId: 'row-staggered' },
    { layoutId: 'qwerty', shapeId: 'jis-row-staggered' },
  ], 'en'));
  assert.equal(summary.rows.find((row) => row.id === 'fingerAssignmentId')!.displayValue, '既定（列固定）');
  assert.deepEqual(diffValue(summary, 'fingerAssignmentId'), [['t2', 'JIS既定（列固定）']]);
});

test('multiTargetConditionSummary: QWERTYと大西配列は、並びによらず共通は訓令式で、大西配列だけが差に出る', () => {
  const specs = [{ layoutId: 'qwerty', shapeId: 'row-staggered' }, { layoutId: 'oonishi', shapeId: 'row-staggered' }];
  for (const ordered of [specs, [...specs].reverse()]) {
    const summary = summarize(setupTargets(ordered, 'ja'));
    const common = summary.rows.find((row) => row.id === 'romajiRuleId')!;
    assert.equal(common.displayValue, '訓令式（si / sya / zi / zya）');
    assert.equal(common.originLabel, '既定値');
    assert.equal(summary.diffs.length, 1);
    assert.equal(summary.diffs[0]!.items.find((i) => i.id === 'romajiRuleId')!.displayValue.startsWith('大西'), true);
  }
});

test('multiTargetConditionSummary: 物理配列のレベルの上書きが片方の対象にしか効かない時も、その対象だけが差に出る', () => {
  const written = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'shape', shapeId: 'ortholinear' }, 'fingerAssignmentId', 'jis-default');
  assert.ok(written.ok);
  if (!written.ok) return;
  const summary = summarize(setupTargets([
    { layoutId: 'qwerty', shapeId: 'row-staggered' },
    { layoutId: 'qwerty', shapeId: 'ortholinear' },
  ], 'en', written.overrides));
  assert.equal(summary.rows.find((row) => row.id === 'fingerAssignmentId')!.displayValue, '既定（列固定）');
  assert.deepEqual(diffValue(summary, 'fingerAssignmentId'), [['t2', 'JIS既定（列固定）']]);
});

test('multiTargetConditionSummary: 全体で指の割当を変え、全対象がSetupで別の値に上書きしても、共通の行は全体の値で、差は全対象', () => {
  let overrides = EMPTY_SETTINGS_OVERRIDES;
  const write = (level: Parameters<typeof setSettingsOverride>[1], value: string) => {
    const written = setSettingsOverride(overrides, level, 'fingerAssignmentId', value);
    assert.ok(written.ok);
    if (written.ok) overrides = written.overrides;
  };
  write({ kind: 'global' }, 'jis-default');
  write({ kind: 'setup', setupId: 't1' }, 'default');
  write({ kind: 'setup', setupId: 't2' }, 'default');
  const summary = summarize(setupTargets([
    { layoutId: 'qwerty', shapeId: 'row-staggered' },
    { layoutId: 'qwerty', shapeId: 'row-staggered' },
  ], 'en', overrides));
  const common = summary.rows.find((row) => row.id === 'fingerAssignmentId')!;
  assert.equal(common.displayValue, 'JIS既定（列固定）');
  assert.equal(common.origin.kind, 'global');
  assert.deepEqual(diffValue(summary, 'fingerAssignmentId'), [['t1', '既定（列固定）'], ['t2', '既定（列固定）']]);
});

test('multiTargetConditionSummary: excludeIdsの項目は共通の行にも差にも出ない', () => {
  const summary = summarize(
    targetsWith([], [[['s', 'windowSize', 2], ['s', 'sfbHomeCost', false]], []]),
    { excludeIds: ['windowSize'] },
  );
  assert.equal(summary.rows.some((row) => row.id === 'windowSize'), false);
  assert.deepEqual(summary.diffs[0]!.items.map((i) => i.id), ['sfbHomeCost']);
});

test('multiTargetConditionSummary: 対象が無ければ空', () => {
  assert.deepEqual(multiTargetConditionSummary([], { globalValues: {} }), { rows: [], diffs: [] });
});
