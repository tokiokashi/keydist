import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CHAIN_POLICY,
  analyzeChains,
  buildRawHandRuns,
  chainPolicyFromLegacyUi,
} from '../src/analysis-chain.ts';
import type { Stroke, StrokeParticipation } from '../src/evaluate.ts';

const participation = (
  hand: 'left' | 'right',
  finger: StrokeParticipation['finger'],
  roles: StrokeParticipation['roles'],
): StrokeParticipation => ({ hand, finger, keys: [], roles });

const stroke = (
  index: number,
  participations: readonly StrokeParticipation[],
  presses: Array<{ finger: StrokeParticipation['finger']; sfb: boolean }> = [],
  classifications: Stroke['classifications'] = [],
): Stroke => ({
  index,
  inputIndex: index,
  inputChar: String(index),
  char: String(index),
  classifications,
  triggerKeys: [],
  pairedTriggerKeys: [],
  participations,
  presses,
  positions: {},
  distance: 0,
  aggregationGroupId: 'single',
}) as unknown as Stroke;

test('Raw hand runは参加factを保持し、trigger/thumb/逆手同時から境界を決めない', () => {
  const strokes = [
    stroke(0, [participation('left', 'LI', ['output'])]),
    stroke(1, [participation('left', 'LM', ['trigger'])]),
    stroke(2, [
      participation('left', 'LR', ['output']),
      participation('right', 'RI', ['output']),
    ]),
    stroke(3, [participation('left', 'LT', ['trigger'])], [{ finger: 'LT', sfb: true }]),
  ];

  const raw = buildRawHandRuns(strokes);
  const left = raw.find((run) => run.hand === 'left')!;
  assert.deepEqual(
    left.steps.map((step) => step.strokeIndex),
    [0, 1, 2, 3],
  );
  assert.equal(left.steps[1].triggerOnly, true);
  assert.equal(left.steps[2].oppositeHandOutput, true);
  assert.equal(left.steps[3].thumbOnly, true);
  assert.equal(left.steps[3].thumbTriggerOnly, true);
  assert.equal(left.steps[3].sameFinger, true, '親指SFBもRaw factとしては失わない');
  assert.equal(left.steps[3].nonThumbSameFinger, false);

  const analysis = analyzeChains(strokes);
  assert.deepEqual(
    analysis.chains.filter((chain) => chain.hand === 'left')
      .map((chain) => [chain.startStrokeIndex, chain.endStrokeIndex]),
    [[0, 3]],
    '既定では親指only StrokeをChain境界にする',
  );

  const keepThumb = analyzeChains(strokes, {
    ...DEFAULT_CHAIN_POLICY,
    breakOnThumbOnly: false,
  });
  assert.deepEqual(
    keepThumb.chains.filter((chain) => chain.hand === 'left')
      .map((chain) => [chain.startStrokeIndex, chain.endStrokeIndex]),
    [[0, 4]],
    'breakOnThumbOnly=falseなら親指only StrokeをまたいでChainを維持する',
  );
});

test('ChainPolicyはsame-finger / trigger-only / 逆手同時を独立に分割する', () => {
  const strokes = [
    stroke(0, [participation('left', 'LI', ['output'])]),
    stroke(1, [participation('left', 'LM', ['trigger'])]),
    stroke(2, [
      participation('left', 'LR', ['output']),
      participation('right', 'RI', ['output']),
    ]),
    stroke(3, [participation('left', 'LI', ['output'])], [{ finger: 'LI', sfb: true }]),
    stroke(4, [participation('left', 'LM', ['output'])]),
  ];

  const triggerPolicy = {
    ...DEFAULT_CHAIN_POLICY,
    breakOnSameFinger: false,
    breakOnTriggerOnly: true,
  };
  assert.deepEqual(
    analyzeChains(strokes, triggerPolicy).chains
      .filter((chain) => chain.hand === 'left')
      .map((chain) => [chain.startStrokeIndex, chain.endStrokeIndex]),
    [[0, 1], [2, 5]],
  );

  const oppositePolicy = {
    ...DEFAULT_CHAIN_POLICY,
    breakOnSameFinger: false,
    breakOnOppositeHandSimultaneous: true,
  };
  assert.deepEqual(
    analyzeChains(strokes, oppositePolicy).chains
      .filter((chain) => chain.hand === 'left')
      .map((chain) => [chain.startStrokeIndex, chain.endStrokeIndex]),
    [[0, 2], [3, 5]],
  );

  assert.deepEqual(
    analyzeChains(strokes, DEFAULT_CHAIN_POLICY).chains
      .filter((chain) => chain.hand === 'left')
      .map((chain) => [chain.startStrokeIndex, chain.endStrokeIndex]),
    [[0, 3], [4, 5]],
    '既定ではsame-finger境界Strokeを従来どおりChainから外す',
  );
});

