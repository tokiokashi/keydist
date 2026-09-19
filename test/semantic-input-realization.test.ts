import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileSequenceInputArtifacts,
  flattenBaseActionRealizations,
  validateBaseActionRealization,
  type BaseActionRealization,
  type BaseActionRealizationSequence,
  type SemanticInput,
} from '../src/core/semantic-input/index.ts';
import { resolveKeyId } from '../src/geometry.ts';
import { fromFaces, LAYOUT_BY_ID, type Face } from '../src/layouts/index.ts';

const semanticInput = (
  physicalKeys: readonly string[],
  requirements: SemanticInput['requirements'] = [],
): SemanticInput => ({
  output: 'x',
  physicalKeys,
  requirements,
  capabilities: [],
  layerId: 'single',
  roles: [],
  faceMemberships: [],
});

const baseRealization = (
  input: SemanticInput,
  actions: readonly (readonly string[])[],
  extra: Partial<BaseActionRealization> = {},
): BaseActionRealization => ({
  input,
  actions,
  defaultOutputKeys: input.physicalKeys,
  ...extra,
});

test('BaseActionRealizationはRequirementからgroupingを推測せず明示actionを使う', () => {
  const input = semanticInput(['d', 'h'], [
    { kind: 'overlap', keys: ['d', 'h'] },
  ]);
  const combined = baseRealization(input, [['d', 'h']]);
  const separate = baseRealization(input, [['d'], ['h']]);

  assert.deepEqual(
    flattenBaseActionRealizations([combined]).map((action) => action.keys),
    [['d', 'h']],
  );
  assert.deepEqual(
    flattenBaseActionRealizations([separate]).map((action) => action.keys),
    [['d'], ['h']],
  );
});

test('Requirementなしのmulti-key入力もcombined/separateをRealization側で選べる', () => {
  const input = semanticInput(['a', 'd']);
  const combined = baseRealization(input, [['a', 'd']]);
  const separate = baseRealization(input, [['a'], ['d']]);

  assert.deepEqual(
    flattenBaseActionRealizations([combined]).map((action) => action.keys),
    [['a', 'd']],
  );
  assert.deepEqual(
    flattenBaseActionRealizations([separate]).map((action) => action.keys),
    [['a'], ['d']],
  );
});

test('legacy Sequence compilerはsource Step境界をbase actionとして保持する', () => {
  const artifacts = compileSequenceInputArtifacts(
    'x',
    [['space', 'j'], ['j']],
    'single',
  );

  assert.equal(artifacts.semanticInputs.length, 2);
  assert.equal(artifacts.baseActionRealizations.length, 2);
  assert.equal(
    artifacts.baseActionRealizations[0].input,
    artifacts.semanticInputs[0],
  );
  assert.equal(
    artifacts.baseActionRealizations[1].input,
    artifacts.semanticInputs[1],
  );
  assert.deepEqual(artifacts.baseActionRealizations[0].actions, [['thumb-r', 'j']]);
  assert.deepEqual(artifacts.baseActionRealizations[0].defaultOutputKeys, ['j', 'thumb-r']);
  assert.equal(artifacts.baseActionRealizations[0].defaultTriggerKeys, undefined);
  assert.deepEqual(artifacts.baseActionRealizations[1].actions, [['j']]);
  assert.deepEqual(artifacts.baseActionRealizations[1].defaultOutputKeys, ['j']);
});

test('Face prefix multi-triggerのdefault groupingはFace sourceから[T] -> [K]として作る', () => {
  const face: Face = {
    trigger: ['d', 'k'],
    mode: 'prefix',
    rows: ['', '', ['', '', '', '', '', '', 'x'], ''],
    inputRole: 'modifier',
    triggerPersistence: 'single',
  };
  const layout = fromFaces('prefix-base-realization', 'prefix-base-realization', [face]);
  const semantic = layout.semanticInputSequences?.get('x');
  const base = layout.baseActionRealizations?.get('x');

  assert.ok(semantic);
  assert.ok(base);
  assert.equal(semantic.length, 1);
  assert.deepEqual(semantic[0].requirements, [
    { kind: 'order', before: ['d', 'k'], after: ['j'] },
  ]);
  assert.equal(base.length, 1);
  assert.equal(base[0].input, semantic[0]);
  assert.deepEqual(base[0].actions, [['d', 'k'], ['j']]);
  assert.deepEqual(base[0].defaultTriggerKeys, ['d', 'k']);
  assert.deepEqual(base[0].defaultOutputKeys, ['j']);
});

