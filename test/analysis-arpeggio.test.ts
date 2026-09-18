import test from 'node:test';
import assert from 'node:assert/strict';
import type { Finger, Key, Point } from '../src/geometry.ts';
import type { Press, Stroke, StrokeParticipation } from '../src/evaluate.ts';
import {
  analyzeStrokeArpeggios,
  DEFAULT_ARPEGGIO_POLICY,
  sameArpeggioPolicy,
} from '../src/analysis-arpeggio.ts';
import { DEFAULT_CHAIN_POLICY } from '../src/analysis-chain.ts';

const key = (id: string, finger: Finger, x: number, y: number, row = 2): Key => ({
  id,
  finger,
  x,
  y,
  row,
  col: 0,
});

const press = (
  finger: Finger,
  keys: Key[],
  target?: Point,
  sfb = false,
): Press => ({
  finger,
  keys,
  target: target ?? { x: keys[0].x, y: keys[0].y },
  gap: 1,
  distance: 0,
  sfb,
});

const participation = (p: Press): StrokeParticipation => ({
  hand: p.finger.startsWith('L') ? 'left' : 'right',
  finger: p.finger,
  keys: p.keys,
  roles: ['output'],
});

const stroke = (index: number, p: Press): Stroke => ({
  index,
  char: String(index),
  inputChar: String(index),
  inputIndex: index,
  layerId: 'single',
  inputRole: 'layer',
  triggerKeys: [],
  pairedTriggerKeys: [],
  participations: [participation(p)],
  presses: [p],
  distance: 0,
  positions: {} as Stroke['positions'],
});

const keepSameFinger = {
  ...DEFAULT_CHAIN_POLICY,
  breakOnSameFinger: false,
};

test('既定PolicyはLongRoll / standalone TwoRollをそのままArpeggio coreにする', () => {
  const result = analyzeStrokeArpeggios([
    stroke(0, press('LP', [key('a', 'LP', 1, 2)])),
    stroke(1, press('LR', [key('s', 'LR', 2, 2)])),
    stroke(2, press('LM', [key('d', 'LM', 3, 2)])),
  ], keepSameFinger);

  assert.deepEqual(result.arpeggioSpans, [{
    startStrokeIndex: 0,
    endStrokeIndex: 3,
    hand: 'left',
    coreKind: 'roll',
    direction: 'inward',
    extensions: [],
  }]);
});

test('includeThumb=falseはstructural Rollを消さずArpeggio core採用だけを止める', () => {
  const strokes = [
    stroke(0, press('LR', [key('s', 'LR', 2, 2)])),
    stroke(1, press('LI', [key('f', 'LI', 4, 2)])),
    stroke(2, press('LT', [key('thumb-l', 'LT', 4.5, 4, 4)])),
  ];

  const withoutThumb = analyzeStrokeArpeggios(
    strokes,
    keepSameFinger,
    DEFAULT_ARPEGGIO_POLICY,
  );
  assert.equal(withoutThumb.longRolls.length, 1);
  assert.deepEqual(withoutThumb.arpeggioSpans, []);

  const withThumb = analyzeStrokeArpeggios(strokes, keepSameFinger, {
    ...DEFAULT_ARPEGGIO_POLICY,
    includeThumb: true,
  });
  assert.deepEqual(withThumb.longRolls, withoutThumb.longRolls);
  assert.equal(withThumb.arpeggioSpans.length, 1);
  assert.equal(withThumb.arpeggioSpans[0].coreKind, 'roll');
});

test('A → B → B → C はbridge有効時に1つのmaximal Spanへ正規化する', () => {
  const strokes = [
    stroke(0, press('LP', [key('a', 'LP', 1, 2)])),
    stroke(1, press('LR', [key('s', 'LR', 2, 2)])),
    stroke(2, press('LR', [key('w', 'LR', 2, 1)], undefined, true)),
    stroke(3, press('LM', [key('d', 'LM', 3, 2)])),
  ];

  const plain = analyzeStrokeArpeggios(strokes, keepSameFinger);
  assert.deepEqual(plain.arpeggioSpans.map((span) => [
    span.startStrokeIndex,
    span.endStrokeIndex,
  ]), [[0, 2], [2, 4]]);

  const bridged = analyzeStrokeArpeggios(strokes, keepSameFinger, {
    ...DEFAULT_ARPEGGIO_POLICY,
    bridgeSameFinger: true,
  });
  assert.deepEqual(bridged.arpeggioSpans, [{
    startStrokeIndex: 0,
    endStrokeIndex: 4,
    hand: 'left',
    coreKind: 'two-roll',
    direction: 'inward',
    extensions: ['same-finger-bridge'],
  }]);
  assert.equal(bridged.sfbEvents.length, 1, 'bridgeしてもSFB factは消さない');
});

