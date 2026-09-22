import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveKeyId } from '../src/geometry.ts';
import {
  COMBO_LAYER_ID,
  faceFromEntries,
  fromFaces,
  fromRows,
  LAYOUT_BY_ID,
  withCombos,
  withShiftedOutputs,
} from '../src/layouts/index.ts';
import type { Face, Layout } from '../src/layouts/index.ts';
import { TypingInputEngine } from '../src/core/input-converter/index.ts';
import { compileSequenceInputAlternative } from '../src/core/semantic-input/index.ts';
import {
  advanceKeyPatternPresentation,
  allLayerTriggerKeys,
  allTriggerKeys,
  buildKeyPatternMatrix,
  EMPTY_KEY_PATTERN_PRESENTATION_STATE,
  findActiveLayerFace,
  matchKeyPatterns,
  summarizeCandidateMatches,
} from '../src/key-pattern-picker.ts';

function stubLayout(overrides: Partial<Layout>): Layout {
  return {
    id: 'stub',
    name: 'stub',
    map: new Map(),
    canonicalInputs: new Map(),
    legends: new Map(),
    ...overrides,
  };
}

function compiledFaces(...faces: Face[]): Layout {
  return fromFaces(
    'stub',
    'stub',
    faces.map((face): Face => ({
      ...face,
      inputRole: face.inputRole ?? 'layer',
      ...(face.trigger.length > 0 && face.triggerPersistence === undefined
        ? { triggerPersistence: 'single' as const }
        : {}),
    })),
  );
}

function directCanonical(output: string, key: string): Layout {
  return stubLayout({
    canonicalInputs: new Map([
      [output, [compileSequenceInputAlternative(output, [[key]], 'single')]],
    ]),
  });
}

function comboCanonical(output: string, keys: readonly string[], group?: string): Layout {
  return stubLayout({
    canonicalInputs: new Map([
      [output, [
        compileSequenceInputAlternative(
          output,
          [keys],
          COMBO_LAYER_ID,
          ['composition'],
          [],
          'combo',
        ),
      ]],
    ]),
    resolvedComboDefinitions: [
      { output, inputs: [...keys], keys: [...keys], ...(group === undefined ? {} : { group }) },
    ],
  });
}

test('buildKeyPatternMatrix: 単キーtrigger + 文字キーを物理キー集合へ展開する', () => {
  const face = faceFromEntries(['j'], 'simultaneous', { r: 'じ' });
  const layout = compiledFaces(face);
  const match = buildKeyPatternMatrix(layout).find((entry) => entry.output === 'じ');
  assert.deepEqual(
    match && { output: match.output, keys: match.keys },
    { output: 'じ', keys: ['j', 'r'] },
  );
});

test('buildKeyPatternMatrix: 複数trigger + 文字キーも同じ表へ展開する', () => {
  const face = faceFromEntries(['h', 'j'], 'simultaneous', { r: 'じゃ' });
  const layout = compiledFaces(face);
  const match = buildKeyPatternMatrix(layout).find((entry) => entry.output === 'じゃ');
  assert.deepEqual(
    match && { output: match.output, keys: match.keys },
    { output: 'じゃ', keys: ['h', 'j', 'r'] },
  );
});

test('buildKeyPatternMatrix: 1キー直接入力もexact判定用に含める', () => {
  const layout = directCanonical('か', 's');
  const matrix = buildKeyPatternMatrix(layout);
  assert.deepEqual(
    matrix.map((match) => ({ output: match.output, keys: match.keys })),
    [{ output: 'か', keys: ['s'] }],
  );
  assert.deepEqual(matchKeyPatterns(layout, new Set(['s'])).exact.map((match) => match.output), ['か']);
});

