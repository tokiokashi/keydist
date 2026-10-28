import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '../shapes/geometry.ts';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { LAYOUTS, type Layout } from './index.ts';
import { buildKeyPatternMatrix } from './key-pattern-picker.ts';
import { importDvorakJ, importVial, type ImportedLayout } from './import.ts';
import { aggregationLegendMap, presentationLayerGuide } from './layers.ts';
import { toLayout, type StageUserLayout } from './user-layouts.ts';

const QWERTY_ROWS: StageUserLayout['rows'] = ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'];
const ENGLISH_QWERTY = LAYOUTS.find((layout) => layout.id === 'qwerty')!;
const SAMPLE = 'Hello, World. The quick brown fox!';

const geometry = buildGeometry('row-staggered');

const userQwerty = (overrides: Partial<StageUserLayout> = {}): Layout =>
  toLayout({ id: 'user-q', name: 'user-q', rows: QWERTY_ROWS, romaji: 'kunrei', ...overrides });

function measure(layout: Layout, text: string) {
  const trace = generateTrace(text, layout, geometry, DEFAULT_TRACE_POLICY);
  const metrics = computeMetrics(trace, geometry);
  return { strokes: metrics.strokes, skipped: trace.skipped, totalUnits: metrics.totalUnits };
}

const shiftPathsOf = (layout: Layout, output: string) =>
  (layout.canonicalInputs.get(output) ?? []).filter((alternative) =>
    alternative.baseRealizations.some((realization) => (realization.defaultTriggerKeys?.length ?? 0) > 0),
  );

test('組み込みのqwertyと同じ段の自作配列は、大文字と記号を含む文でも組み込みと同じ数値になる', () => {
  const builtin = measure(ENGLISH_QWERTY, SAMPLE);
  const user = measure(userQwerty(), SAMPLE);
  assert.equal(user.skipped, 0);
  assert.deepEqual(user, builtin);
});

test('自作のqwertyは、配列の定義と鍵盤の選択肢も組み込みのqwertyと同じになる', () => {
  const builtin = ENGLISH_QWERTY;
  const user = userQwerty();
  assert.deepEqual([...user.canonicalInputs], [...builtin.canonicalInputs]);
  assert.deepEqual([...user.map], [...builtin.map]);
  assert.deepEqual([...user.legends], [...builtin.legends]);
  assert.deepEqual(user.layerDefinitions, builtin.layerDefinitions);
  assert.deepEqual(user.shiftKeys, builtin.shiftKeys);
  assert.deepEqual(buildKeyPatternMatrix(user), buildKeyPatternMatrix(builtin));
});

test('自作配列が大文字や記号を単打で置いている時は、その文字にShift経路を足さない', () => {
  const layout = toLayout({
    kind: 'alpha',
    id: 'user-placed',
    name: 'user-placed',
    rows: ['!234567890-=', 'qwertyuiop[]', "Asdfghjkl;'", 'azxcvbnm,.'],
    romaji: 'kunrei',
  });
  for (const output of ['A', '!']) {
    assert.equal(layout.canonicalInputs.get(output)?.length, 1, `${output}の経路は置いた1つだけ`);
    assert.equal(shiftPathsOf(layout, output).length, 0, `${output}にShift経路が無い`);
  }
  // 置いていない大文字には、組み込みの英字配列と同じくShift経路が付く
  assert.equal(shiftPathsOf(layout, 'B').length, 2);

  const trace = generateTrace('A!', layout, geometry, DEFAULT_TRACE_POLICY);
  assert.equal(trace.skipped, 0);
  // 単打のまま1ステップ1キー。Shiftとの同時押し（2キー）にならない
  assert.deepEqual(
    trace.strokes.map((stroke) => stroke.presses.flatMap((press) => press.keys).length),
    [1, 1],
  );
});

