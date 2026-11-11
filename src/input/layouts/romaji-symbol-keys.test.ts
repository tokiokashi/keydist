import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { prepareEvaluationText } from '#input/text/evaluation-text.ts';
import { DEFAULT_TRACE_POLICY, generateTrace, uncoveredTextPositions } from '#trace/generate.ts';
import { LAYOUT_BY_ID, LAYOUTS } from './index.ts';

const geometry = buildGeometry('row-staggered');

/** 記号の範囲を広げた日本語のかなテキストを、アプリと同じ前処理を通して打つ。 */
function typeWithSymbols(layoutId: string, text: string) {
  const layout = LAYOUT_BY_ID.get(layoutId)!;
  const prepared = prepareEvaluationText(text, {
    language: 'ja',
    keepSymbols: true,
    keepAlphanumerics: false,
    layoutHasChar: (char) => layout.canonicalInputs.has(char),
    uncoveredPositions: (positions) => uncoveredTextPositions(positions, layout),
  });
  const trace = generateTrace(prepared, layout, geometry, DEFAULT_TRACE_POLICY);
  return { trace, keys: trace.strokes.map((stroke) => stroke.presses.flatMap((press) => press.keys.map((key) => key.id)).sort()) };
}

test('大西配列は、日本語の評価で`・`を数字段の右端のキーで、`？`をShiftを足して打つ', () => {
  const { trace, keys } = typeWithSymbols('oonishi', '・？');
  assert.equal(trace.skipped, 0);
  assert.deepEqual(trace.errors, []);
  assert.deepEqual(keys[0], ['-']);
  assert.deepEqual(keys[1], ['-', 'shift-l']);
});

test('TK音直入力法は、`・`と`？`を、`/`を置いたキー（QWERTYの`b`の位置）で打つ', () => {
  const { trace, keys } = typeWithSymbols('tk-onchoku', '・？');
  assert.equal(trace.skipped, 0);
  assert.deepEqual(keys[0], ['b']);
  assert.deepEqual(keys[1], ['b', 'shift-r']);
});

test('大西配列は公式の配布物が、TK音直入力法は出典が見つからず置き場を定めない`「」`と`『』`を、打てない文字に数える', () => {
  for (const layoutId of ['oonishi', 'tk-onchoku']) {
    assert.equal(typeWithSymbols(layoutId, '「」『』').trace.skipped, 4, layoutId);
  }
});

test('英文の大西配列は、日本語の評価でだけ打てる`/`と`？`のキーを持たない', () => {
  const english = LAYOUTS.find((layout) => layout.id === 'oonishi')!;
  assert.equal(english.canonicalInputs.has('/'), false);
  assert.equal(english.canonicalInputs.has('?'), false);
  assert.equal(english.map.has('/'), false);
  assert.equal([...english.legends.values()].includes('/'), false);
  assert.equal(english.romajiOnlyOutputs, undefined);
});