test('buildKeyPatternMatrix: resolvedComboDefinitionsも同じ表へ入れる', () => {
  const layout = comboCanonical('ye', ['k', 'd'], '拗音拡張');
  assert.deepEqual(
    buildKeyPatternMatrix(layout).map((match) => ({
      output: match.output,
      group: match.group,
      keys: match.keys,
    })),
    [{ output: 'ye', group: '拗音拡張', keys: ['d', 'k'] }],
  );
});

test('matchKeyPatterns: レイヤー出力はtrigger + 文字キーの完全一致でexactになる', () => {
  const face = faceFromEntries(['j'], 'simultaneous', { r: 'じ' });
  const layout = compiledFaces(face);
  const result = matchKeyPatterns(layout, new Set(['j', 'r']));
  assert.deepEqual(result.exact.map((match) => match.output), ['じ']);
  assert.equal(result.candidates.size, 0);
});

test('matchKeyPatterns: simultaneousはどちら側から選んでも1キー先を候補にできる', () => {
  const face = faceFromEntries(['j'], 'simultaneous', { r: 'じ' });
  const layout = compiledFaces(face);
  assert.equal(matchKeyPatterns(layout, new Set(['j'])).candidates.get('r')?.[0].output, 'じ');
  assert.equal(matchKeyPatterns(layout, new Set(['r'])).candidates.get('j')?.[0].output, 'じ');
});

test('matchKeyPatterns: prefixはtriggerを先に選んだ時だけ出力キーを候補にする', () => {
  const face = faceFromEntries(['d'], 'prefix', { j: 'お' });
  const layout = compiledFaces(face);

  const triggerFirst = matchKeyPatterns(layout, new Set(['d']));
  assert.equal(triggerFirst.candidates.get('j')?.[0].output, 'お');

  const outputFirst = matchKeyPatterns(layout, new Set(['j']));
  assert.equal(outputFirst.candidates.has('d'), false);
});

test('matchKeyPatterns: prefixのexactもtrigger先押しの選択順だけ成立する', () => {
  const face = faceFromEntries(['d'], 'prefix', { j: 'お' });
  const layout = compiledFaces(face);

  const valid = matchKeyPatterns(layout, new Set(['d', 'j']));
  assert.ok(valid.exact.some((match) => match.output === 'お'));

  const invalid = matchKeyPatterns(layout, new Set(['j', 'd']));
  assert.equal(invalid.exact.some((match) => match.output === 'お'), false);
});

test('matchKeyPatterns: 2キー以上先の出力はまだ候補表示しない', () => {
  const face = faceFromEntries(['h', 'j'], 'simultaneous', { r: 'じゃ' });
  const layout = compiledFaces(face);
  const result = matchKeyPatterns(layout, new Set(['j']));
  assert.equal(result.exact.length, 0);
  assert.equal(result.candidates.size, 0);
  assert.ok(result.continuations.has('h'));
  assert.ok(result.continuations.has('r'));
});

test('matchKeyPatterns: exactがあっても1キー追加で成立する上位出力を候補に残す', () => {
  const dakuon = faceFromEntries(['j'], 'simultaneous', { r: 'じ' });
  const youon = {
    ...faceFromEntries(['h', 'j'], 'simultaneous', { r: 'じゃ' }),
    inputRole: 'composition' as const,
  };
  const layout = compiledFaces(dakuon, youon);
  const result = matchKeyPatterns(layout, new Set(['j', 'r']));
  assert.deepEqual(result.exact.map((match) => match.output), ['じ']);
  assert.equal(result.candidates.get('h')?.[0].output, 'じゃ');
});

test('matchKeyPatterns: resolvedComboDefinitionsもexact/candidateの両方で見る', () => {
  const layout = comboCanonical('ye', ['k', 'd'], '拗音拡張');
  const exact = matchKeyPatterns(layout, new Set(['k', 'd']));
  assert.equal(exact.exact[0]?.output, 'ye');
  const partial = matchKeyPatterns(layout, new Set(['k']));
  assert.equal(partial.candidates.get('d')?.[0].output, 'ye');
});