test('Face simultaneous + orderのdefault groupingはFace sourceどおり1 actionを保つ', () => {
  const face: Face = {
    trigger: ['space'],
    mode: 'simultaneous',
    triggerOrder: 'prefix',
    rows: ['', '', ['', '', '', '', '', '', 'x'], ''],
    inputRole: 'modifier',
    triggerPersistence: 'hold-capable',
  };
  const layout = fromFaces('sands-base-realization', 'sands-base-realization', [face]);
  const semantic = layout.semanticInputSequences?.get('x');
  const base = layout.baseActionRealizations?.get('x');

  assert.ok(semantic);
  assert.ok(base);
  assert.deepEqual(semantic[0].requirements, [
    { kind: 'overlap', keys: ['j', 'thumb-r'] },
    { kind: 'order', before: ['thumb-r'], after: ['j'] },
  ]);
  assert.deepEqual(base[0].actions, [['thumb-r', 'j']]);
  assert.deepEqual(base[0].defaultTriggerKeys, ['thumb-r']);
  assert.deepEqual(base[0].defaultOutputKeys, ['j']);
  assert.deepEqual(base[0].defaultHoldKeys, ['thumb-r']);
});

test('BaseActionRealizationは空realization / 空actionをrejectする', () => {
  const input = semanticInput(['d']);

  assert.throws(
    () => validateBaseActionRealization(baseRealization(input, [])),
    /1 action以上必要/,
  );
  assert.throws(
    () => validateBaseActionRealization(baseRealization(input, [[]])),
    /1 key以上必要/,
  );
});

test('BaseActionRealizationはinput.physicalKeys外のkeyをrejectする', () => {
  const input = semanticInput(['d']);

  assert.throws(
    () => validateBaseActionRealization(baseRealization(input, [['k']])),
    /physicalKeys外/,
  );
});

test('BaseActionRealizationは必要physicalKeysの欠落をrejectする', () => {
  const input = semanticInput(['d', 'k']);

  assert.throws(
    () => validateBaseActionRealization(baseRealization(input, [['d']])),
    /欠落している: k/,
  );
});

test('BaseActionRealizationのdefault output/trigger metadataを検証する', () => {
  const input = semanticInput(['d', 'k']);

  assert.doesNotThrow(() => validateBaseActionRealization(baseRealization(
    input,
    [['d', 'k']],
    {
      defaultOutputKeys: ['k'],
      defaultTriggerKeys: ['d'],
    },
  )));
  assert.doesNotThrow(() => validateBaseActionRealization(baseRealization(
    input,
    [['d', 'k']],
    {
      defaultOutputKeys: ['d'],
      defaultTriggerKeys: ['d'],
    },
  )));
  assert.throws(
    () => validateBaseActionRealization(baseRealization(
      input,
      [['d', 'k']],
      { defaultOutputKeys: [] },
    )),
    /defaultOutputKeysは非空/,
  );
  assert.throws(
    () => validateBaseActionRealization(baseRealization(
      input,
      [['d', 'k']],
      { defaultTriggerKeys: ['j'] },
    )),
    /defaultTriggerKeysがinput.physicalKeys外/,
  );
});

test('BaseActionRealization.defaultHoldKeysはwhile-held Capabilityとexact matchする', () => {
  const input: SemanticInput = {
    ...semanticInput(['d', 'k']),
    capabilities: [{ kind: 'while-held', keys: ['d'] }],
  };

  assert.doesNotThrow(() => validateBaseActionRealization(baseRealization(
    input,
    [['d', 'k']],
    {
      defaultOutputKeys: ['k'],
      defaultTriggerKeys: ['d'],
      defaultHoldKeys: ['d'],
    },
  )));
  assert.throws(
    () => validateBaseActionRealization(baseRealization(
      input,
      [['d', 'k']],
      {
        defaultOutputKeys: ['k'],
        defaultTriggerKeys: ['d'],
        defaultHoldKeys: [],
      },
    )),
    /非空/,
  );
  assert.throws(
    () => validateBaseActionRealization(baseRealization(
      input,
      [['d', 'k']],
      {
        defaultOutputKeys: ['d'],
        defaultTriggerKeys: ['k'],
        defaultHoldKeys: ['k'],
      },
    )),
    /Capabilityと一致/,
  );
  assert.throws(
    () => validateBaseActionRealization(baseRealization(
      {
        ...input,
        capabilities: [{ kind: 'while-held', keys: ['d', 'k'] }],
      },
      [['d'], ['k']],
      {
        defaultOutputKeys: ['k'],
        defaultTriggerKeys: ['d', 'k'],
        defaultHoldKeys: ['d', 'k'],
      },
    )),
    /1 actionに収まる/,
  );
});

test('BaseActionRealizationはalias解決後のphysical key重複をrejectする', () => {
  const input = semanticInput(['thumb-r']);

  assert.throws(
    () => validateBaseActionRealization(baseRealization(input, [['space', 'thumb-r']])),
    /physical key「thumb-r」が重複/,
  );
});

