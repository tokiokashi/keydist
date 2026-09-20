import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyActionRealizationPolicy,
  DEFAULT_ACTION_REALIZATION_POLICY,
  sameActionRealizationPolicy,
  type RealizedSemanticAction,
  type SemanticInput,
} from '../src/core/semantic-input/index.ts';

const input = (
  classifications: SemanticInput['classifications'] = [],
): SemanticInput => ({
  output: 'x',
  physicalKeys: ['j', 'thumb-r'],
  requirements: [],
  capabilities: [{ kind: 'while-held', keys: ['thumb-r'] }],
  layerId: 'layer:test',
  classifications,
  roles: [{ key: 'thumb-r', role: 'modifier' }],
  faceMemberships: [],
});

const action = (
  extra: Partial<RealizedSemanticAction> = {},
): RealizedSemanticAction => ({
  keys: ['thumb-r', 'j'],
  input: input(),
  outputKeys: ['j'],
  triggerKeys: ['thumb-r'],
  heldKeys: ['thumb-r'],
  holdPhase: 'start',
  ...extra,
});

test('ActionRealizationPolicyの既定はtrigger-realized streamをそのまま保つ', () => {
  const actions = [action()];
  assert.deepEqual(DEFAULT_ACTION_REALIZATION_POLICY, { holdStart: 'combined' });
  assert.equal(
    applyActionRealizationPolicy(actions, DEFAULT_ACTION_REALIZATION_POLICY),
    actions,
  );
});

test('hold startをseparateにするとtrigger actionとheld下のoutput actionへ分ける', () => {
  const [holdStart, output] = applyActionRealizationPolicy(
    [action()],
    { holdStart: 'separate' },
  );

  assert.deepEqual(holdStart, {
    ...action(),
    keys: ['thumb-r'],
    outputKeys: [],
    triggerKeys: ['thumb-r'],
    heldKeys: ['thumb-r'],
    holdPhase: 'start',
  });
  assert.deepEqual(output, {
    ...action(),
    keys: ['j'],
    outputKeys: ['j'],
    triggerKeys: [],
    heldKeys: ['thumb-r'],
    holdPhase: 'continue',
  });
});

test('partial holdではhold groupだけを先行actionへ分け、他triggerはoutput側へ残す', () => {
  const semantic: SemanticInput = {
    ...input(),
    physicalKeys: ['d', 'j', 'thumb-r'],
    capabilities: [{ kind: 'while-held', keys: ['thumb-r'] }],
    roles: [
      { key: 'd', role: 'modifier' },
      { key: 'thumb-r', role: 'modifier' },
    ],
  };
  const [holdStart, output] = applyActionRealizationPolicy([action({
    input: semantic,
    keys: ['thumb-r', 'd', 'j'],
    outputKeys: ['j'],
    triggerKeys: ['thumb-r', 'd'],
  })], { holdStart: 'separate' });

  assert.deepEqual(holdStart.keys, ['thumb-r']);
  assert.deepEqual(holdStart.triggerKeys, ['thumb-r']);
  assert.deepEqual(output.keys, ['d', 'j']);
  assert.deepEqual(output.triggerKeys, ['d']);
  assert.deepEqual(output.outputKeys, ['j']);
  assert.deepEqual(output.heldKeys, ['thumb-r']);
});

test('prefix等ですでにtrigger-onlyのhold start actionは分割しない', () => {
  const triggerOnly = action({
    keys: ['thumb-r'],
    outputKeys: [],
  });
  const actions = [triggerOnly];

  assert.deepEqual(
    applyActionRealizationPolicy(actions, { holdStart: 'separate' }),
    actions,
  );
});

test('hold continue actionは分割しない', () => {
  const continued = action({
    keys: ['j'],
    outputKeys: ['j'],
    triggerKeys: [],
    holdPhase: 'continue',
  });
  const actions = [continued];

  assert.deepEqual(
    applyActionRealizationPolicy(actions, { holdStart: 'separate' }),
    actions,
  );
});

test('compositionのhold startはseparate指定でも1 actionのまま保つ', () => {
  const composition = action({
    input: input(['composition']),
  });
  const actions = [composition];

  assert.deepEqual(
    applyActionRealizationPolicy(actions, { holdStart: 'separate' }),
    actions,
  );
});

test('ActionRealizationPolicy比較はholdStart groupingだけを見る', () => {
  assert.equal(
    sameActionRealizationPolicy(
      { holdStart: 'combined' },
      { holdStart: 'combined' },
    ),
    true,
  );
  assert.equal(
    sameActionRealizationPolicy(
      { holdStart: 'combined' },
      { holdStart: 'separate' },
    ),
    false,
  );
});