test('buildKeyPatternMatrix: combo groupは全canonical physical variantsへ保持する', () => {
  const base = stubLayout({
    map: new Map([
      ['i', [['k']]],
      ['e', [['d']]],
    ]),
    canonicalInputs: new Map([
      ['i', [
        compileSequenceInputAlternative('i', [['k']], 'single'),
        compileSequenceInputAlternative('i', [['x']], 'single'),
      ]],
      ['e', [compileSequenceInputAlternative('e', [['d']], 'single')]],
    ]),
  });
  const layout = withCombos(
    'combo-variants',
    'combo-variants',
    base,
    [['ye', ['i', 'e'], undefined, { group: '拗音拡張' }]],
  );

  const definition = layout.resolvedComboDefinitions?.find((combo) => combo.output === 'ye');
  assert.deepEqual(definition?.keyVariants, [['k', 'd'], ['x', 'd']]);

  const matches = buildKeyPatternMatrix(layout).filter((match) => match.output === 'ye');
  assert.deepEqual(
    matches.map((match) => ({ keys: match.keys, group: match.group })),
    [
      { keys: ['d', 'k'], group: '拗音拡張' },
      { keys: ['d', 'x'], group: '拗音拡張' },
    ],
  );
});

test('matchKeyPatterns: TK音直でi選択後、eの物理キーにyeを表示できる', () => {
  const layout = LAYOUT_BY_ID.get('oonishi-custom-combo');
  assert.ok(layout);
  const iKey = layout.map.get('i')?.[0]?.[0];
  const eKey = layout.map.get('e')?.[0]?.[0];
  assert.ok(iKey);
  assert.ok(eKey);
  const result = matchKeyPatterns(layout, new Set([iKey]));
  assert.ok(result.candidates.get(eKey)?.some((match) => match.output === 'ye'));
});

test('matchKeyPatterns: 薙刀式で「じ」確定後もh追加の「じゃ」を候補表示する', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18');
  assert.ok(layout);
  const result = matchKeyPatterns(layout, new Set(['r', 'j']));
  assert.ok(result.exact.some((match) => match.output === 'じ'));
  assert.ok(result.candidates.get('h')?.some((match) => match.output === 'じゃ'));
});

test('matchKeyPatterns: かわせみ配列+は単打確定と追加候補を同時に返す', () => {
  const layout = LAYOUT_BY_ID.get('kawasemi-plus');
  assert.ok(layout);
  const result = matchKeyPatterns(layout, new Set(['s']));
  assert.ok(result.exact.some((match) => match.output === 'か'));
  assert.ok(result.candidates.size > 0);
});

test('matchKeyPatterns: 月配列prefixは通常キーからシフトキーへの逆向き候補を出さない', () => {
  const layout = LAYOUT_BY_ID.get('tsuki-2-263');
  assert.ok(layout);

  const base = matchKeyPatterns(layout, new Set(['j']));
  assert.ok(base.exact.some((match) => match.output === 'う'));
  assert.equal(base.candidates.has('d'), false);

  const shifted = matchKeyPatterns(layout, new Set(['d']));
  assert.ok(shifted.candidates.get('j')?.some((match) => match.output === 'お'));
});

test('matchKeyPatterns: 薙刀式Spaceも先押しした時だけセンターシフト候補・exactを出す', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18');
  assert.ok(layout);
  const space = resolveKeyId('space');

  const base = matchKeyPatterns(layout, new Set(['j']));
  assert.ok(base.exact.some((match) => match.output === 'あ'));
  assert.equal(base.candidates.has(space), false);

  const shifted = matchKeyPatterns(layout, new Set([space]));
  assert.ok(shifted.candidates.get('j')?.some((match) => match.output === 'の'));
  assert.ok(matchKeyPatterns(layout, new Set([space, 'j'])).exact.some((match) => match.output === 'の'));
  assert.equal(matchKeyPatterns(layout, new Set(['j', space])).exact.some((match) => match.output === 'の'), false);
});

