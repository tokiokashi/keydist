import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileFaceSemanticInputs, type SemanticInput } from '../src/core/semantic-input/index.ts';
import { faceFromEntries, type Face, type FaceMode } from '../src/layouts/types.ts';

const face = (
  trigger: string[],
  mode: FaceMode,
  entries: Record<string, string>,
  options: Partial<Pick<
    Face,
    'layer' | 'inputRole' | 'triggerPersistence' | 'triggerOrder'
  >> = {},
): Face => ({
  ...faceFromEntries(trigger, mode, entries),
  inputRole: trigger.length === 0 ? 'layer' : 'modifier',
  ...(trigger.length > 0 ? { triggerPersistence: 'single' as const } : {}),
  ...options,
});

test('triggerなしFaceを単打SemanticInputへcompileする', () => {
  const [input] = compileFaceSemanticInputs([
    face([], 'simultaneous', { a: 'あ' }),
  ]);

  assert.deepEqual(input, {
    output: 'あ',
    physicalKeys: ['a'],
    requirements: [],
    capabilities: [],
    layerId: 'single',
    roles: [],
    faceMemberships: [{ faceIndex: 0, cellKey: 'a' }],
  });
});

test('simultaneousはoverlap Requirementへcompileする', () => {
  const [input] = compileFaceSemanticInputs([
    face(['d'], 'simultaneous', { h: 'へ' }, { layer: '中指シフト' }),
  ]);

  assert.deepEqual(input.physicalKeys, ['d', 'h']);
  assert.deepEqual(input.requirements, [
    { kind: 'overlap', keys: ['d', 'h'] },
  ]);
  assert.deepEqual(input.roles, [{ key: 'd', role: 'modifier' }]);
  assert.equal(input.layerId, 'layer:中指シフト');
});

test('prefixはorder Requirementだけを持つ', () => {
  const [input] = compileFaceSemanticInputs([
    face(['d'], 'prefix', { h: 'へ' }),
  ]);

  assert.deepEqual(input.requirements, [
    { kind: 'order', before: ['d'], after: ['h'] },
  ]);
});

test('suffixは逆向きorder Requirementだけを持つ', () => {
  const [input] = compileFaceSemanticInputs([
    face(['d'], 'suffix', { h: 'へ' }),
  ]);

  assert.deepEqual(input.requirements, [
    { kind: 'order', before: ['h'], after: ['d'] },
  ]);
});

test('simultaneous + prefix orderはoverlapとorderを独立して持つ', () => {
  const [input] = compileFaceSemanticInputs([
    face(['space'], 'simultaneous', { j: 'え' }, {
      triggerPersistence: 'hold-capable',
      triggerOrder: 'prefix',
    }),
  ]);

  assert.deepEqual(input.physicalKeys, ['j', 'thumb-r']);
  assert.deepEqual(input.requirements, [
    { kind: 'overlap', keys: ['j', 'thumb-r'] },
    { kind: 'order', before: ['thumb-r'], after: ['j'] },
  ]);
  assert.deepEqual(input.capabilities, [
    { kind: 'while-held', keys: ['thumb-r'] },
  ]);
});

test('hold-capable Faceはtrigger集合全体をwhile-held Capabilityへ写像する', () => {
  const [input] = compileFaceSemanticInputs([
    face(['k', 'd'], 'simultaneous', { j: 'x' }, {
      inputRole: 'composition',
      triggerPersistence: 'hold-capable',
    }),
  ]);

  assert.deepEqual(input.capabilities, [
    { kind: 'while-held', keys: ['d', 'k'] },
  ]);
});

test('SemanticInput IRは一部キーだけのwhile-held capabilityを表現できる', () => {
  const input: SemanticInput = {
    output: 'そく',
    physicalKeys: ['d', 'j', 'thumb-r'],
    requirements: [
      { kind: 'overlap', keys: ['d', 'j', 'thumb-r'] },
    ],
    capabilities: [
      { kind: 'while-held', keys: ['thumb-r'] },
    ],
    layerId: 'combo',
    roles: [],
    faceMemberships: [],
  };

  assert.deepEqual(input.capabilities[0].keys, ['thumb-r']);
});

