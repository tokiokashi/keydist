import test from 'node:test';
import assert from 'node:assert/strict';
import type { Finger, Key } from '#input/shapes/geometry.ts';
import type { ParticipationRole, Press, StrokeParticipation } from '#trace/generate.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { analyzeHandRhythm, strokeHandFact, type HandRhythmStroke } from './hand-rhythm.ts';

const key = (id: string, finger: Finger): Key => ({ id, finger, x: 0, y: 0, row: 2, col: 0 });

interface Entry {
  finger: Finger;
  /** 押下を持つか。偽なら、保持を続けている層キーだけの参加。 */
  pressed?: boolean;
  roles?: readonly ParticipationRole[];
}

const stroke = (...entries: Entry[]): HandRhythmStroke => {
  const press = (entry: Entry): Press => ({
    finger: entry.finger,
    keys: [key(`k-${entry.finger}`, entry.finger)],
    target: { x: 0, y: 0 },
    origin: { at: { x: 0, y: 0 }, from: 'home' },
    gap: 1,
    distance: 0,
    sfb: false,
  });
  return {
    presses: entries.filter((entry) => entry.pressed !== false).map(press),
    participations: entries.map(
      (entry): StrokeParticipation => ({
        hand: entry.finger.startsWith('L') ? 'left' : 'right',
        finger: entry.finger,
        keys: [key(`k-${entry.finger}`, entry.finger)],
        roles: entry.roles ?? ['output'],
      }),
    ),
  };
};

const L = (finger: Finger = 'LI'): Entry => ({ finger });
const R = (finger: Finger = 'RI'): Entry => ({ finger });

test('出力の手とtriggerだけの手を区別できる', () => {
  const fact = strokeHandFact(stroke({ finger: 'LP', roles: ['trigger'] }, { finger: 'RI', roles: ['output'] }), 0);
  assert.equal(fact.kind, 'both-mixed');
  assert.deepEqual(fact.presses, [
    { hand: 'left', role: 'trigger-only' },
    { hand: 'right', role: 'output' },
  ]);
});

test('役の無い押下も押下する手に入る', () => {
  const fact = strokeHandFact(stroke({ finger: 'LI', roles: [] }), 0);
  assert.equal(fact.kind, 'one-hand');
  assert.deepEqual(fact.presses, [{ hand: 'left', role: 'none' }]);
});

test('前置シフトのtriggerだけのストロークは片手のストロークとして数える', () => {
  // 左小指のシフトだけを押す → 右手の文字 → 右手の文字
  const result = analyzeHandRhythm([stroke({ finger: 'LP', roles: ['trigger'] }), stroke(R('RI')), stroke(R('RM'))]);
  assert.deepEqual(
    result.strokes.map((fact) => fact.kind),
    ['one-hand', 'one-hand', 'one-hand'],
  );
  assert.deepEqual(result.pairs, ['switch', 'continue']);
  assert.equal(result.strokes[0].hand, 'left');
  assert.equal(result.strokes[0].presses[0].role, 'trigger-only');
});

test('両手の同時出力と両手の混在を分け、両手を含む組は継続率の分母に入れない', () => {
  const result = analyzeHandRhythm([
    stroke(L('LI')),
    stroke(L('LM')), // continue
    stroke(L('LI'), R('RI')), // 同時出力
    stroke(R('RI')), // 両手を含む組
    stroke({ finger: 'LT', roles: ['trigger'] }, R('RM')), // 混在
    stroke(L('LI')), // 両手を含む組
    stroke(R('RI')), // switch
  ]);
  assert.deepEqual(result.pairs, ['continue', 'both-hands', 'both-hands', 'both-hands', 'both-hands', 'switch']);
  const { aggregate } = result;
  assert.equal(aggregate.bothHandStrokes.simultaneous, 1);
  assert.equal(aggregate.bothHandStrokes.mixed, 1);
  assert.equal(aggregate.bothHandPairs, 4);
  assert.equal(aggregate.switches, 1);
  assert.equal(aggregate.continuations, 1);
  assert.equal(aggregate.continuationRate, 0.5);
});

