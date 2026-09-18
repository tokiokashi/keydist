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
): Stroke => ({
  index,
  inputIndex: index,
  inputChar: String(index),
  char: String(index),
  inputRole: 'output',
  triggerKeys: [],
  pairedTriggerKeys: [],
  participations,
  presses,
  positions: {},
  distance: 0,
  layerId: 'single',
}) as unknown as Stroke;

test('Raw hand runは参加factを保持し、trigger/thumb/逆手同時から境界を決めない', () => {
  const strokes = [
    stroke(0, [participation('left', 'LI', ['output'])]),
    stroke(1, [participation('left', 'LM', ['trigger'])]),
    stroke(2, [
      participation('left', 'LR', ['output']),
      participation('right', 'RI', ['output']),
    ]),
    stroke(3, [participation('left', 'LT', ['trigger'])]),
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

  const analysis = analyzeChains(strokes);
  assert.deepEqual(
    analysis.chains.filter((chain) => chain.hand === 'left')
      .map((chain) => [chain.startStrokeIndex, chain.endStrokeIndex]),
    [[0, 4]],
    '未決のthumb-onlyやtrigger factだけでは既定Chainを切らない',
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
      breakOnOppositeHandSimultaneous: false,
    },
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
