import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '../shapes/geometry.ts';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { LAYOUTS, type Layout } from './index.ts';
import { buildKeyPatternMatrix } from './key-pattern-picker.ts';
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

test('取り込み形式の自作配列は、Shift出力を持たない', () => {
  const imported = toLayout({
    id: 'user-imported',
    name: 'user-imported',
    rows: ['', '', '', ''],
    romaji: 'kunrei',
    sequences: [['x', [['space', 'j'], ['j']]]],
    legends: [],
  });
  assert.equal(imported.shiftKeys, undefined);
  assert.equal(imported.canonicalInputs.has('Q'), false);
  assert.equal(imported.canonicalInputs.has('!'), false);
});