test('両手の層キーだけを押すストロークは両手の混在になる', () => {
  const fact = strokeHandFact(stroke({ finger: 'LT', roles: ['trigger'] }, { finger: 'RT', roles: ['trigger'] }), 0);
  assert.equal(fact.kind, 'both-mixed');
});

test('交互打鍵の連続は3ストローク以上だけで、両手のストロークで切れる', () => {
  const result = analyzeHandRhythm([
    stroke(L()),
    stroke(R()), // 2ストロークだけの切り替え（連続に入らない）
    stroke(R('RM')),
    stroke(L()),
    stroke(R()),
    stroke(L()), // ここまで4ストローク [2,6)
    stroke(L('LI'), R('RI')), // 両手のストロークで切れる
    stroke(R()),
    stroke(L()),
    stroke(R()),
  ]);
  assert.deepEqual(result.alternatingRuns, [
    { startStrokeIndex: 2, endStrokeIndex: 6 },
    { startStrokeIndex: 7, endStrokeIndex: 10 },
  ]);
  const { alternation } = result.aggregate;
  assert.equal(alternation.runs, 2);
  assert.equal(alternation.maxLength, 4);
  assert.equal(alternation.meanLength, 3.5);
  assert.equal(alternation.coverage.strokes, 7);
  assert.equal(alternation.coverage.rate, 0.7);
});

test('孤立した1回の切り替えは交互打鍵の連続に入らない', () => {
  const result = analyzeHandRhythm([stroke(L()), stroke(L('LM')), stroke(R()), stroke(R('RM'))]);
  assert.deepEqual(result.alternatingRuns, []);
  assert.equal(result.aggregate.alternation.coverage.strokes, 0);
  assert.deepEqual(result.sameHandRuns, [
    { hand: 'left', startStrokeIndex: 0, endStrokeIndex: 2 },
    { hand: 'right', startStrokeIndex: 2, endStrokeIndex: 4 },
  ]);
});

test('保持を続けている層キーの手は手の判定に入らず、事実としてだけ残る', () => {
  // 左親指のシフトを押したまま右手で打つ。押下は右手だけ
  const held: Entry = { finger: 'LT', pressed: false, roles: ['held-trigger'] };
  const result = analyzeHandRhythm([stroke(held, R('RI')), stroke(held, R('RM')), stroke(L('LI'))]);
  assert.deepEqual(
    result.strokes.map((fact) => fact.kind),
    ['one-hand', 'one-hand', 'one-hand'],
  );
  assert.deepEqual(result.strokes[0].heldHands, ['left']);
  assert.equal(result.strokes[0].hand, 'right');
  assert.deepEqual(result.pairs, ['continue', 'switch']);
});

test('保持を始めるストロークの層キーは押下に入る', () => {
  const start: Entry = { finger: 'LT', roles: ['held-trigger'] };
  const fact = strokeHandFact(stroke(start, R('RI')), 0);
  assert.equal(fact.kind, 'both-mixed');
  assert.deepEqual(fact.heldHands, []);
});

test('同指連続や親指だけのストロークで区間が切れない', () => {
  // 同じ指で別のキー、親指だけのストロークを挟んでも、Chainの境界では切らない
  const result = analyzeHandRhythm([stroke(L('LI')), stroke(R('RT')), stroke(L('LI')), stroke(R('RI')), stroke(L('LI'))]);
  assert.deepEqual(result.alternatingRuns, [{ startStrokeIndex: 0, endStrokeIndex: 5 }]);
});

