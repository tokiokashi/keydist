import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { buildGeometry, type Finger } from '#input/shapes/geometry.ts';
import { DEFAULT_TRACE_POLICY, generateTrace, type Press, type Stroke } from '#trace/generate.ts';
import { isRepeatStroke, strokeOverheadKinds, strokeStructureKinds, type StrokeStructureInput } from './stroke-structure.ts';

const strokes = (count: number): Stroke[] => Array.from({ length: count }, () => ({}) as Stroke);

const range = (startStrokeIndex: number, endStrokeIndex: number) => ({ startStrokeIndex, endStrokeIndex });

function analysisOf(
  count: number,
  chains: readonly ReturnType<typeof range>[],
  arpeggioSpans: readonly ReturnType<typeof range>[],
): StrokeStructureInput {
  return { strokes: strokes(count), chains, arpeggioSpans } as unknown as StrokeStructureInput;
}

test('遷移の両端が同じ区間に入る時だけ、その区間の種類になる（区間は半開）', () => {
  // Chainは0〜3打目、Arpeggioは2〜4打目。遷移1→2はChain、2→3はArpeggio。
  const kinds = strokeStructureKinds(analysisOf(7, [range(0, 4)], [range(2, 5)]));
  assert.deepEqual(kinds, ['other', 'chain', 'chain', 'arpeggio', 'arpeggio', 'other', 'other']);
});

test('ArpeggioとChainが重なる遷移はArpeggioにする', () => {
  const kinds = strokeStructureKinds(analysisOf(4, [range(0, 4)], [range(1, 4)]));
  assert.deepEqual(kinds, ['other', 'chain', 'arpeggio', 'arpeggio']);
});

test('最初のストロークは、区間の始まりでもその他にする', () => {
  const kinds = strokeStructureKinds(analysisOf(3, [range(0, 3)], [range(0, 3)]));
  assert.equal(kinds[0], 'other');
  assert.deepEqual(kinds.slice(1), ['arpeggio', 'arpeggio']);
});

test('区間が無ければすべてその他、区間がストローク数を超えても範囲の外は触らない', () => {
  assert.deepEqual(strokeStructureKinds(analysisOf(3, [], [])), ['other', 'other', 'other']);
  assert.deepEqual(strokeStructureKinds(analysisOf(2, [range(0, 9)], [])), ['other', 'chain']);
});

test('同じ解析結果には同じ配列を返す', () => {
  const analysis = analysisOf(3, [range(0, 3)], []);
  assert.equal(strokeStructureKinds(analysis), strokeStructureKinds(analysis));
});

const press = (finger: Finger, keyIds: readonly string[], sfb = false): Press => ({
  finger,
  keys: keyIds.map((id) => ({ id, finger, x: 0, y: 0, row: 2, col: 0 })),
  target: { x: 0, y: 0 },
  origin: { at: { x: 0, y: 0 }, from: 'home' },
  gap: 0,
  distance: sfb ? 1 : 0,
  sfb,
}) as Press;

const strokeOf = (...presses: Press[]) => ({ presses }) as unknown as Stroke;

test('続け打ちは、どちらも押下を1つだけ持ち、その指とキーが同じ時だけ', () => {
  const f = strokeOf(press('LI', ['f']));
  assert.equal(isRepeatStroke(strokeOf(press('LI', ['f'])), f), true);
  assert.equal(isRepeatStroke(strokeOf(press('LI', ['g'])), f), false);
  assert.equal(isRepeatStroke(strokeOf(press('LM', ['f'])), f), false);
  assert.equal(isRepeatStroke(f, undefined), false);
  assert.equal(isRepeatStroke(undefined, f), false);
});

test('押下を複数持つストロークは、同じ形で続けても続け打ちにしない', () => {
  const pair = strokeOf(press('LI', ['f']), press('RI', ['j']));
  assert.equal(isRepeatStroke(pair, pair), false);
  assert.equal(isRepeatStroke(pair, strokeOf(press('LI', ['f']))), false);
  assert.equal(isRepeatStroke(strokeOf(press('LI', ['f'])), pair), false);
  // 1本の指が複数のキーを押す押下は、キーの集合が同じなら同じキー。
  assert.equal(isRepeatStroke(strokeOf(press('LI', ['f', 'g'])), strokeOf(press('LI', ['g', 'f']))), true);
  assert.equal(isRepeatStroke(strokeOf(press('LI', ['f', 'g'])), strokeOf(press('LI', ['f']))), false);
});

test('差の種類は、同指連続、続け打ち、構造の種類の順に決まる', () => {
  const analysis = {
    strokes: [
      strokeOf(press('LI', ['f'])),
      strokeOf(press('LI', ['f'])),
      strokeOf(press('LI', ['f'])),
      strokeOf(press('LI', ['r'], true)),
      strokeOf(press('RI', ['j'])),
    ],
    chains: [range(3, 5)],
    arpeggioSpans: [],
  } as unknown as StrokeStructureInput;
  assert.deepEqual(strokeOverheadKinds(analysis), ['other', 'repeat', 'repeat', 'sfb', 'chain']);
  assert.equal(strokeOverheadKinds(analysis), strokeOverheadKinds(analysis));
});

test('保持を始めたストロークとその次のストロークは続け打ちにならず、その次から同じキーなら続け打ちになる', () => {
  const layout = LAYOUT_BY_ID.get('asuka')!;
  const geometry = buildGeometry('row-staggered');
  const held = generateTrace('あああ', layout, geometry, { ...DEFAULT_TRACE_POLICY, triggerRealizationPolicy: { useHold: true } });
  // 1打目は親指のキーと文字のキーの2つの押下、2打目は保持を続けるので文字のキーだけ。
  assert.deepEqual(held.strokes.map((stroke) => stroke.presses.length), [2, 1, 1]);
  assert.deepEqual(held.strokes.map((stroke, index) => isRepeatStroke(stroke, held.strokes[index - 1])), [false, false, true]);
  // 保持を使わなければ、毎回親指のキーも押すので、押下を複数持つストロークは続け打ちにならない。
  const released = generateTrace('あああ', layout, geometry, DEFAULT_TRACE_POLICY);
  assert.ok(released.strokes.every((stroke) => stroke.presses.length === 2));
  assert.ok(released.strokes.every((stroke, index) => !isRepeatStroke(stroke, released.strokes[index - 1])));
});
