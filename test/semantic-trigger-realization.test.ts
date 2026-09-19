import test from 'node:test';
import assert from 'node:assert/strict';
import {
  realizeTriggerActions,
  type BaseActionRealization,
  type SemanticInput,
} from '../src/core/semantic-input/index.ts';
import { faceFromEntries, fromFaces, type FaceMode } from '../src/layouts/index.ts';

const holdFaceLayout = (
  mode: FaceMode,
  persistence: 'single' | 'hold-capable' = 'hold-capable',
) => fromFaces('canonical-hold', 'canonical-hold', [{
  ...faceFromEntries(['q'], mode, { f: 'x', g: 'y' }),
  inputRole: 'modifier',
  triggerPersistence: persistence,
}]);

const base = (mode: FaceMode, output: 'x' | 'y') => {
  const layout = holdFaceLayout(mode);
  const realization = layout.baseActionRealizations?.get(output);
  assert.ok(realization);
  return realization;
};

test('useHold=falseはauthoring-derived base actionをそのまま返す', () => {
  const result = realizeTriggerActions(base('simultaneous', 'x'), { useHold: false });

  assert.deepEqual(result.actions.map((action) => action.keys), [['q', 'f']]);
  assert.deepEqual(result.actions.map((action) => action.outputKeys), [['f']]);
  assert.deepEqual(result.actions.map((action) => action.triggerKeys), [['q']]);
  assert.deepEqual(result.actions.map((action) => action.heldKeys), [[]]);
  assert.equal(result.holdState, undefined);
});

test('simultaneous holdはstart後に同じgroupをcontinueして再Pressを除く', () => {
  const first = realizeTriggerActions(base('simultaneous', 'x'), { useHold: true });
  assert.deepEqual(first.actions.map((action) => ({
    keys: action.keys,
    held: action.heldKeys,
    phase: action.holdPhase,
  })), [{
    keys: ['q', 'f'],
    held: ['q'],
    phase: 'start',
  }]);
  assert.deepEqual(first.holdState?.keys, ['q']);

  const second = realizeTriggerActions(
    base('simultaneous', 'y'),
    { useHold: true },
    first.holdState,
  );
  assert.deepEqual(second.actions.map((action) => ({
    keys: action.keys,
    output: action.outputKeys,
    trigger: action.triggerKeys,
    held: action.heldKeys,
    phase: action.holdPhase,
  })), [{
    keys: ['g'],
    output: ['g'],
    trigger: [],
    held: ['q'],
    phase: 'continue',
  }]);
});

test('single Capability不在ではuseHold=trueでもholdを開始しない', () => {
  const layout = holdFaceLayout('simultaneous', 'single');
  const realization = layout.baseActionRealizations?.get('x');
  assert.ok(realization);

  const result = realizeTriggerActions(realization, { useHold: true });
  assert.deepEqual(result.actions.map((action) => action.keys), [['q', 'f']]);
  assert.ok(result.actions.every((action) => action.heldKeys.length === 0));
  assert.equal(result.holdState, undefined);
});

test('prefixはtrigger actionでstartし後続targetへcontinueする', () => {
  const first = realizeTriggerActions(base('prefix', 'x'), { useHold: true });
  assert.deepEqual(first.actions.map((action) => ({
    keys: action.keys,
    held: action.heldKeys,
    phase: action.holdPhase,
  })), [
    { keys: ['q'], held: ['q'], phase: 'start' },
    { keys: ['f'], held: ['q'], phase: 'continue' },
  ]);

  const second = realizeTriggerActions(base('prefix', 'y'), { useHold: true }, first.holdState);
  assert.deepEqual(second.actions.map((action) => ({
    keys: action.keys,
    held: action.heldKeys,
    phase: action.holdPhase,
  })), [
    { keys: ['g'], held: ['q'], phase: 'continue' },
  ]);
});

