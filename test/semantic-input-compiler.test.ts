import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compileFaceSemanticInputs,
  compileSequenceSemanticInputs,
  type SemanticInput,
} from '../src/core/semantic-input/index.ts';
import { LAYOUTS, LAYOUTS_JA, fromFaces, fromKana, fromRows } from '../src/layouts/index.ts';
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

test('legacy Step列はordered SemanticInput sequenceへcompileする', () => {
  const inputs = compileSequenceSemanticInputs(
    'x',
    [['space', 'j'], ['j']],
    'single',
  );

  assert.equal(inputs.length, 2);
  assert.deepEqual(inputs[0], {
    output: '',
    physicalKeys: ['j', 'thumb-r'],
    requirements: [
      { kind: 'overlap', keys: ['j', 'thumb-r'] },
    ],
    capabilities: [],
    layerId: 'single',
    classifications: [],
    roles: [],
    faceMemberships: [],
  });
  assert.deepEqual(inputs[1], {
    output: 'x',
    physicalKeys: ['j'],
    requirements: [],
    capabilities: [],
    layerId: 'single',
    classifications: [],
    roles: [],
    faceMemberships: [],
  });
});

test('legacy Step compilerはStep間の再押下を許しorder Requirementへ重複させない', () => {
  const inputs = compileSequenceSemanticInputs(
    'x',
    [['d'], ['d', 'k'], ['d']],
    'single',
  );

  assert.equal(inputs.length, 3);
  assert.deepEqual(inputs.map((input) => input.output), ['', '', 'x']);
  assert.deepEqual(inputs[0].requirements, []);
  assert.deepEqual(inputs[1].requirements, [
    { kind: 'overlap', keys: ['d', 'k'] },
  ]);
  assert.deepEqual(inputs[2].requirements, []);
});

test('legacy Step compilerは空Sequence / 空Stepをerrorにする', () => {
  assert.throws(
    () => compileSequenceSemanticInputs('x', [], 'single'),
    /1 step以上必要/,
  );
  assert.throws(
    () => compileSequenceSemanticInputs('x', [[]], 'single'),
    /1 key以上必要/,
  );
});