test('matchKeyPatterns: 選択が空なら何も返らない', () => {
  const layout = directCanonical('あ', 'j');
  const result = matchKeyPatterns(layout, new Set());
  assert.equal(result.exact.length, 0);
  assert.equal(result.candidates.size, 0);
});

test('matchKeyPatterns: 選択が定義外キーを含む場合は一致しない', () => {
  const face = faceFromEntries(['j'], 'simultaneous', { r: 'じ' });
  const layout = compiledFaces(face);
  const result = matchKeyPatterns(layout, new Set(['j', 'z']));
  assert.equal(result.exact.length, 0);
  assert.equal(result.candidates.size, 0);
});

test('summarizeCandidateMatches: 複数候補も畳まず全部並べる', () => {
  const matches = [
    { output: 'あ', keys: ['j'] },
    { output: 'い', keys: ['j'] },
  ];
  assert.equal(summarizeCandidateMatches(matches), 'あ / い');
});

test('allTriggerKeys: canonical realizationのtriggerとcombo物理キーを両方拾う', () => {
  const face = faceFromEntries(['j'], 'simultaneous', { k: 'あ' });
  const faceLayout = compiledFaces(face);
  const combo = compileSequenceInputAlternative(
    'x',
    [['l', ';']],
    COMBO_LAYER_ID,
    ['composition'],
    [],
    'combo',
  );
  const layout = {
    ...faceLayout,
    canonicalInputs: new Map([
      ...faceLayout.canonicalInputs,
      ['x', [combo]] as const,
    ]),
  };
  const keys = allTriggerKeys(layout);
  assert.ok(keys.has('j'));
  assert.ok(keys.has('l'));
  assert.ok(keys.has(';'));
});

test('findActiveLayerFace: 単キーtriggerだけを選択した時はその面を返す', () => {
  const shiftFace = faceFromEntries(['f'], 'prefix', { j: 'あ', k: 'い' });
  const layout = stubLayout({
    faces: [shiftFace],
    faceLayerIds: new Map([[shiftFace, 'face:0']]),
    layerDefinitions: [{ id: 'face:0', kind: 'layer', label: '面 1', presentationRole: 'layer' }],
  });
  assert.equal(findActiveLayerFace(layout, new Set(['f'])), shiftFace);
  assert.equal(findActiveLayerFace(layout, new Set()), undefined);
  assert.equal(findActiveLayerFace(layout, new Set(['z'])), undefined);
  assert.equal(findActiveLayerFace(layout, new Set(['f', 'j'])), undefined);
});

test('findActiveLayerFace: 同triggerが複数aggregationにある時はLayer.orderをauthorityにする', () => {
  const modifierFirst: Face = {
    ...faceFromEntries(['d'], 'simultaneous', { j: 'あ' }),
    role: 'modifier',
  };
  const layerSecond: Face = faceFromEntries(['d'], 'simultaneous', { k: 'い' });
  const layout = stubLayout({
    faces: [modifierFirst, layerSecond],
    faceLayerIds: new Map([
      [modifierFirst, 'layer:modifier-first'],
      [layerSecond, 'layer:layer-second'],
    ]),
    layerDefinitions: [
      {
        id: 'layer:modifier-first',
        kind: 'layer',
        label: 'modifier first',
        presentationRole: 'modifier',
      },
      {
        id: 'layer:layer-second',
        kind: 'layer',
        label: 'layer second',
        presentationRole: 'layer',
      },
    ],
  });

  assert.equal(findActiveLayerFace(layout, new Set(['d'])), modifierFirst);
});

