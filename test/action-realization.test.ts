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
  assert.deepEqual(DEFAULT_ACTION_REALIZATION_POLICY, { triggerActivation: 'combined' });
  assert.equal(
    applyActionRealizationPolicy(actions, DEFAULT_ACTION_REALIZATION_POLICY),
    actions,
  );
});

test('hold startをseparateにするとtrigger actionとheld下のoutput actionへ分ける', () => {
  const [holdStart, output] = applyActionRealizationPolicy(
    [action()],
    { triggerActivation: 'separate' },
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

test('overlapだけならhold-start -> outputへsplitする', () => {
  const semantic: SemanticInput = {
    ...input(),
    requirements: [{ kind: 'overlap', keys: ['j', 'thumb-r'] }],
  };
  const result = applyActionRealizationPolicy([
    action({ input: semantic }),
  ], { triggerActivation: 'separate' });

  assert.deepEqual(result.map((candidate) => candidate.keys), [
    ['thumb-r'],
    ['j'],
  ]);
});

test('prefix orderならhold-start -> outputの順を維持してsplitする', () => {
  const semantic: SemanticInput = {
    ...input(),
    requirements: [
      { kind: 'overlap', keys: ['j', 'thumb-r'] },
      { kind: 'order', before: ['thumb-r'], after: ['j'] },
    ],
  };
  const result = applyActionRealizationPolicy([
    action({ input: semantic }),
  ], { triggerActivation: 'separate' });

  assert.deepEqual(result.map((candidate) => candidate.keys), [
    ['thumb-r'],
    ['j'],
  ]);
});

test('suffix orderはheld-firstへ反転せずconservativeにcombinedを維持する', () => {
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

test('partial holdでheld/fresh groupがorder境界の両側へ跨る場合はcombinedを維持する', () => {
  const semantic: SemanticInput = {
    ...input(),
    physicalKeys: ['j', 'k', 'q', 'thumb-r'],
    requirements: [{
      kind: 'order',
      before: ['j', 'thumb-r'],
      after: ['k', 'q'],
    }],
    capabilities: [{ kind: 'while-held', keys: ['q', 'thumb-r'] }],
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
    heldKeys: ['q', 'thumb-r'],
  });
  const result = applyActionRealizationPolicy(
    [original],
    { triggerActivation: 'separate' },
  );

  assert.equal(result.length, 1);
  assert.equal(result[0], original);
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
  })], { triggerActivation: 'separate' });

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
    applyActionRealizationPolicy(actions, { triggerActivation: 'separate' }),
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
    applyActionRealizationPolicy(actions, { triggerActivation: 'separate' }),
    actions,
  );
});

test('compositionのhold startはseparate指定でも1 actionのまま保つ', () => {
  const composition = action({
    input: input(['composition']),
  });
  const actions = [composition];

  assert.deepEqual(
    applyActionRealizationPolicy(actions, { triggerActivation: 'separate' }),
    actions,
  );
});

test('ActionRealizationPolicy比較はholdStart groupingだけを見る', () => {
  assert.equal(
    sameActionRealizationPolicy(
      { triggerActivation: 'combined' },
      { triggerActivation: 'combined' },
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
});