test('fromKanaはlegacy Step列をcanonical SemanticInput列として保持する', () => {
  const layout = fromKana('direct-sequence', 'direct-sequence', {
    x: [['space', 'j'], ['j']],
  });
  const inputs = layout.canonicalInputs.get('x')?.[0]?.semanticInputs;

  assert.ok(inputs);
  assert.equal(inputs.length, 2);
  assert.deepEqual(inputs[0].physicalKeys, ['j', 'thumb-r']);
  assert.equal(inputs[0].output, '');
  assert.deepEqual(inputs[1].physicalKeys, ['j']);
  assert.equal(inputs[1].output, 'x');
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
    classifications: [],
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
    classifications: [],
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
    classifications: [],
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

test('同一physicalKeysで同時成立し得るactivation variantをerrorにする', () => {
  assert.throws(
    () => compileFaceSemanticInputs([
      face(['d'], 'simultaneous', { h: 'へ' }, { layer: '中指シフト' }),
      face(['d'], 'prefix', { h: 'ほ' }, { layer: '中指シフト' }),
    ]),
    /同時成立し得るRequirement set/,
  );
});

test('同一outputの複数activation variantは別SemanticInputとして保持する', () => {
  const faces = [
    face(['d'], 'simultaneous', { h: 'へ' }),
    face(['d'], 'prefix', { h: 'へ' }),
  ];
  const inputs = compileFaceSemanticInputs(faces);
  assert.equal(inputs.length, 2);
  assert.ok(inputs.every((input) => input.output === 'へ'));

  const layout = fromFaces('same-output-alternatives', 'same-output-alternatives', faces);
  const alternatives = layout.canonicalInputs.get('へ');
  assert.ok(alternatives);
  assert.equal(alternatives.length, 2);
  assert.deepEqual(
    alternatives.map((alternative) => alternative.semanticInputs[0].requirements),
    [
      [{ kind: 'overlap', keys: ['d', 'h'] }],
      [{ kind: 'order', before: ['d'], after: ['h'] }],
    ],
  );
});

test('同一Requirement/outputのreciprocal FaceはCapabilityをunionする', () => {
  const inputs = compileFaceSemanticInputs([
    face(['j'], 'simultaneous', { f: 'が' }, {
      layer: '濁音',
      triggerPersistence: 'hold-capable',
    }),
    face(['f'], 'simultaneous', { j: 'が' }, {
      layer: '濁音',
      triggerPersistence: 'hold-capable',
    }),
  ]);

  assert.equal(inputs.length, 1);
  assert.deepEqual(inputs[0].capabilities, [
    { kind: 'while-held', keys: ['f'] },
    { kind: 'while-held', keys: ['j'] },
  ]);
  assert.deepEqual(inputs[0].roles, [
    { key: 'f', role: 'modifier' },
    { key: 'j', role: 'modifier' },
  ]);
  assert.equal(inputs[0].faceMemberships.length, 2);
});

test('逆向きorderでmutually exclusiveな同一physicalKeysは別SemanticInputとして共存する', () => {
  const inputs = compileFaceSemanticInputs([
    face(['d'], 'prefix', { k: 'も' }, { layer: '中指シフト' }),
    face(['k'], 'prefix', { d: 'ら' }, { layer: '中指シフト' }),
  ]);

  assert.equal(inputs.length, 2);
  const byOutput = new Map(inputs.map((input) => [input.output, input]));
  assert.deepEqual(byOutput.get('も')?.requirements, [
    { kind: 'order', before: ['d'], after: ['k'] },
  ]);
  assert.deepEqual(byOutput.get('ら')?.requirements, [
    { kind: 'order', before: ['k'], after: ['d'] },
  ]);
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


test('self-triggerでorderのbefore / afterが重なるauthoringをerrorにする', () => {
  assert.throws(
    () => compileFaceSemanticInputs([
      face(['d'], 'prefix', { d: 'x' }),
    ]),
    /before \/ afterは互いに素/,
  );
});

test('canonical sortはlocale非依存のcode-unit順を使う', () => {
  const [input] = compileFaceSemanticInputs([
    face(['ä', 'Z'], 'simultaneous', { a: 'x' }, {
      inputRole: 'composition',
      triggerPersistence: 'hold-capable',
    }),
  ]);

  assert.deepEqual(input.physicalKeys, ['Z', 'a', 'ä']);
  assert.deepEqual(input.requirements, [
    { kind: 'overlap', keys: ['Z', 'a', 'ä'] },
  ]);
  assert.deepEqual(input.capabilities, [
    { kind: 'while-held', keys: ['Z', 'ä'] },
  ]);
});


test('Faceを持つbuilt-in layoutはSemanticInput compilerで検証できる', () => {
  for (const layout of LAYOUTS_JA) {
    if (!layout.faces) continue;
    assert.doesNotThrow(
      () => compileFaceSemanticInputs(layout.faces!),
      `${layout.id} should compile to SemanticInput`,
    );
  }
});


test('built-inの相互Face membershipはauthoring側へ明示される', () => {
  const shingeta = LAYOUTS_JA.find((layout) => layout.id === 'shingeta')!;
  const shingetaInputs = compileFaceSemanticInputs(shingeta.faces!);
  const re = shingetaInputs.find((input) => input.output === 'れ'
    && input.physicalKeys.length === 2
    && input.physicalKeys.includes('d')
    && input.physicalKeys.includes('k'))!;
  assert.deepEqual(re.roles, [
    { key: 'd', role: 'modifier' },
    { key: 'k', role: 'modifier' },
  ]);
  assert.equal(re.faceMemberships.length, 2);

  const naginata = LAYOUTS_JA.find((layout) => layout.id === 'naginata-v18')!;
  const naginataInputs = compileFaceSemanticInputs(naginata.faces!);
  const ga = naginataInputs.find((input) => input.output === 'が'
    && input.physicalKeys.length === 2
    && input.physicalKeys.includes('f')
    && input.physicalKeys.includes('j'))!;
  assert.deepEqual(ga.roles, [
    { key: 'f', role: 'modifier' },
    { key: 'j', role: 'modifier' },
  ]);
  assert.deepEqual(ga.capabilities, [
    { kind: 'while-held', keys: ['f'] },
    { kind: 'while-held', keys: ['j'] },
  ]);
  assert.equal(ga.faceMemberships.length, 2);
});

test('legacy fromFaces mapは相互Faceを明示しても既存の打鍵列を保持する', () => {
  const shingeta = LAYOUTS_JA.find((layout) => layout.id === 'shingeta')!;
  assert.deepEqual(shingeta.map.get('れ'), [['k', 'd']]);
  assert.deepEqual(shingeta.map.get('さ'), [['l', 's']]);

  const naginata = LAYOUTS_JA.find((layout) => layout.id === 'naginata-v18')!;
  assert.deepEqual(naginata.map.get('が'), [['j', 'f']]);
});


test('built-in Layoutは全map outputにcanonical SemanticInput sequenceを持つ', () => {
  for (const layout of [...LAYOUTS, ...LAYOUTS_JA]) {
    assert.ok(layout.canonicalInputs, `${layout.id}: canonicalInputs`);
    for (const output of layout.map.keys()) {
      const inputs = layout.canonicalInputs.get(output)?.[0]?.semanticInputs;
      assert.ok(inputs && inputs.length > 0, `${layout.id}: ${output}`);
    }
  }
});

test('Face prefixはlegacy 2 Stepでもcanonicalでは1 SemanticInputのorder制約になる', () => {
  const tsuki = LAYOUTS_JA.find((layout) => layout.id === 'tsuki-2-263')!;
  assert.equal(tsuki.map.get('ぬ')?.length, 2);

  const inputs = tsuki.canonicalInputs.get('ぬ')?.[0]?.semanticInputs;
  assert.ok(inputs);
  assert.equal(inputs.length, 1);
  assert.deepEqual(inputs[0].requirements, [
    { kind: 'order', before: ['d'], after: ['y'] },
  ]);
});

test('composed outputはsource / markのcanonical SemanticInput列を再利用して連結する', () => {
  for (const id of ['shin-jis-prefix', 'shin-jis-simultaneous', 'tsuki-2-263']) {
    const layout = LAYOUTS_JA.find((candidate) => candidate.id === id)!;
    const source = layout.canonicalInputs.get('ほ')?.[0]?.semanticInputs;
    const mark = layout.canonicalInputs.get('゛')?.[0]?.semanticInputs;
    const output = layout.canonicalInputs.get('ぼ')?.[0]?.semanticInputs;

    assert.ok(source, `${id}: source`);
    assert.ok(mark, `${id}: mark`);
    assert.ok(output, `${id}: output`);
    assert.equal(output.length, source.length + mark.length, id);
    assert.equal(output[0], source[0], `${id}: source SemanticInputを再利用`);
    assert.equal(output.at(-1), mark.at(-1), `${id}: mark SemanticInputを再利用`);
  }
});

test('consumer cutover後はbase layerをcanonical singleへ統一する', () => {
  const tsuki = LAYOUTS_JA.find((layout) => layout.id === 'tsuki-2-263')!;
  assert.equal(tsuki.canonicalInputs.get('そ')?.[0]?.semanticInputs?.[0].layerId, 'single');
  assert.deepEqual(tsuki.stepLayers?.get('そ'), ['single']);
});

test('withCombos由来outputは1つのcombo SemanticInput + overlapになる', () => {
  const combo = LAYOUTS_JA.find((layout) => layout.id === 'oonishi-custom-combo')
    ?? LAYOUTS.find((layout) => layout.id === 'oonishi-custom-combo');
  assert.ok(combo);

  const inputs = combo.canonicalInputs.get('desita')?.[0]?.semanticInputs;
  assert.ok(inputs);
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].layerId, 'combo');
  assert.equal(inputs[0].requirements[0]?.kind, 'overlap');
  assert.equal(inputs[0].output, 'desita');
});


test('fromRowsは同じoutputの複数物理キーをcanonical alternativeとして保持する', () => {
  const layout = fromRows('duplicate-output', 'duplicate-output', [
    '',
    'aa',
    '',
    '',
  ]);
  const alternatives = layout.canonicalInputs.get('a');
  assert.ok(alternatives);
  assert.equal(alternatives.length, 2);
  assert.deepEqual(
    alternatives.map((alternative) => alternative.semanticInputs[0].physicalKeys),
    [['q'], ['w']],
  );
  assert.deepEqual(layout.map.get('a'), [['q']], 'legacy mapはauthoring defaultだけを保持する');
});

test('fromKana tuple定義は同じoutputの複数pathを保持する', () => {
  const layout = fromKana('duplicate-kana', 'duplicate-kana', [
    ['x', [['f']]],
    ['x', [['j']]],
  ]);
  const alternatives = layout.canonicalInputs.get('x');
  assert.ok(alternatives);
  assert.equal(alternatives.length, 2);
  assert.deepEqual(
    alternatives.map((alternative) => alternative.semanticInputs[0].physicalKeys),
    [['f'], ['j']],
  );
});

test('別SemanticInputから同じFace outputが成立する場合は別alternativeになる', () => {
  const layout = fromFaces('face-alternatives', 'face-alternatives', [
    face(['d'], 'simultaneous', { f: 'x' }),
    face(['k'], 'simultaneous', { j: 'x' }),
  ]);
  const alternatives = layout.canonicalInputs.get('x');
  assert.ok(alternatives);
  assert.equal(alternatives.length, 2);
  assert.notEqual(alternatives[0].semanticInputs[0], alternatives[1].semanticInputs[0]);
});


test('composition Faceはclassificationをcanonicalへ保持する', () => {
  const [input] = compileFaceSemanticInputs([
    face(['d', 'k'], 'simultaneous', { j: 'x' }, {
      inputRole: 'composition',
      triggerPersistence: 'single',
    }),
  ]);
  assert.deepEqual(input.classifications, ['composition']);
  assert.equal(input.layerId, 'combo');
});