test('resolveKeyId後にaliasを同一physical identityとしてdedupeする', () => {
  const inputs = compileFaceSemanticInputs([
    face(['space'], 'simultaneous', { j: 'え' }, { layer: 'センター' }),
    face(['thumb-r'], 'simultaneous', { j: 'え' }, { layer: 'センター' }),
  ]);

  assert.equal(inputs.length, 1);
  assert.deepEqual(inputs[0].physicalKeys, ['j', 'thumb-r']);
  assert.deepEqual(inputs[0].faceMemberships, [
    { faceIndex: 0, cellKey: 'j' },
    { faceIndex: 1, cellKey: 'j' },
  ]);
});

test('相互シフトを両Faceから定義すると1 SemanticInputへdedupeしてroleをunionする', () => {
  const inputs = compileFaceSemanticInputs([
    face(['k'], 'simultaneous', { d: 'れ' }, { layer: '中指シフト' }),
    face(['d'], 'simultaneous', { k: 'れ' }, { layer: '中指シフト' }),
  ]);

  assert.equal(inputs.length, 1);
  assert.deepEqual(inputs[0], {
    output: 'れ',
    physicalKeys: ['d', 'k'],
    requirements: [
      { kind: 'overlap', keys: ['d', 'k'] },
    ],
    capabilities: [],
    layerId: 'layer:中指シフト',
    roles: [
      { key: 'd', role: 'modifier' },
      { key: 'k', role: 'modifier' },
    ],
    faceMemberships: [
      { faceIndex: 0, cellKey: 'd' },
      { faceIndex: 1, cellKey: 'k' },
    ],
  });
});

test('同一physical operationのoutput衝突をerrorにする', () => {
  assert.throws(
    () => compileFaceSemanticInputs([
      face(['d'], 'simultaneous', { h: 'へ' }, { layer: '中指シフト' }),
      face(['d'], 'simultaneous', { h: 'ほ' }, { layer: '中指シフト' }),
    ]),
    /同一physical operationに異なるoutput/,
  );
});

test('同一physicalKeysのactivation variantをerrorにする', () => {
  assert.throws(
    () => compileFaceSemanticInputs([
      face(['d'], 'simultaneous', { h: 'へ' }, { layer: '中指シフト' }),
      face(['d'], 'prefix', { h: 'へ' }, { layer: '中指シフト' }),
    ]),
    /異なるRequirement\/Capability set/,
  );
});

test('subset / superset physicalKeysは別SemanticInputとして共存できる', () => {
  const inputs = compileFaceSemanticInputs([
    face(['d'], 'simultaneous', { h: 'へ' }, { layer: '中指シフト' }),
    face(['d', 'h'], 'simultaneous', { j: 'じゃ' }, {
      inputRole: 'composition',
    }),
  ]);

  assert.equal(inputs.length, 2);
  assert.ok(inputs.some((input) => (
    input.physicalKeys.length === 2
    && input.physicalKeys[0] === 'd'
    && input.physicalKeys[1] === 'h'
  )));
  assert.ok(inputs.some((input) => (
    input.physicalKeys.length === 3
    && input.physicalKeys[0] === 'd'
    && input.physicalKeys[1] === 'h'
    && input.physicalKeys[2] === 'j'
  )));
});

test('authoring上のtrigger順にcanonical field orderが依存しない', () => {
  const first = compileFaceSemanticInputs([
    face(['k', 'd'], 'simultaneous', { j: 'x' }, {
      inputRole: 'composition',
      triggerPersistence: 'hold-capable',
    }),
  ]);
  const second = compileFaceSemanticInputs([
    face(['d', 'k'], 'simultaneous', { j: 'x' }, {
      inputRole: 'composition',
      triggerPersistence: 'hold-capable',
    }),
  ]);

  assert.deepEqual(first, second);
});

test('prefix / suffix modeと逆向きtriggerOrderの併記はerrorにする', () => {
  assert.throws(
    () => compileFaceSemanticInputs([
      face(['d'], 'prefix', { h: 'へ' }, { triggerOrder: 'suffix' }),
    ]),
    /mode=prefixとtriggerOrder=suffixが矛盾/,
  );
});
