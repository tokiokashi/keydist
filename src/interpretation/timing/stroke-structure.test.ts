import assert from 'node:assert/strict';
import test from 'node:test';
import type { Stroke } from '#trace/generate.ts';
import { strokeStructureKinds, type StrokeStructureInput } from './stroke-structure.ts';

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