test('suffixはactive holdがorderを破るためrelease/repressしてRequirementを維持する', () => {
  const first = realizeTriggerActions(base('suffix', 'x'), { useHold: true });
  assert.deepEqual(first.actions.map((action) => ({
    keys: action.keys,
    held: action.heldKeys,
    phase: action.holdPhase,
  })), [
    { keys: ['f'], held: [], phase: undefined },
    { keys: ['q'], held: ['q'], phase: 'start' },
  ]);

  const second = realizeTriggerActions(base('suffix', 'y'), { useHold: true }, first.holdState);
  assert.deepEqual(second.actions.map((action) => ({
    keys: action.keys,
    held: action.heldKeys,
    phase: action.holdPhase,
  })), [
    { keys: ['g'], held: [], phase: undefined },
    { keys: ['q'], held: ['q'], phase: 'start' },
  ]);
});

test('order.after側がheldでbefore側にfresh Pressが必要ならcontinueしない', () => {
  const input: SemanticInput = {
    output: 'x',
    physicalKeys: ['d', 'q'],
    requirements: [{ kind: 'order', before: ['d'], after: ['q'] }],
    capabilities: [{ kind: 'while-held', keys: ['q'] }],
    layerId: 'single',
    roles: [{ key: 'q', role: 'modifier' }],
    faceMemberships: [],
  };
  const realization: BaseActionRealization = {
    input,
    actions: [['d'], ['q']],
    defaultOutputKeys: ['d'],
    defaultTriggerKeys: ['q'],
    defaultHoldKeys: ['q'],
  };

  const result = realizeTriggerActions(
    [realization],
    { useHold: true },
    { keys: ['q'] },
  );

  assert.deepEqual(result.actions.map((action) => ({
    keys: action.keys,
    held: action.heldKeys,
    phase: action.holdPhase,
  })), [
    { keys: ['d'], held: [], phase: undefined },
    { keys: ['q'], held: ['q'], phase: 'start' },
  ]);
});

test('order.before側がheldでafter側がfreshならcontinueできる', () => {
  const input: SemanticInput = {
    output: 'x',
    physicalKeys: ['d', 'q'],
    requirements: [{ kind: 'order', before: ['q'], after: ['d'] }],
    capabilities: [{ kind: 'while-held', keys: ['q'] }],
    layerId: 'single',
    roles: [{ key: 'q', role: 'modifier' }],
    faceMemberships: [],
  };
  const realization: BaseActionRealization = {
    input,
    actions: [['q'], ['d']],
    defaultOutputKeys: ['d'],
    defaultTriggerKeys: ['q'],
    defaultHoldKeys: ['q'],
  };

  const result = realizeTriggerActions(
    [realization],
    { useHold: true },
    { keys: ['q'] },
  );

  assert.deepEqual(result.actions.map((action) => ({
    keys: action.keys,
    held: action.heldKeys,
    phase: action.holdPhase,
  })), [
    { keys: ['d'], held: ['q'], phase: 'continue' },
  ]);
});

test('held keyだけで新outputを作る入力はcontinueせずrelease/restartする', () => {
  const layout = fromFaces('self-hold', 'self-hold', [{
    ...faceFromEntries(['a'], 'simultaneous', { a: 'x' }),
    inputRole: 'modifier',
    triggerPersistence: 'hold-capable',
  }]);
  const realization = layout.baseActionRealizations?.get('x');
  assert.ok(realization);

  const first = realizeTriggerActions(realization, { useHold: true });
  const second = realizeTriggerActions(realization, { useHold: true }, first.holdState);

  assert.deepEqual(first.actions.map((action) => action.keys), [['a']]);
  assert.equal(first.actions[0].holdPhase, 'start');
  assert.deepEqual(second.actions.map((action) => action.keys), [['a']]);
  assert.equal(second.actions[0].holdPhase, 'start');
});