test('flatten時はaliasをcanonical PhysicalKeyIdへ正規化する', () => {
  const input = semanticInput(['thumb-r']);
  const realization = baseRealization(input, [['space']]);

  assert.deepEqual(
    flattenBaseActionRealizations([realization]).map((action) => action.keys),
    [['thumb-r']],
  );
});

test('built-in全outputでauthoring-derived base actionがlegacy Layout.mapと一致する', () => {
  for (const layout of LAYOUT_BY_ID.values()) {
    assert.ok(layout.semanticInputSequences, `${layout.id}: semanticInputSequences`);
    assert.ok(layout.baseActionRealizations, `${layout.id}: baseActionRealizations`);

    for (const [output, legacySequence] of layout.map) {
      const semanticSequence = layout.semanticInputSequences.get(output);
      const baseRealizations: BaseActionRealizationSequence | undefined =
        layout.baseActionRealizations.get(output);
      assert.ok(semanticSequence, `${layout.id}: ${output} semantic sequence`);
      assert.ok(baseRealizations, `${layout.id}: ${output} base realization`);

      for (const realization of baseRealizations) {
        assert.ok(
          semanticSequence.includes(realization.input),
          `${layout.id}: ${output} realization input belongs to semantic sequence`,
        );
      }

      const actions = flattenBaseActionRealizations(baseRealizations);
      assert.equal(
        actions.length,
        legacySequence.length,
        `${layout.id}: ${output} action count`,
      );

      for (const [index, legacyStep] of legacySequence.entries()) {
        const expected = [...new Set(legacyStep.map(resolveKeyId))].sort();
        const actual = [...actions[index].keys].sort();
        assert.deepEqual(actual, expected, `${layout.id}: ${output} action ${index}`);
      }
    }
  }
});

test('composed outputはcomponentのBaseActionRealization objectを再利用する', () => {
  for (const id of ['shin-jis-prefix', 'shin-jis-simultaneous', 'tsuki-2-263']) {
    const layout = LAYOUT_BY_ID.get(id)!;
    const source = layout.baseActionRealizations?.get('ほ');
    const mark = layout.baseActionRealizations?.get('゛');
    const output = layout.baseActionRealizations?.get('ぼ');

    assert.ok(source, `${id}: source`);
    assert.ok(mark, `${id}: mark`);
    assert.ok(output, `${id}: output`);
    assert.equal(output.length, source.length + mark.length, id);
    assert.equal(output[0], source[0], `${id}: source realization reuse`);
    assert.equal(output.at(-1), mark.at(-1), `${id}: mark realization reuse`);
  }
});


test('built-in全outputでbase participationがlegacy StepSemanticと一致する', () => {
  for (const layout of LAYOUT_BY_ID.values()) {
    assert.ok(layout.baseActionRealizations, `${layout.id}: baseActionRealizations`);

    for (const output of layout.map.keys()) {
      const base = layout.baseActionRealizations.get(output);
      const legacy = layout.stepSemantics?.get(output);
      assert.ok(base, `${layout.id}: ${output} base realization`);
      assert.ok(legacy, `${layout.id}: ${output} legacy StepSemantic`);

      const actions = flattenBaseActionRealizations(base);
      assert.equal(actions.length, legacy.length, `${layout.id}: ${output} action count`);

      for (const [index, action] of actions.entries()) {
        assert.deepEqual(
          [...action.outputKeys].sort(),
          [...legacy[index].outputKeys.map(resolveKeyId)].sort(),
          `${layout.id}: ${output} output participation ${index}`,
        );
        assert.deepEqual(
          [...action.triggerKeys].sort(),
          [...legacy[index].triggerKeys.map(resolveKeyId)].sort(),
          `${layout.id}: ${output} trigger participation ${index}`,
        );

        const derivedRole = action.input.layerId === 'combo'
          ? 'composition'
          : action.input.roles.length > 0 ? 'modifier' : 'layer';
        assert.equal(
          derivedRole,
          legacy[index].inputRole,
          `${layout.id}: ${output} inputRole ${index}`,
        );

        const sourceRealization: BaseActionRealization | undefined =
          base.find((item: BaseActionRealization) => item.input === action.input);
        const defaultTriggers: readonly string[] =
          sourceRealization?.defaultTriggerKeys ?? [];
        const hasHoldCapability: boolean = action.input.capabilities.some(
          (capability): boolean =>
            capability.kind === 'while-held'
            && capability.keys.length === defaultTriggers.length
            && capability.keys.every((key): boolean => defaultTriggers.includes(key)),
        );
        const derivedPersistence: 'single' | 'hold-capable' | undefined =
          action.triggerKeys.length === 0
            ? undefined
            : hasHoldCapability ? 'hold-capable' : 'single';
        assert.equal(
          derivedPersistence,
          legacy[index].triggerPersistence,
          `${layout.id}: ${output} triggerPersistence ${index}`,
        );
      }
    }
  }
});
