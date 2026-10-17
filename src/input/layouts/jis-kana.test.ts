import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_TRACE_POLICY, generateTrace, type Stroke } from '#trace/generate.ts';
import { buildGeometry, JIS_FINGER_ASSIGNMENT, SHIFT_KEY } from '../shapes/geometry.ts';
import { JIS_KANA } from './jis-kana.ts';

const geometry = buildGeometry('jis-row-staggered', JIS_FINGER_ASSIGNMENT);
const SHIFTS: readonly string[] = [SHIFT_KEY.L, SHIFT_KEY.R];

function strokesFor(text: string): Stroke[] {
  const trace = generateTrace(text, JIS_KANA, geometry, DEFAULT_TRACE_POLICY);
  assert.deepEqual(trace.errors, [], `${text}: 打鍵の列に不備がある`);
  assert.equal(trace.skipped, 0, `${text}: 打てない文字がある`);
  return trace.strokes;
}

/** ステップで押したキー（Shiftを除く）。 */
function keysOf(stroke: Stroke): string[] {
  return stroke.presses
    .flatMap((press) => press.keys.map((key) => key.id))
    .filter((key) => !SHIFTS.includes(key))
    .sort();
}

/** ステップで押したShiftキーの数。 */
function shiftCountOf(stroke: Stroke): number {
  return stroke.presses.flatMap((press) => press.keys.map((key) => key.id)).filter((key) => SHIFTS.includes(key)).length;
}

test('濁点: 元のかなの後に濁点のキーを別のステップで打つ（がはかのキー、濁点のキーの順に打つ2ステップ）', () => {
  const strokes = strokesFor('が');
  assert.deepEqual(strokes.map(keysOf), [['t'], ['[']]);
  assert.deepEqual(strokes.map(shiftCountOf), [0, 0]);
  // 1文字の入力が2ステップになる。覆うかなは同じ1文字
  assert.deepEqual(
    strokes.map((stroke) => [stroke.kanaStart, stroke.kanaEnd]),
    [
      [0, 0],
      [0, 0],
    ],
  );
});

test('半濁点: 元のかなの後に半濁点のキーを別のステップで打つ（ぱははのキー、半濁点のキーの順に打つ2ステップ）', () => {
  const strokes = strokesFor('ぱ');
  assert.deepEqual(strokes.map(keysOf), [['f'], [']']]);
});

test('濁点: う → ゔ も同じ規則で連結する（ゔはうのキー、濁点のキーの順に打つ2ステップ）', () => {
  assert.deepEqual(strokesFor('ゔ').map(keysOf), [['4'], ['[']]);
});

test('濁音1文字は連結した経路を、canonical inputではcomposedとして持つ', () => {
  const alternatives = JIS_KANA.canonicalInputs.get('が');
  assert.ok(alternatives);
  assert.ok(alternatives.every((alternative) => alternative.origin === 'composed'));
  assert.ok(alternatives.every((alternative) => alternative.semanticInputs.length === 2));
});

test('Shift面: 小書きのかな（ぁ）はShiftを押したまま同じステップで打つ', () => {
  const strokes = strokesFor('ぁ');
  assert.deepEqual(strokes.map(keysOf), [['3']]);
  assert.deepEqual(strokes.map(shiftCountOf), [1]);
});

test('Shift面: を・っ・括弧・句読点・中黒もShiftと同じステップで打つ', () => {
  const expected: readonly (readonly [string, string[]])[] = [
    ['を', ['0']],
    ['っ', ['z']],
    ['「', [']']],
    ['、', [',']],
    ['。', ['.']],
    ['・', ['/']],
  ];
  for (const [char, keys] of expected) {
    const strokes = strokesFor(char);
    assert.deepEqual(strokes.map(keysOf), [keys], char);
    assert.deepEqual(strokes.map(shiftCountOf), [1], char);
  }
});

test('Shift面: 」はJIS専用のキー（r2c11）をShiftと同じステップで打つ', () => {
  const strokes = strokesFor('」');
  assert.deepEqual(strokes.map(keysOf), [['r2c11']]);
  assert.deepEqual(strokes.map(shiftCountOf), [1]);
});

test('JIS専用のキー（ー・む・ろ）はANSIの物理配列に無い', () => {
  const ansi = buildGeometry('row-staggered');
  const trace = generateTrace('ーむろ', JIS_KANA, ansi, DEFAULT_TRACE_POLICY);
  assert.equal(trace.errors.length, 3);
});
