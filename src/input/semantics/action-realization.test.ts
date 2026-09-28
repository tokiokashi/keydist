import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyActionRealizationPolicy,
  classifyTriggerActivation,
  DEFAULT_ACTION_REALIZATION_POLICY,
  DEFAULT_TRIGGER_ACTIVATION_GROUPINGS,
  sameActionRealizationPolicy,
  type ActionRealizationPolicy,
  type RealizedSemanticAction,
  type SemanticInput,
} from './index.ts';

const input = (
  classifications: SemanticInput['classifications'] = [],
  aggregationGroupId = 'layer:test',
  requirements: SemanticInput['requirements'] = [],
  modifierGroupId = 'test',
): SemanticInput => ({
  output: 'x',
  physicalKeys: ['j', 'thumb-r'],
  requirements,
  capabilities: [{ kind: 'while-held', keys: ['thumb-r'] }],
  aggregationGroupId,
  classifications,
  roles: [{ key: 'thumb-r', role: 'modifier', modifierGroupId }],
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

const semantic = (
  classOverrides: ActionRealizationPolicy['triggerActivationClassOverrides'] = {},
  triggerActivationOverrides: ActionRealizationPolicy['triggerActivationOverrides'] = [],
): ActionRealizationPolicy => ({
  triggerActivation: 'semantic',
  triggerActivationClassOverrides: classOverrides,
  triggerActivationOverrides,
});

const forceSeparate = (): ActionRealizationPolicy => semantic({
  'prepress-required': 'separate',
  'order-free': 'separate',
});

test('ActionRealizationPolicyの既定は独立action化disabled', () => {
  const actions = [action()];
  assert.deepEqual(DEFAULT_ACTION_REALIZATION_POLICY, {
    triggerActivation: 'disabled',
    triggerActivationClassOverrides: {},
    triggerActivationOverrides: [],
  });
  assert.equal(
    applyActionRealizationPolicy(actions, DEFAULT_ACTION_REALIZATION_POLICY),
    actions,
  );
});

test('semantic既定値は先押し必須だけseparate、押し順不問はcombined', () => {
  assert.deepEqual(DEFAULT_TRIGGER_ACTIVATION_GROUPINGS, {
    'prepress-required': 'separate',
    'order-free': 'combined',
    'postpress-required': 'combined',
  });

  const orderFree = action({
    input: input([], 'layer:test', [
      { kind: 'overlap', keys: ['j', 'thumb-r'] },
    ]),
  });
  const prepress = action({
    input: input([], 'layer:test', [
      { kind: 'overlap', keys: ['j', 'thumb-r'] },
      { kind: 'order', before: ['thumb-r'], after: ['j'] },
    ]),
  });

  assert.equal(classifyTriggerActivation(orderFree.input, orderFree.triggerKeys, orderFree.outputKeys), 'order-free');
  assert.equal(classifyTriggerActivation(prepress.input, prepress.triggerKeys, prepress.outputKeys), 'prepress-required');
  assert.equal(applyActionRealizationPolicy([orderFree], semantic()).length, 1);
  assert.equal(applyActionRealizationPolicy([prepress], semantic()).length, 2);
});

test('holdなしでもclass overrideでorder-free triggerを分離できる', () => {
  const [trigger, output] = applyActionRealizationPolicy(
    [action()],
    forceSeparate(),
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
    forceSeparate(),
  );

  assert.equal(trigger.holdPhase, 'start');
  assert.deepEqual(trigger.heldKeys, ['thumb-r']);
  assert.equal(output.holdPhase, 'continue');
  assert.deepEqual(output.heldKeys, ['thumb-r']);
});

test('order(output -> trigger)はpostpress-requiredでtrigger-firstへ反転しない', () => {
  const semanticInput = input([], 'layer:test', [
    { kind: 'overlap', keys: ['j', 'thumb-r'] },
    { kind: 'order', before: ['j'], after: ['thumb-r'] },
  ]);
  const original = action({ input: semanticInput });
  assert.equal(
    classifyTriggerActivation(semanticInput, original.triggerKeys, original.outputKeys),
    'postpress-required',
  );
  const result = applyActionRealizationPolicy(
    [original],
    semantic({ 'postpress-required': 'separate' }),
  );
  assert.equal(result.length, 1);
  assert.equal(result[0], original);
});

test('trigger/output groupがorder境界を跨る場合はcombinedを維持する', () => {
  const semanticInput: SemanticInput = {
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
    input: semanticInput,
    keys: ['q', 'thumb-r', 'j', 'k'],
    outputKeys: ['j', 'k'],
    triggerKeys: ['q', 'thumb-r'],
  });
  const result = applyActionRealizationPolicy([original], forceSeparate());
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
  })], forceSeparate());

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
  assert.deepEqual(applyActionRealizationPolicy([original], forceSeparate()), [original]);
});

test('既存trigger-only actionは二重分割しない', () => {
  const triggerOnly = action({ keys: ['thumb-r'], outputKeys: [] });
  assert.deepEqual(applyActionRealizationPolicy([triggerOnly], forceSeparate()), [triggerOnly]);
});

test('hold continueはfresh triggerが無いので分割しない', () => {
  const continued = action({
    keys: ['j'],
    outputKeys: ['j'],
    triggerKeys: [],
    heldKeys: ['thumb-r'],
    holdPhase: 'continue',
  });
  assert.deepEqual(applyActionRealizationPolicy([continued], forceSeparate()), [continued]);
});

