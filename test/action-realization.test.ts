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
  layerId = 'layer:test',
): SemanticInput => ({
  output: 'x',
  physicalKeys: ['j', 'thumb-r'],
  requirements: [],
  capabilities: [{ kind: 'while-held', keys: ['thumb-r'] }],
  layerId,
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
  heldKeys: [],
  ...extra,
});

test('ActionRealizationPolicyの既定はtrigger-realized streamをそのまま保つ', () => {
  const actions = [action()];
  assert.deepEqual(DEFAULT_ACTION_REALIZATION_POLICY, {
    triggerActivation: 'combined',
    triggerActivationOverrides: [],
  });
  assert.equal(
    applyActionRealizationPolicy(actions, DEFAULT_ACTION_REALIZATION_POLICY),
    actions,
  );
});

test('holdなしでもfresh trigger activationをoutputから分離できる', () => {
  const [trigger, output] = applyActionRealizationPolicy(
    [action()],
    { triggerActivation: 'separate' },
  );

  assert.deepEqual(trigger.keys, ['thumb-r']);
  assert.deepEqual(trigger.triggerKeys, ['thumb-r']);
  assert.deepEqual(trigger.outputKeys, []);
  assert.deepEqual(trigger.heldKeys, []);
  assert.equal(trigger.holdPhase, undefined);

  assert.deepEqual(output.keys, ['j']);
  assert.deepEqual(output.outputKeys, ['j']);
  assert.deepEqual(output.triggerKeys, []);
  assert.deepEqual(output.heldKeys, []);
  assert.equal(output.holdPhase, undefined);
});

test('hold startでも同じtrigger activation分離を使いoutput側だけcontinueになる', () => {
  const [trigger, output] = applyActionRealizationPolicy(
    [action({ heldKeys: ['thumb-r'], holdPhase: 'start' })],
    { triggerActivation: 'separate' },
  );

  assert.equal(trigger.holdPhase, 'start');
  assert.deepEqual(trigger.heldKeys, ['thumb-r']);
  assert.equal(output.holdPhase, 'continue');
  assert.deepEqual(output.heldKeys, ['thumb-r']);
});

test('overlapだけならtrigger -> outputへsplitする', () => {
  const semantic: SemanticInput = {
    ...input(),
    requirements: [{ kind: 'overlap', keys: ['j', 'thumb-r'] }],
  };
  const result = applyActionRealizationPolicy(
    [action({ input: semantic })],
    { triggerActivation: 'separate' },
  );
  assert.deepEqual(result.map((candidate) => candidate.keys), [['thumb-r'], ['j']]);
});

test('order(trigger -> output)を維持してsplitする', () => {
  const semantic: SemanticInput = {
    ...input(),
    requirements: [
      { kind: 'overlap', keys: ['j', 'thumb-r'] },
      { kind: 'order', before: ['thumb-r'], after: ['j'] },
    ],
  };
  const result = applyActionRealizationPolicy(
    [action({ input: semantic })],
    { triggerActivation: 'separate' },
  );
  assert.deepEqual(result.map((candidate) => candidate.keys), [['thumb-r'], ['j']]);
});

test('order(output -> trigger)はtrigger-firstへ反転せずcombinedを維持する', () => {
  const semantic: SemanticInput = {
    ...input(),
    requirements: [
      { kind: 'overlap', keys: ['j', 'thumb-r'] },
      { kind: 'order', before: ['j'], after: ['thumb-r'] },
    ],
  };
  const original = action({ input: semantic });
  const result = applyActionRealizationPolicy(
    [original],
    { triggerActivation: 'separate' },
  );
  assert.equal(result.length, 1);
  assert.equal(result[0], original);
});

test('trigger/output groupがorder境界を跨る場合はcombinedを維持する', () => {
  const semantic: SemanticInput = {
    ...input(),
    physicalKeys: ['j', 'k', 'q', 'thumb-r'],
    requirements: [{
      kind: 'order',
      before: ['j', 'thumb-r'],
      after: ['k', 'q'],
    }],
    roles: [
      { key: 'q', role: 'modifier' },
      { key: 'thumb-r', role: 'modifier' },
    ],
  };
  const original = action({
    input: semantic,
    keys: ['q', 'thumb-r', 'j', 'k'],
    outputKeys: ['j', 'k'],
    triggerKeys: ['q', 'thumb-r'],
  });
  const result = applyActionRealizationPolicy(
    [original],
    { triggerActivation: 'separate' },
  );
  assert.equal(result.length, 1);
  assert.equal(result[0], original);
});