test('継続率の分母は切り替え + 継続の組数で、分母が0なら0', () => {
  const result = analyzeHandRhythm([stroke(L()), stroke(L('LM')), stroke(L()), stroke(R())]);
  assert.equal(result.aggregate.switches, 1);
  assert.equal(result.aggregate.continuations, 2);
  assert.equal(result.aggregate.continuationRate, 2 / 3);

  const onlyBoth = analyzeHandRhythm([stroke(L(), R()), stroke(L(), R())]);
  assert.equal(onlyBoth.aggregate.continuationRate, 0);
  assert.equal(onlyBoth.aggregate.bothHandPairs, 1);
});

test('覆う割合の分母は全ストローク数で、ストロークが0件なら0', () => {
  const empty = analyzeHandRhythm([]);
  assert.equal(empty.aggregate.alternation.coverage.rate, 0);
  assert.equal(empty.aggregate.alternation.meanLength, 0);
  assert.equal(empty.aggregate.continuationRate, 0);

  const half = analyzeHandRhythm([stroke(L()), stroke(R()), stroke(L()), stroke(L('LM'))]);
  assert.equal(half.aggregate.alternation.coverage.rate, 0.75);
});

test('押下する手が無いストロークはどの組にも入れず連続を切る', () => {
  const noPress: HandRhythmStroke = { presses: [], participations: [] };
  const result = analyzeHandRhythm([stroke(L()), stroke(R()), noPress, stroke(L()), stroke(R()), stroke(L())]);
  assert.deepEqual(result.pairs, ['switch', 'unclassified', 'unclassified', 'switch', 'switch']);
  assert.deepEqual(result.alternatingRuns, [{ startStrokeIndex: 3, endStrokeIndex: 6 }]);
  assert.equal(result.aggregate.switches + result.aggregate.continuations, 3);
});

test('値に効く2つのPolicyのsnapshotを持つ', () => {
  const result = analyzeHandRhythm([], { useHold: true });
  assert.equal(result.aggregate.conditions.triggerRealizationPolicy.useHold, true);
  assert.ok(Object.isFrozen(result.aggregate.conditions));
});

test('実際の配列: QWERTYで左手4打鍵と右手4打鍵を続けて打つと同じ手の連続が2つになる', () => {
  const trace = generateTrace('asdfjkl;', LAYOUT_BY_ID.get('qwerty')!, buildGeometry('row-staggered'), DEFAULT_TRACE_POLICY);
  const result = analyzeHandRhythm(trace.strokes);
  assert.deepEqual(
    result.sameHandRuns.map((run) => [run.hand, run.endStrokeIndex - run.startStrokeIndex]),
    [
      ['left', 4],
      ['right', 4],
    ],
  );
  assert.equal(result.aggregate.switches, 1);
  assert.equal(result.aggregate.continuations, 6);
  assert.deepEqual(result.alternatingRuns, []);
});

test('実際の配列: useHoldで保持を続ける層キーが押下から外れ、両手の混在が片手のストロークになる', () => {
  const text = 'あさ、まどをあけると、やわらかなひかりがへやにひろがります。';
  const asuka = LAYOUT_BY_ID.get('asuka')!;
  const geometry = buildGeometry('row-staggered');
  const withoutHold = analyzeHandRhythm(generateTrace(text, asuka, geometry, DEFAULT_TRACE_POLICY).strokes);
  const withHold = analyzeHandRhythm(
    generateTrace(text, asuka, geometry, { ...DEFAULT_TRACE_POLICY, triggerRealizationPolicy: { useHold: true } }).strokes,
    { useHold: true },
  );
  assert.ok(withHold.aggregate.bothHandStrokes.mixed < withoutHold.aggregate.bothHandStrokes.mixed);
  assert.ok(withHold.strokes.some((fact) => fact.kind === 'one-hand' && fact.heldHands.length > 0));
  assert.equal(withHold.aggregate.conditions.triggerRealizationPolicy.useHold, true);
  assert.equal(withoutHold.aggregate.conditions.triggerRealizationPolicy.useHold, false);
});