const QWERTY_KC = [
  ['KC_1', 'KC_2', 'KC_3', 'KC_4', 'KC_5', 'KC_6', 'KC_7', 'KC_8', 'KC_9', 'KC_0', 'KC_MINS', 'KC_EQL'],
  ['KC_Q', 'KC_W', 'KC_E', 'KC_R', 'KC_T', 'KC_Y', 'KC_U', 'KC_I', 'KC_O', 'KC_P', 'KC_LBRC', 'KC_RBRC'],
  ['KC_A', 'KC_S', 'KC_D', 'KC_F', 'KC_G', 'KC_H', 'KC_J', 'KC_K', 'KC_L', 'KC_SCOLON', 'KC_QUOTE'],
  ['KC_Z', 'KC_X', 'KC_C', 'KC_V', 'KC_B', 'KC_N', 'KC_M', 'KC_COMMA', 'KC_DOT', 'KC_SLASH'],
];

/** Vialの定義。コンボは [キー, キー, 出力]。`noA` はホーム段左端を空にする */
const vialSource = (combos: [string, string, string][], noA = false): string => {
  const rows = QWERTY_KC.map((row) => [...row]);
  if (noA) rows[2][0] = 'KC_NO';
  return JSON.stringify({
    layout: [rows],
    macro: combos.map(([, , output]) => [['text', output]]),
    combo: combos.map(([first, second], index) => [first, second, 'KC_NO', 'KC_NO', `M${index}`]),
  });
};

const DVORAKJ_BASE = ['[', '  1|2|3|4|5|6|7|8|9|0|-|=|', '  q|w|e|r|t|y|u|i|o|p|[|]|', "  a|s|d|f|g|h|j|k|l|;|'|", '  z|x|c|v|b|n|m|,|.|/|', ']'];

/** 取り込み結果を、取り込み画面が保存するのと同じ形の自作配列にする */
const importedStage = (id: string, imported: ImportedLayout) =>
  toLayout({ kind: 'alpha', id, name: id, rows: imported.rows, sequences: imported.sequences, legends: imported.legends, romaji: 'kunrei' });

const alphaOf = (result: ReturnType<typeof importDvorakJ>) => {
  assert.equal(result.kind, 'alpha');
  return result.kind === 'alpha' ? result.content : assert.fail();
};

const keysOfStrokes = (layout: Layout, text: string) =>
  generateTrace(text, layout, geometry, DEFAULT_TRACE_POLICY).strokes.map((stroke) => stroke.presses.flatMap((press) => press.keys.map((key) => key.id)));

test('取り込んだ配列は、定義ファイルに無い大文字と記号を左右どちらのShiftでも打てる', () => {
  const layout = importedStage('imported-vial', importVial(vialSource([])));
  assert.deepEqual(layout.shiftKeys, ['shift-l', 'shift-r']);
  for (const output of ['A', 'B', '!', '?']) {
    assert.equal(shiftPathsOf(layout, output).length, 2, `${output}にShiftの経路が左右の2つ`);
  }
  const trace = generateTrace('Ab!?', layout, geometry, DEFAULT_TRACE_POLICY);
  assert.equal(trace.skipped, 0);
  // AとBは左手のキーなので右のShift、!は左手の `1` なので右のShift、?は右手の `/` なので左のShift
  assert.deepEqual(keysOfStrokes(layout, 'A'), [['shift-r', 'a']]);
  assert.deepEqual(keysOfStrokes(layout, '?'), [['shift-l', '/']]);
});

test('取り込んだ配列のShiftは、Shiftが出力のキーより先の要件を持つ', () => {
  const layout = importedStage('imported-vial', importVial(vialSource([])));
  const alternatives = layout.canonicalInputs.get('B') ?? [];
  assert.equal(alternatives.length, 2);
  for (const alternative of alternatives) {
    const input = alternative.semanticInputs[0];
    const shift = input.roles.find((role) => role.role === 'modifier')!.key;
    assert.deepEqual(input.requirements, [
      { kind: 'overlap', keys: ['b', shift].sort() },
      { kind: 'order', before: [shift], after: ['b'] },
    ]);
  }
});

