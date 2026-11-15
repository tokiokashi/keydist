import assert from 'node:assert/strict';
import test from 'node:test';
import type { Finger, Key } from '#input/shapes/geometry.ts';
import type { Press, Stroke, Trace } from '#trace/generate.ts';
import { nonStationaryVectors } from '../keyboard-flow-lines.ts';
import { computeBigramFlowExtraction } from './extract.ts';
import { DEFAULT_BIGRAM_FLOW_OPTIONS } from './options.ts';
import { flowEdgeLabel, formatRollRate, keyboardFlowTableModel, relativeVectorsTableModel, rollRates } from './table-model.ts';

const key = (id: string, finger: Finger, x: number): Key => ({ id, finger, x, y: 2, row: 2, col: 0 });

const press = (finger: Finger, id: string, x: number): Press => ({
  finger,
  keys: [key(id, finger, x)],
  target: { x, y: 2 },
  origin: { at: { x, y: 2 }, from: 'home' },
  gap: 1,
  distance: 0,
  sfb: false,
});

const stroke = (index: number, p: Press): Stroke => ({
  index,
  char: String(index),
  inputChar: String(index),
  inputIndex: index,
  selectionIndex: index,
  kanaStart: index,
  kanaEnd: index,
  aggregationGroupId: 'single',
  classifications: [],
  triggerKeys: [],
  pairedTriggerKeys: [],
  participations: [{ hand: p.finger.startsWith('L') ? 'left' : 'right', finger: p.finger, keys: p.keys, roles: ['output'] }],
  presses: [p],
  distance: 0,
  positions: {} as Stroke['positions'],
});

/** 左手の2キーの往復・同じキーの連打・右手の2キーの移動を含む打鍵の列。 */
function fixtureTrace(): Trace {
  const f = () => press('LI', 'f', 4);
  const d = () => press('LM', 'd', 3);
  const strokes = [f(), d(), f(), d(), f(), d(), f(), f(), f(), press('RI', 'j', 7), press('RM', 'k', 8)].map((p, index) => stroke(index, p));
  return {
    strokes,
    errors: [],
    skipped: 0,
    skippedPositions: [],
    skippedByKind: { kanji: 0, symbol: 0, other: 0 },
    inputChars: strokes.length,
    comboHits: [],
    comboDefinitions: 0,
    layerDefinitions: [],
  };
}

const nameOf = (keyId: string) => keyId.toUpperCase();

test('キーボード上の流れの表は、図の線と同じ回数を多い順に並べ、連打は設定が有効な時だけ入れる', () => {
  const figures = computeBigramFlowExtraction(fixtureTrace(), DEFAULT_BIGRAM_FLOW_OPTIONS);
  const { vectors, repeatCounts } = figures.keyboardFlow;

  const withRepeat = keyboardFlowTableModel(vectors, repeatCounts, true, nameOf);
  const counts = withRepeat.rows.map((row) => Number(row.cells[0]));
  assert.deepEqual(
    counts,
    [...counts].sort((a, b) => b - a),
  );
  const moving = nonStationaryVectors(vectors);
  assert.equal(withRepeat.rows.length, moving.length + repeatCounts.size);
  for (const vector of moving) {
    const row = withRepeat.rows.find((candidate) => candidate.key === vector.id);
    assert.ok(row, vector.id);
    assert.equal(row.cells[0], String(vector.weight));
    assert.equal(row.title, flowEdgeLabel(vector));
  }
  const repeat = withRepeat.rows.find((row) => row.key === 'repeat:f');
  assert.equal(repeat?.cells[0], String(repeatCounts.get('f')));

  const withoutRepeat = keyboardFlowTableModel(vectors, repeatCounts, false, nameOf);
  assert.equal(withoutRepeat.rows.length, moving.length);
  assert.ok(withoutRepeat.rows.every((row) => !row.key.startsWith('repeat:')));
});

test('手ごとの移動の表は、図の見出しと割合の値を左手・右手の順で持ち、内向きと外向きは別の列に出す', () => {
  const extracted = computeBigramFlowExtraction(fixtureTrace(), DEFAULT_BIGRAM_FLOW_OPTIONS).hands;
  // 内向き25%・外向き75%になるよう、重みを差し替える
  const hands = {
    ...extracted,
    left: { ...extracted.left, summary: { ...extracted.left.summary, inwardWeight: 1, outwardWeight: 3 } },
  };
  const table = relativeVectorsTableModel(hands);
  assert.deepEqual(
    table.rows.map((row) => row.key),
    ['left', 'right'],
  );
  for (const row of table.rows) {
    assert.equal(row.cells.length, table.columns.length);
  }
  const left = table.rows[0]!;
  assert.equal(left.cells[0], String(hands.left.relative.length));
  assert.equal(left.cells[1], hands.left.mean.distance.toFixed(2));
  assert.equal(left.cells[2], hands.left.summary.magnitude.toFixed(2));
  assert.equal(left.cells[3], formatRollRate(0.25));
  assert.equal(left.cells[4], formatRollRate(0.75));
  assert.notEqual(left.cells[3], left.cells[4]);
});

test('向きのある移動が無い手の割合は0%になる', () => {
  assert.deepEqual(rollRates({ inwardWeight: 0, outwardWeight: 0 }), { inward: 0, outward: 0 });
});