test('findActiveLayerFace: presentationTriggerAlternativesの単キーORも同じFaceへ帰属する', () => {
  const shiftFace: Face = {
    ...faceFromEntries(['space'], 'simultaneous', { j: 'あ' }),
    presentationTriggerAlternatives: [['thumb-l'], ['thumb-r']],
  };
  const layout = stubLayout({
    faces: [shiftFace],
    faceLayerIds: new Map([[shiftFace, 'layer:SandS']]),
    layerDefinitions: [{ id: 'layer:SandS', kind: 'layer', label: 'SandS', presentationRole: 'layer' }],
  });
  assert.equal(findActiveLayerFace(layout, new Set(['thumb-l'])), shiftFace);
  assert.equal(findActiveLayerFace(layout, new Set(['thumb-r'])), shiftFace);
});

test('findActiveLayerFace: 複数キーtrigger chordは単キー選択へ誤帰属しない', () => {
  const comboFace = faceFromEntries(['j', 'k'], 'simultaneous', { r: 'あ' });
  const layout = stubLayout({
    faces: [comboFace],
    faceLayerIds: new Map([[comboFace, 'face:0']]),
    layerDefinitions: [{ id: 'face:0', kind: 'layer', label: '面 1', presentationRole: 'layer' }],
  });
  assert.equal(findActiveLayerFace(layout, new Set(['j'])), undefined);
  assert.equal(findActiveLayerFace(layout, new Set(['k'])), undefined);
  assert.equal(findActiveLayerFace(layout, new Set(['j', 'k'])), undefined);
});

test('findActiveLayerFace: 明示2キーpresentation chordも単キー選択へ誤帰属しない', () => {
  const chordFace: Face = {
    ...faceFromEntries(['space'], 'simultaneous', { r: 'あ' }),
    presentationTriggerAlternatives: [['thumb-l', 'thumb-r']],
  };
  const layout = stubLayout({
    faces: [chordFace],
    faceLayerIds: new Map([[chordFace, 'face:0']]),
    layerDefinitions: [{ id: 'face:0', kind: 'layer', label: '面 1', presentationRole: 'layer' }],
  });
  assert.equal(findActiveLayerFace(layout, new Set(['thumb-l'])), undefined);
  assert.equal(findActiveLayerFace(layout, new Set(['thumb-r'])), undefined);
});

test('findActiveLayerFace: aggregation帰属はinputRoleではなくcompiled presentation mappingをauthorityにする', () => {
  const legacyComposition: Face = {
    ...faceFromEntries(['f'], 'simultaneous', { j: 'あ' }),
    inputRole: 'composition',
  };
  const mappedLayer = stubLayout({
    faces: [legacyComposition],
    faceLayerIds: new Map([[legacyComposition, 'face:0']]),
    layerDefinitions: [{ id: 'face:0', kind: 'layer', label: '面 1', presentationRole: 'layer' }],
  });
  assert.equal(findActiveLayerFace(mappedLayer, new Set(['f'])), legacyComposition);

  const explicitModifier: Face = {
    ...faceFromEntries(['d'], 'simultaneous', { k: 'い' }),
    inputRole: 'modifier',
  };
  const mappedCombo = stubLayout({
    faces: [explicitModifier],
    faceLayerIds: new Map([[explicitModifier, COMBO_LAYER_ID]]),
    layerDefinitions: [{ id: COMBO_LAYER_ID, kind: 'combo', label: 'コンボ' }],
  });
  assert.equal(findActiveLayerFace(mappedCombo, new Set(['d'])), undefined);
});

test('findActiveLayerFace: Face mapping欠落は表示契約違反としてerrorにする', () => {
  const face = faceFromEntries(['f'], 'prefix', { j: 'あ' });
  assert.throws(
    () => findActiveLayerFace(stubLayout({ faces: [face] }), new Set(['f'])),
    /faceLayerIdsの明示が必要/,
  );
});