test('sameをbridgeしてLongRollを拡張してもcoreKindはrollのまま', () => {
  const result = analyzeStrokeArpeggios([
    stroke(0, press('LR', [key('s', 'LR', 2, 2)])),
    stroke(1, press('LR', [key('w', 'LR', 2, 1)], undefined, true)),
    stroke(2, press('LM', [key('d', 'LM', 3, 2)])),
    stroke(3, press('LI', [key('f', 'LI', 4, 2)])),
  ], keepSameFinger, {
    ...DEFAULT_ARPEGGIO_POLICY,
    bridgeSameFinger: true,
  });

  assert.deepEqual(result.longRolls, [{
    chainIndex: 0,
    startStrokeIndex: 1,
    endStrokeIndex: 4,
    direction: 'inward',
  }]);
  assert.deepEqual(result.arpeggioSpans, [{
    startStrokeIndex: 0,
    endStrokeIndex: 4,
    hand: 'left',
    coreKind: 'roll',
    direction: 'inward',
    extensions: ['same-finger-bridge'],
  }]);
});

test('→ same ← はbridge有効でも単一Spanへ結合しない', () => {
  const result = analyzeStrokeArpeggios([
    stroke(0, press('LP', [key('a', 'LP', 1, 2)])),
    stroke(1, press('LR', [key('s', 'LR', 2, 2)])),
    stroke(2, press('LR', [key('w', 'LR', 2, 1)], undefined, true)),
    stroke(3, press('LP', [key('q', 'LP', 1, 1)])),
  ], keepSameFinger, {
    ...DEFAULT_ARPEGGIO_POLICY,
    bridgeSameFinger: true,
  });

  assert.equal(result.arpeggioSpans.length, 2);
  assert.deepEqual(result.arpeggioSpans.map((span) => [
    span.startStrokeIndex,
    span.endStrokeIndex,
    span.direction,
  ]), [
    [0, 3, 'inward'],
    [1, 4, 'outward'],
  ]);
  assert.equal(
    result.arpeggioSpans.some((span) =>
      span.startStrokeIndex === 0 && span.endStrokeIndex === 4),
    false,
  );
});

test('includeSingleRedirectTailは末尾直後の逆方向1 Transitionだけを吸収する', () => {
  const result = analyzeStrokeArpeggios([
    stroke(0, press('LP', [key('a', 'LP', 1, 2)])),
    stroke(1, press('LR', [key('s', 'LR', 2, 2)])),
    stroke(2, press('LM', [key('d', 'LM', 3, 2)])),
    stroke(3, press('LR', [key('w', 'LR', 2, 1)])),
    stroke(4, press('LI', [key('f', 'LI', 4, 2)])),
  ], keepSameFinger, {
    ...DEFAULT_ARPEGGIO_POLICY,
    includeSingleRedirectTail: true,
  });

  const roll = result.arpeggioSpans.find((span) => span.coreKind === 'roll')!;
  assert.deepEqual(roll, {
    startStrokeIndex: 0,
    endStrokeIndex: 4,
    hand: 'left',
    coreKind: 'roll',
    direction: 'inward',
    extensions: ['single-redirect-tail'],
  });
  assert.ok(
    result.arpeggioSpans.some((span) =>
      span.startStrokeIndex === 3 && span.endStrokeIndex === 5),
    'tailの次のTransitionは別coreなら別Spanのまま',
  );
});

test('bridgeSameFingerを適用した後にredirect tailを適用する', () => {
  const result = analyzeStrokeArpeggios([
    stroke(0, press('LP', [key('a', 'LP', 1, 2)])),
    stroke(1, press('LR', [key('s', 'LR', 2, 2)])),
    stroke(2, press('LR', [key('w', 'LR', 2, 1)], undefined, true)),
    stroke(3, press('LM', [key('d', 'LM', 3, 2)])),
    stroke(4, press('LR', [key('e', 'LR', 2.5, 1)])),
  ], keepSameFinger, {
    includeThumb: false,
    bridgeSameFinger: true,
    includeSingleRedirectTail: true,
  });

  assert.ok(result.arpeggioSpans.some((span) =>
    span.startStrokeIndex === 0
    && span.endStrokeIndex === 5
    && span.hand === 'left'
    && span.coreKind === 'two-roll'
    && span.direction === 'inward'
    && span.extensions.includes('same-finger-bridge')
    && span.extensions.includes('single-redirect-tail')));
  assert.ok(result.arpeggioSpans.some((span) =>
    span.startStrokeIndex === 3
    && span.endStrokeIndex === 5
    && span.direction === 'outward'),
  '構造的根拠が別のoverlap Spanはmergeしない');
});