test('コンボで置いた大文字と記号には、Shiftの経路を足さない', () => {
  const imported = importVial(
    vialSource([
      ['KC_F', 'KC_J', 'A'],
      ['KC_D', 'KC_K', '!'],
    ]),
  );
  const layout = importedStage('imported-combo', imported);
  for (const output of ['A', '!']) {
    assert.equal(layout.canonicalInputs.get(output)?.length, 1, `${output}の経路はコンボの1つだけ`);
    assert.equal(shiftPathsOf(layout, output).length, 0, `${output}にShiftの経路が無い`);
  }
  // 置いていない大文字には、Shiftの経路が付く
  assert.equal(shiftPathsOf(layout, 'B').length, 2);
  assert.deepEqual(keysOfStrokes(layout, 'A!'), [
    ['f', 'j'],
    ['d', 'k'],
  ]);
  assert.equal(generateTrace('A!B', layout, geometry, DEFAULT_TRACE_POLICY).skipped, 0);
});

test('切り替えのキーの面で置いた大文字と記号には、Shiftの経路を足さない', () => {
  const source = ['-option-input[', '  {F} | +21', ']', ...DVORAKJ_BASE, '({F}[', '  |||', '  A|!|', ']'].join('\n');
  const content = alphaOf(importDvorakJ(source));
  const layout = toLayout({ ...content, id: 'imported-face', romaji: 'kunrei' });
  // 面で置いた出力の経路は、その面の切り替えのキーを使う1つだけで、Shiftのキーは使わない
  const shiftKeyPaths = (output: string) =>
    (layout.canonicalInputs.get(output) ?? []).filter((alternative) =>
      alternative.baseRealizations.some((realization) => (realization.defaultTriggerKeys ?? []).some((key) => key === 'shift-l' || key === 'shift-r')),
    );
  for (const output of ['A', '!']) {
    assert.equal(layout.canonicalInputs.get(output)?.length, 1, `${output}の経路は面の1つだけ`);
    assert.equal(shiftKeyPaths(output).length, 0, `${output}にShiftの経路が無い`);
  }
  assert.equal(shiftKeyPaths('B').length, 2);
  assert.equal(generateTrace('A!B', layout, geometry, DEFAULT_TRACE_POLICY).skipped, 0);
});

test('小文字を単打で置かず、コンボだけで置いた配列では、その大文字にShiftの経路が付かない', () => {
  const layout = importedStage('imported-no-single', importVial(vialSource([['KC_F', 'KC_J', 'a']], true)));
  assert.equal(layout.canonicalInputs.get('a')?.length, 1);
  assert.equal(shiftPathsOf(layout, 'a').length, 0);
  assert.equal(layout.canonicalInputs.has('A'), false);
  assert.equal(generateTrace('A', layout, geometry, DEFAULT_TRACE_POLICY).skipped, 1);
  // 単打で置いた小文字の大文字は打てる
  assert.equal(shiftPathsOf(layout, 'B').length, 2);
});

test('取り込んだ配列のShiftの層は、実際の出力を表示し、基底の凡例は定義ファイルのまま', () => {
  const imported = importVial(vialSource([['KC_F', 'KC_J', 'A']]));
  const layout = importedStage('imported-guide', imported);
  const guide = presentationLayerGuide(layout, 'layer:Shift');
  assert.ok(guide);
  assert.equal(guide.legends.get('b'), 'B');
  assert.equal(guide.legends.get('1'), '!');
  // コンボで置いたAは、Shiftの層に載らない
  assert.equal(aggregationLegendMap(layout, 'layer:Shift').has('a'), false);
  assert.equal(guide.legends.has('a'), false);
  for (const [key, label] of imported.legends) {
    if (key === 'shift-l' || key === 'shift-r') continue;
    assert.equal(layout.legends.get(key), label, `${key}の凡例は定義ファイルの表示`);
  }
  assert.equal(layout.legends.get('shift-l'), 'Shift');
  assert.equal(layout.legends.get('shift-r'), 'Shift');
});

test('定義ファイルがShiftキーに付けた凡例は、Shiftの凡例で上書きしない', () => {
  const layout = toLayout({
    kind: 'alpha',
    id: 'imported-shift-legend',
    name: 'imported-shift-legend',
    rows: QWERTY_ROWS,
    sequences: [['x', [['x']]]],
    legends: [['shift-l', 'KC_LSFT']],
    romaji: 'kunrei',
  });
  assert.equal(layout.legends.get('shift-l'), 'KC_LSFT');
  assert.equal(layout.legends.get('shift-r'), 'Shift');
});