function presentationStepper(layout: Layout) {
  const engine = new TypingInputEngine(layout.canonicalInputs, {
    triggerRealizationPolicy: { useHold: true },
  });
  let state = EMPTY_KEY_PATTERN_PRESENTATION_STATE;

  return {
    step(event: { type: 'down' | 'up'; key: string }) {
      const result = engine.handle(event);
      state = advanceKeyPatternPresentation(layout, state, event, result);
      return { result, state };
    },
  };
}

test('presentation: prefix singleはrelease後も1打だけactiveで対象入力後に通常へ戻る', () => {
  const layout = LAYOUT_BY_ID.get('tsuki-2-263');
  assert.ok(layout);
  const session = presentationStepper(layout);

  assert.deepEqual(
    session.step({ type: 'down', key: 'd' }).state.activeAggregationGroupIds,
    ['layer:中指シフト'],
  );
  assert.deepEqual(
    session.step({ type: 'up', key: 'd' }).state.activeAggregationGroupIds,
    ['layer:中指シフト'],
  );

  const completed = session.step({ type: 'down', key: 'h' });
  assert.deepEqual(completed.result.recognized.map((entry) => entry.output), ['ま']);
  assert.deepEqual(completed.state.activeAggregationGroupIds, []);
});

test('presentation: prepress-requiredなhold layerはrelease後にprefix化しない', () => {
  const layout = LAYOUT_BY_ID.get('shin-jis-simultaneous');
  assert.ok(layout);
  const session = presentationStepper(layout);

  const down = session.step({ type: 'down', key: 'thumb-r' });
  assert.deepEqual(down.state.activeAggregationGroupIds, ['layer:シフト']);
  assert.ok(down.state.selectedKeys.includes('thumb-r'));

  const released = session.step({ type: 'up', key: 'thumb-r' });
  assert.deepEqual(released.state.activeAggregationGroupIds, []);
  assert.equal(released.state.selectedKeys.includes('thumb-r'), false);
});

test('presentation: 薙刀式のorder-free装飾keyはrelease後にactiveを残さない', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18');
  assert.ok(layout);
  const session = presentationStepper(layout);

  const down = session.step({ type: 'down', key: 'j' });
  assert.deepEqual(down.state.activeAggregationGroupIds, ['layer:濁音']);
  const released = session.step({ type: 'up', key: 'j' });
  assert.deepEqual(released.state.activeAggregationGroupIds, []);
  assert.equal(released.state.selectedKeys.includes('j'), false);
});

test('presentation: simultaneous singleはtrigger releaseでactiveを残さない', () => {
  const layout = LAYOUT_BY_ID.get('nicola');
  assert.ok(layout);
  const session = presentationStepper(layout);

  const down = session.step({ type: 'down', key: 'thumb-l' });
  assert.ok(down.state.activeAggregationGroupIds.length > 0);
  assert.deepEqual(
    session.step({ type: 'up', key: 'thumb-l' }).state.activeAggregationGroupIds,
    [],
  );
});

test('presentation: hold-capable layerはtrigger hold中だけ確定後も継続する', () => {
  const layout = LAYOUT_BY_ID.get('asuka');
  assert.ok(layout);
  const session = presentationStepper(layout);

  assert.deepEqual(
    session.step({ type: 'down', key: 'thumb-l' }).state.activeAggregationGroupIds,
    ['layer:左親指'],
  );
  const output = session.step({ type: 'down', key: 's' });
  assert.equal(output.result.recognized[0]?.output, 'あ');
  assert.deepEqual(output.state.activeAggregationGroupIds, ['layer:左親指']);

  session.step({ type: 'up', key: 's' });
  assert.deepEqual(
    session.step({ type: 'up', key: 'thumb-l' }).state.activeAggregationGroupIds,
    [],
  );
});