test('redirect tail後方のsameは自動吸収しない', () => {
  const result = analyzeStrokeArpeggios([
    stroke(0, press('LP', [key('a', 'LP', 1, 2)])),
    stroke(1, press('LR', [key('s', 'LR', 2, 2)])),
    stroke(2, press('LM', [key('d', 'LM', 3, 2)])),
    stroke(3, press('LR', [key('w', 'LR', 2, 1)])),
    stroke(4, press('LR', [key('q', 'LR', 2, 1)], undefined, true)),
  ], keepSameFinger, {
    includeThumb: false,
    bridgeSameFinger: true,
    includeSingleRedirectTail: true,
  });

  const roll = result.arpeggioSpans.find((span) =>
    span.startStrokeIndex === 0 && span.coreKind === 'roll')!;
  assert.equal(roll.endStrokeIndex, 4);
  assert.deepEqual(roll.extensions, ['single-redirect-tail']);
});

test('→ same → same → はbridge有効時にsame個数上限なしで1つのmaximal Spanになる', () => {
  const result = analyzeStrokeArpeggios([
    stroke(0, press('LP', [key('a', 'LP', 1, 2)])),
    stroke(1, press('LR', [key('s', 'LR', 2, 2)])),
    stroke(2, press('LR', [key('w', 'LR', 2, 1)], undefined, true)),
    stroke(3, press('LR', [key('x', 'LR', 2.2, 3)], undefined, true)),
    stroke(4, press('LM', [key('d', 'LM', 3, 2)])),
  ], keepSameFinger, {
    ...DEFAULT_ARPEGGIO_POLICY,
    bridgeSameFinger: true,
  });

  assert.deepEqual(result.arpeggioSpans, [{
    startStrokeIndex: 0,
    endStrokeIndex: 5,
    hand: 'left',
    coreKind: 'two-roll',
    direction: 'inward',
    extensions: ['same-finger-bridge'],
  }]);
  assert.equal(result.sfbEvents.length, 2);
});

test('adjacentな別Spanはend === startでもmergeしない', () => {
  const result = analyzeStrokeArpeggios([
    stroke(0, press('LP', [key('a', 'LP', 1, 2)])),
    stroke(1, press('LR', [key('s', 'LR', 2, 2)])),
    stroke(2, press('LM', [key('d', 'LM', 3, 2)])),
    stroke(3, press('LM', [key('e', 'LM', 3, 1)], undefined, true)),
    stroke(4, press('LP', [key('q', 'LP', 1, 1)])),
  ], keepSameFinger);

  assert.deepEqual(
    result.arpeggioSpans.map((span) => [
      span.startStrokeIndex,
      span.endStrokeIndex,
      span.direction,
    ]),
    [
      [0, 3, 'inward'],
      [3, 5, 'outward'],
    ],
  );
});

test('includeSingleRedirectTailはleading redirectを吸収しない', () => {
  const result = analyzeStrokeArpeggios([
    stroke(0, press('LM', [key('d', 'LM', 3, 2)])),
    stroke(1, press('LP', [key('a', 'LP', 1, 2)])),
    stroke(2, press('LR', [key('s', 'LR', 2, 2)])),
    stroke(3, press('LM', [key('e', 'LM', 3, 1)])),
  ], keepSameFinger, {
    ...DEFAULT_ARPEGGIO_POLICY,
    includeSingleRedirectTail: true,
  });

  const roll = result.arpeggioSpans.find((span) =>
    span.startStrokeIndex === 1
    && span.endStrokeIndex === 4
    && span.direction === 'inward');
  assert.ok(roll);
  assert.equal(roll.startStrokeIndex, 1);
  assert.equal(
    result.arpeggioSpans.some((span) =>
      span.startStrokeIndex === 0
      && span.endStrokeIndex === 4
      && span.direction === 'inward'),
    false,
  );
});

test('ArpeggioPolicy比較はobject identityではなく3項目の意味で比較する', () => {
  assert.equal(sameArpeggioPolicy(
    DEFAULT_ARPEGGIO_POLICY,
    { ...DEFAULT_ARPEGGIO_POLICY },
  ), true);
  assert.equal(sameArpeggioPolicy(
    DEFAULT_ARPEGGIO_POLICY,
    { ...DEFAULT_ARPEGGIO_POLICY, bridgeSameFinger: true },
  ), false);
});

test('Arpeggio result / Policy / Spanはimmutable', () => {
  const result = analyzeStrokeArpeggios([
    stroke(0, press('LP', [key('a', 'LP', 1, 2)])),
    stroke(1, press('LR', [key('s', 'LR', 2, 2)])),
  ], keepSameFinger);

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.arpeggioPolicy), true);
  assert.equal(Object.isFrozen(result.arpeggioSpans), true);
  assert.equal(Object.isFrozen(result.arpeggioSpans[0]), true);
  assert.equal(Object.isFrozen(result.arpeggioSpans[0].extensions), true);
});