test('reciprocal Capabilityはdefault groupと別groupのactive holdも受け入れる', () => {
  const input: SemanticInput = {
    output: 'が',
    physicalKeys: ['f', 'j'],
    requirements: [{ kind: 'overlap', keys: ['f', 'j'] }],
    capabilities: [
      { kind: 'while-held', keys: ['f'] },
      { kind: 'while-held', keys: ['j'] },
    ],
    layerId: 'layer:濁音',
    roles: [
      { key: 'f', role: 'modifier' },
      { key: 'j', role: 'modifier' },
    ],
    faceMemberships: [],
  };
  const realization: BaseActionRealization = {
    input,
    actions: [['f', 'j']],
    defaultOutputKeys: ['f'],
    defaultTriggerKeys: ['j'],
    defaultHoldKeys: ['j'],
    alternateParticipations: [{
      outputKeys: ['j'],
      triggerKeys: ['f'],
      holdKeys: ['f'],
    }],
  };

  const withFActive = realizeTriggerActions(
    [realization],
    { useHold: true },
    { keys: ['f'] },
  );
  assert.deepEqual(withFActive.actions.map((action) => action.keys), [['j']]);
  assert.deepEqual(withFActive.actions.map((action) => action.outputKeys), [['j']]);
  assert.deepEqual(withFActive.actions.map((action) => action.triggerKeys), [[]]);
  assert.deepEqual(withFActive.actions.map((action) => action.heldKeys), [['f']]);
  assert.deepEqual(withFActive.holdState?.keys, ['f']);

  const fresh = realizeTriggerActions([realization], { useHold: true });
  assert.deepEqual(fresh.actions.map((action) => action.outputKeys), [['f']]);
  assert.deepEqual(fresh.actions.map((action) => action.triggerKeys), [['j']]);
  assert.deepEqual(fresh.holdState?.keys, ['j']);
});

test('partial while-held groupだけを保持し残りkeyは対象ごとに再Pressする', () => {
  const input: SemanticInput = {
    output: 'そく',
    physicalKeys: ['d', 'j', 'thumb-r'],
    requirements: [{ kind: 'overlap', keys: ['d', 'j', 'thumb-r'] }],
    capabilities: [{ kind: 'while-held', keys: ['thumb-r'] }],
    layerId: 'combo',
    roles: [{ key: 'thumb-r', role: 'modifier' }, { key: 'd', role: 'modifier' }],
    faceMemberships: [],
  };
  const realization: BaseActionRealization = {
    input,
    actions: [['thumb-r', 'd', 'j']],
    defaultOutputKeys: ['j'],
    defaultTriggerKeys: ['thumb-r', 'd'],
    defaultHoldKeys: ['thumb-r'],
  };

  const first = realizeTriggerActions([realization], { useHold: true });
  const second = realizeTriggerActions([realization], { useHold: true }, first.holdState);

  assert.deepEqual(first.actions[0].keys, ['thumb-r', 'd', 'j']);
  assert.deepEqual(second.actions[0].keys, ['d', 'j']);
  assert.deepEqual(second.actions[0].heldKeys, ['thumb-r']);
});

test('current inputがactive groupのCapabilityを持たなければholdを終了する', () => {
  const heldInput: SemanticInput = {
    output: 'x',
    physicalKeys: ['q', 'f'],
    requirements: [{ kind: 'overlap', keys: ['f', 'q'] }],
    capabilities: [{ kind: 'while-held', keys: ['q'] }],
    layerId: 'single',
    roles: [{ key: 'q', role: 'modifier' }],
    faceMemberships: [],
  };
  const plainInput: SemanticInput = {
    output: 'y',
    physicalKeys: ['j'],
    requirements: [],
    capabilities: [],
    layerId: 'single',
    roles: [],
    faceMemberships: [],
  };

  const start = realizeTriggerActions([{
    input: heldInput,
    actions: [['q', 'f']],
    defaultOutputKeys: ['f'],
    defaultTriggerKeys: ['q'],
    defaultHoldKeys: ['q'],
  }], { useHold: true });
  const plain = realizeTriggerActions([{
    input: plainInput,
    actions: [['j']],
    defaultOutputKeys: ['j'],
  }], { useHold: true }, start.holdState);

  assert.deepEqual(plain.actions[0].keys, ['j']);
  assert.deepEqual(plain.actions[0].heldKeys, []);
  assert.equal(plain.holdState, undefined);
});