test('presentation: 薙刀式SandSは左右thumb alternativeでも同じhold layerになる', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18');
  assert.ok(layout);

  for (const thumb of ['thumb-l', 'thumb-r']) {
    const session = presentationStepper(layout);
    assert.deepEqual(
      session.step({ type: 'down', key: thumb }).state.activeAggregationGroupIds,
      ['layer:SandS'],
      thumb,
    );
    const output = session.step({ type: 'down', key: 'f' });
    assert.equal(output.result.recognized[0]?.output, 'ま');
    assert.deepEqual(output.state.activeAggregationGroupIds, ['layer:SandS']);
    session.step({ type: 'up', key: 'f' });
    assert.deepEqual(
      session.step({ type: 'up', key: thumb }).state.activeAggregationGroupIds,
      [],
    );
  }
});

test('dynamic guide: 薙刀式の単キーlayerでは同じaggregationの候補だけを表示対象にできる', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18');
  assert.ok(layout);

  const result = matchKeyPatterns(layout, new Set(['j']));
  const dakuon = result.candidates.get('f') ?? [];
  const deeper = result.continuations.get('h') ?? [];

  assert.ok(dakuon.some((match) => match.aggregationGroupId === 'layer:濁音'));
  assert.ok(deeper.some((match) => match.aggregationGroupId !== 'layer:濁音'));
});

test('dynamic guide: 複数キー同時押しはpartial key集合から次キーと確定出力を段階表示する', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18');
  assert.ok(layout);

  const first = matchKeyPatterns(layout, new Set(['j']));
  assert.ok(first.continuations.has('h'));

  const second = matchKeyPatterns(layout, new Set(['j', 'h']));
  assert.ok(second.candidates.get('w')?.some((match) => match.output === 'ぎゃ'));
  assert.ok(second.candidates.get('r')?.some((match) => match.output === 'じゃ'));
});


test('allLayerTriggerKeysは複合layer triggerの構成キーを常時表示へ混ぜない', () => {
  const single = faceFromEntries(['j'], 'simultaneous', { r: 'じ' });
  const compound = faceFromEntries(['o', 'v'], 'simultaneous', { k: 'いぇ' });
  const layout = compiledFaces(single, compound);
  const keys = allLayerTriggerKeys(layout);
  assert.equal(keys.has('j'), true);
  assert.equal(keys.has('o'), false);
  assert.equal(keys.has('v'), false);
});

test('allLayerTriggerKeysはcombo membershipをlayer triggerへ混ぜない', () => {
  const base = fromRows('combo-trigger-separation', 'combo-trigger-separation', [
    '',
    'qwertyuiop',
    'asdfghjkl;',
    'zxcvbnm,./',
  ], {});
  const layout = withCombos(
    'combo-trigger-separation',
    'combo-trigger-separation',
    base,
    [['X', ['a', 's']]],
  );
  assert.equal(allTriggerKeys(layout).has('a'), true);
  assert.equal(allLayerTriggerKeys(layout).has('a'), false);
});

test('presentation: 通常Shiftはwhile-pressedでdown中だけactiveになる', () => {
  const base = fromRows('shift-presentation', 'shift-presentation', [
    '1234567890-=',
    'qwertyuiop[]',
    "asdfghjkl;'",
    'zxcvbnm,./',
  ], {});
  const layout = withShiftedOutputs(base);
  const engine = new TypingInputEngine(layout.canonicalInputs, {
    triggerRealizationPolicy: { useHold: true },
  });
  let state = EMPTY_KEY_PATTERN_PRESENTATION_STATE;

  let result = engine.handle({ type: 'down', key: 'shift-l' });
  state = advanceKeyPatternPresentation(
    layout,
    state,
    { type: 'down', key: 'shift-l' },
    result,
  );
  assert.deepEqual(state.activeAggregationGroupIds, ['layer:Shift']);

  result = engine.handle({ type: 'up', key: 'shift-l' });
  state = advanceKeyPatternPresentation(
    layout,
    state,
    { type: 'up', key: 'shift-l' },
    result,
  );
  assert.deepEqual(state.activeAggregationGroupIds, []);
});