test('複数fresh triggerはhold対象かどうかに関係なくtrigger groupとして分離する', () => {
  const [trigger, output] = applyActionRealizationPolicy([action({
    keys: ['thumb-r', 'd', 'j'],
    outputKeys: ['j'],
    triggerKeys: ['thumb-r', 'd'],
    heldKeys: ['thumb-r'],
    holdPhase: 'start',
  })], { triggerActivation: 'separate' });

  assert.deepEqual(trigger.keys, ['thumb-r', 'd']);
  assert.deepEqual(trigger.triggerKeys, ['thumb-r', 'd']);
  assert.deepEqual(output.keys, ['j']);
  assert.deepEqual(output.outputKeys, ['j']);
  assert.deepEqual(output.triggerKeys, []);
});

test('同じphysical keyがtrigger/output両roleを持つactionは分離しない', () => {
  const original = action({
    keys: ['j'],
    outputKeys: ['j'],
    triggerKeys: ['j'],
  });
  assert.deepEqual(
    applyActionRealizationPolicy([original], { triggerActivation: 'separate' }),
    [original],
  );
});

test('既存trigger-only actionは二重分割しない', () => {
  const triggerOnly = action({ keys: ['thumb-r'], outputKeys: [] });
  assert.deepEqual(
    applyActionRealizationPolicy([triggerOnly], { triggerActivation: 'separate' }),
    [triggerOnly],
  );
});

test('hold continueはfresh triggerが無いので分割しない', () => {
  const continued = action({
    keys: ['j'],
    outputKeys: ['j'],
    triggerKeys: [],
    heldKeys: ['thumb-r'],
    holdPhase: 'continue',
  });
  assert.deepEqual(
    applyActionRealizationPolicy([continued], { triggerActivation: 'separate' }),
    [continued],
  );
});

test('compositionはseparate指定でも1 actionのまま保つ', () => {
  const composition = action({ input: input(['composition']) });
  assert.deepEqual(
    applyActionRealizationPolicy([composition], { triggerActivation: 'separate' }),
    [composition],
  );
});

test('trigger group overrideはdefaultより優先される', () => {
  const sandS = action({ input: input([], 'layer:SandS'), triggerKeys: ['thumb-r'] });
  const dakuten = action({
    input: input([], 'layer:濁音'),
    keys: ['j', 'f'],
    outputKeys: ['f'],
    triggerKeys: ['j'],
  });
  const policy = {
    triggerActivation: 'combined' as const,
    triggerActivationOverrides: [{
      selector: { layerId: 'layer:SandS' },
      grouping: 'separate' as const,
    }],
  };

  assert.equal(applyActionRealizationPolicy([sandS], policy).length, 2);
  assert.equal(applyActionRealizationPolicy([dakuten], policy).length, 1);
});

test('triggerKeys selectorはkey順に依存しない', () => {
  const multi = action({
    keys: ['q', 'thumb-r', 'j'],
    outputKeys: ['j'],
    triggerKeys: ['q', 'thumb-r'],
  });
  const result = applyActionRealizationPolicy([multi], {
    triggerActivation: 'combined',
    triggerActivationOverrides: [{
      selector: { triggerKeys: ['thumb-r', 'q'] },
      grouping: 'separate',
    }],
  });
  assert.equal(result.length, 2);
});

test('ActionRealizationPolicy比較はdefaultとoverrideを比較する', () => {
  assert.equal(
    sameActionRealizationPolicy(
      { triggerActivation: 'combined' },
      { triggerActivation: 'combined', triggerActivationOverrides: [] },
    ),
    true,
  );
  assert.equal(
    sameActionRealizationPolicy(
      { triggerActivation: 'combined' },
      { triggerActivation: 'separate' },
    ),
    false,
  );
  assert.equal(
    sameActionRealizationPolicy(
      {
        triggerActivation: 'combined',
        triggerActivationOverrides: [{
          selector: { layerId: 'layer:SandS' },
          grouping: 'separate',
        }],
      },
      { triggerActivation: 'combined' },
    ),
    false,
  );
});