test('breakOnTriggerOnlyはcanonical composition classificationをshift扱いで除外しない', () => {
  const strokes = [
    stroke(0, [
      participation('left', 'LI', ['output']),
      participation('right', 'RI', ['trigger']),
    ], [], ['composition']),
  ];
  const policy = {
    ...DEFAULT_CHAIN_POLICY,
    breakOnSameFinger: false,
    breakOnTriggerOnly: true,
  };

  const raw = buildRawHandRuns(strokes);
  const right = raw.find((run) => run.hand === 'right')!.steps[0];
  assert.equal(right.triggerOnly, true, 'Raw factとしてtrigger-onlyは保持する');
  assert.equal(right.isComposition, true);

  assert.deepEqual(
    analyzeChains(strokes, policy).chains.map((chain) => [
      chain.hand,
      chain.startStrokeIndex,
      chain.endStrokeIndex,
    ]),
    [
      ['left', 0, 1],
      ['right', 0, 1],
    ],
  );
});

test('composition classificationなしのtrigger-onlyは通常のChain境界にする', () => {
  const strokes = [
    stroke(0, [
      participation('left', 'LI', ['output']),
      participation('right', 'RI', ['trigger']),
    ]),
  ];
  const policy = {
    ...DEFAULT_CHAIN_POLICY,
    breakOnSameFinger: false,
    breakOnTriggerOnly: true,
    breakOnThumbOnly: false,
  };

  const raw = buildRawHandRuns(strokes);
  const right = raw.find((run) => run.hand === 'right')!.steps[0];
  assert.equal(right.triggerOnly, true);
  assert.equal(right.isComposition, false);

  assert.deepEqual(
    analyzeChains(strokes, policy).chains.map((chain) => [
      chain.hand,
      chain.startStrokeIndex,
      chain.endStrokeIndex,
    ]),
    [
      ['left', 0, 1],
    ],
  );
});

test('旧include設定は意味が対応するChainPolicyへだけ変換する', () => {
  assert.deepEqual(
    chainPolicyFromLegacyUi({
      chainIncludeSameFinger: false,
      chainIncludeLayerKeys: true,
    }),
    DEFAULT_CHAIN_POLICY,
  );
  assert.deepEqual(
    chainPolicyFromLegacyUi({
      chainIncludeSameFinger: true,
      chainIncludeLayerKeys: false,
    }),
    {
      breakOnSameFinger: false,
      breakOnTriggerOnly: true,
      breakOnThumbOnly: true,
      breakOnOppositeHandSimultaneous: false,
    },
  );
});

test('親指only境界とtrigger-only境界は独立に適用する', () => {
  const strokes = [
    stroke(0, [participation('left', 'LI', ['output'])]),
    stroke(1, [participation('left', 'LM', ['trigger'])]),
    stroke(2, [participation('left', 'LR', ['output'])]),
    stroke(3, [participation('left', 'LT', ['output'])]),
    stroke(4, [participation('left', 'LP', ['output'])]),
  ];

  const thumbOnly = {
    ...DEFAULT_CHAIN_POLICY,
    breakOnSameFinger: false,
    breakOnTriggerOnly: false,
    breakOnThumbOnly: true,
  };
  assert.deepEqual(
    analyzeChains(strokes, thumbOnly).chains
      .filter((chain) => chain.hand === 'left')
      .map((chain) => [chain.startStrokeIndex, chain.endStrokeIndex]),
    [[0, 3], [4, 5]],
    '非親指trigger-onlyでは切らず、親指onlyだけで切る',
  );

  const triggerOnly = {
    ...DEFAULT_CHAIN_POLICY,
    breakOnSameFinger: false,
    breakOnTriggerOnly: true,
    breakOnThumbOnly: false,
  };
  assert.deepEqual(
    analyzeChains(strokes, triggerOnly).chains
      .filter((chain) => chain.hand === 'left')
      .map((chain) => [chain.startStrokeIndex, chain.endStrokeIndex]),
    [[0, 1], [2, 5]],
    'trigger-onlyで切っても親指outputだけでは切らない',
  );
});

test('AnalysisResultはstable IDを作らず、result内indexとimmutable spanを返す', () => {
  const analysis = analyzeChains([
    stroke(0, [participation('left', 'LI', ['output'])]),
    stroke(1, [participation('left', 'LM', ['output'])]),
  ]);
  assert.deepEqual(analysis.chains.map((chain) => chain.chainIndex), [0]);
  assert.equal(analysis.chains[0].rawRunIndex, 0);
  assert.equal(Object.isFrozen(analysis), true);
  assert.equal(Object.isFrozen(analysis.rawHandRuns), true);
  assert.equal(Object.isFrozen(analysis.rawHandRuns[0].steps), true);
  assert.equal(Object.isFrozen(analysis.chains), true);
  assert.equal(Object.isFrozen(analysis.chains[0]), true);
});