test('compositionはsemantic policyやoverrideに関係なく1 actionのまま保つ', () => {
  const composition = action({ input: input(['composition']) });
  assert.deepEqual(
    applyActionRealizationPolicy([composition], forceSeparate()),
    [composition],
  );
});

test('concrete overrideはclass defaultより優先される', () => {
  const sandS = action({
    input: input([], 'layer:SandS', [
      { kind: 'order', before: ['thumb-r'], after: ['j'] },
    ], 'SandS'),
  });
  const dakuten = action({
    input: {
      ...input([], 'layer:濁音', [], '濁音'),
      physicalKeys: ['j', 'f'],
      roles: [{ key: 'j', role: 'modifier', modifierGroupId: '濁音' }],
    },
    keys: ['j', 'f'],
    outputKeys: ['f'],
    triggerKeys: ['j'],
  });
  const policy = semantic(
    { 'prepress-required': 'combined', 'order-free': 'separate' },
    [{
      selector: { modifierGroupIds: ['SandS'] },
      grouping: 'separate',
    }, {
      selector: { modifierGroupIds: ['濁音'] },
      grouping: 'combined',
    }],
  );

  assert.equal(applyActionRealizationPolicy([sandS], policy).length, 2);
  assert.equal(applyActionRealizationPolicy([dakuten], policy).length, 1);
});

test('aggregationGroupIdが違っても同じmodifier semantic selectorが適用される', () => {
  const first = action({
    input: input([], 'aggregation:A', [], 'SandS'),
  });
  const second = action({
    input: input([], 'aggregation:B', [], 'SandS'),
  });
  const policy = semantic(
    { 'order-free': 'combined' },
    [{
      selector: { modifierGroupIds: ['SandS'] },
      grouping: 'separate',
    }],
  );

  assert.equal(applyActionRealizationPolicy([first], policy).length, 2);
  assert.equal(applyActionRealizationPolicy([second], policy).length, 2);
});

test('複数modifier group selectorは集合の完全一致だけに適用する', () => {
  const multiModifier = action({
    input: {
      ...input([], 'aggregation:extension', [], '濁音'),
      physicalKeys: ['h', 'j', 'w'],
      roles: [
        { key: 'h', role: 'modifier', modifierGroupId: '拗音' },
        { key: 'j', role: 'modifier', modifierGroupId: '濁音' },
      ],
    },
    keys: ['h', 'j', 'w'],
    outputKeys: ['w'],
    triggerKeys: ['j', 'h'],
  });
  const exact = semantic(
    { 'order-free': 'combined' },
    [{
      selector: { modifierGroupIds: ['濁音', '拗音'] },
      grouping: 'separate',
    }],
  );
  const partial = semantic(
    { 'order-free': 'combined' },
    [{
      selector: { modifierGroupIds: ['濁音'] },
      grouping: 'separate',
    }],
  );

  assert.equal(applyActionRealizationPolicy([multiModifier], exact).length, 2);
  assert.equal(applyActionRealizationPolicy([multiModifier], partial).length, 1);
});

test('physical selectorはmodifier group selectorより優先されkey順に依存しない', () => {
  const multi = action({
    input: input([], 'layer:X', [], 'X'),
    keys: ['q', 'thumb-r', 'j'],
    outputKeys: ['j'],
    triggerKeys: ['q', 'thumb-r'],
  });
  const result = applyActionRealizationPolicy([multi], semantic({}, [{
    selector: { modifierGroupIds: ['X'] },
    grouping: 'combined',
  }, {
    selector: { modifierGroupIds: ['X'], triggerKeys: ['thumb-r', 'q'] },
    grouping: 'separate',
  }]));
  assert.equal(result.length, 2);
});

test('disabledでは保存済みoverrideがあってもstreamを変更しない', () => {
  const original = action();
  assert.equal(
    applyActionRealizationPolicy([original], {
      triggerActivation: 'disabled',
      triggerActivationClassOverrides: { 'order-free': 'separate' },
      triggerActivationOverrides: [{
        selector: { modifierGroupIds: ['test'] },
        grouping: 'separate',
      }],
    })[0],
    original,
  );
});

test('ActionRealizationPolicy比較はmode・class override・concrete overrideを比較する', () => {
  assert.equal(
    sameActionRealizationPolicy(
      { triggerActivation: 'semantic' },
      {
        triggerActivation: 'semantic',
        triggerActivationClassOverrides: {},
        triggerActivationOverrides: [],
      },
    ),
    true,
  );
  assert.equal(
    sameActionRealizationPolicy(
      { triggerActivation: 'disabled' },
      { triggerActivation: 'semantic' },
    ),
    false,
  );
  assert.equal(
    sameActionRealizationPolicy(
      {
        triggerActivation: 'semantic',
        triggerActivationClassOverrides: { 'order-free': 'separate' },
      },
      { triggerActivation: 'semantic' },
    ),
    false,
  );
  assert.equal(
    sameActionRealizationPolicy(
      {
        triggerActivation: 'semantic',
        triggerActivationOverrides: [{
          selector: { modifierGroupIds: ['SandS'] },
          grouping: 'separate',
        }],
      },
      { triggerActivation: 'semantic' },
    ),
    false,
  );
});
