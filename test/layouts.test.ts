import { JIS_KANA } from '#input/layouts/jis-kana.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { mapInputAlternativePhysicalKeys } from '#input/semantics/index.ts';
import { DEFAULT_OPTIONS, evaluate } from '#trace/evaluate.ts';
import { faceFromEntries, fromFaces, fromRows, LAYOUT_BY_ID, LAYOUTS, LAYOUTS_JA, withCombos, type Face } from '#input/layouts/index.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { SAMPLE_TEXT_JA } from '#input/text/sample-ja.ts';
import { toLayout } from '#input/layouts/user-layouts.ts';
import { assertKanaLayout, assertKanaLayoutFixture } from './kana-layout-helpers.ts';
import {
  classifyPresentationFaces,
  displayTriggerAlternatives,
  displayTriggerHandLabel,
  displayTriggerKeys,
  matchesDisplayTriggerAlternative,
  faceCells,
  faceDisplayCells,
  handOfKey,
  layerShiftStyles,
} from '#input/layouts/layers.ts';
import { normalizedLayerColors } from '#analyzers/heatmap/layer-heatmap.ts';

const faceAtF = (output: string) => ['', '', ['', '', '', output], ''];

test('面はprefix / suffix / simultaneousをSequenceに展開する', () => {
  const layout = fromFaces('faces', 'faces', [
    { trigger: [], mode: 'simultaneous', rows: faceAtF('あ'), inputRole: 'layer' },
    { trigger: ['d'], mode: 'prefix', rows: faceAtF('か'), inputRole: 'modifier', triggerPersistence: 'single' },
    { trigger: ['d'], mode: 'suffix', rows: faceAtF('さ'), inputRole: 'modifier', triggerPersistence: 'single' },
    { trigger: ['j'], mode: 'simultaneous', rows: faceAtF('た'), inputRole: 'modifier', triggerPersistence: 'single' },
  ]);

  assert.deepEqual(layout.map.get('あ'), [['f']]);
  assert.deepEqual(layout.map.get('か'), [['d'], ['f']]);
  assert.deepEqual(layout.map.get('さ'), [['f'], ['d']]);
  assert.deepEqual(layout.map.get('た'), [['j', 'f']]);
});

test('面の展開後も各ステップの層帰属を保持する（#87）', () => {
  const layout = fromFaces('attribution', 'attribution', [
    { trigger: [], mode: 'simultaneous', rows: faceAtF('あ'), inputRole: 'layer' },
    { trigger: ['d'], mode: 'prefix', rows: faceAtF('か'), layer: '中指', inputRole: 'modifier', triggerPersistence: 'single' },
    { trigger: ['j'], mode: 'prefix', rows: faceAtF('さ'), layer: '人差指', inputRole: 'modifier', triggerPersistence: 'single' },
    { trigger: ['k', 'l'], mode: 'simultaneous', rows: faceAtF('た'), inputRole: 'composition', triggerPersistence: 'single' },
  ]);
  const trace = evaluate('あかさた', layout, buildGeometry('row-staggered'), DEFAULT_OPTIONS);

  assert.deepEqual(trace.strokes.map((stroke) => stroke.aggregationGroupId), [
    'single', 'layer:中指', 'layer:中指', 'layer:人差指', 'layer:人差指', 'combo',
  ]);
  const metrics = computeMetrics(trace, buildGeometry('row-staggered'));
  assert.deepEqual(metrics.layers.map((layer) => [layer.id, layer.presses]), [
    ['single', 1], ['layer:中指', 2], ['layer:人差指', 2],
  ]);
  assert.equal(metrics.comboPresses, 3);
});

test('Face semanticは推測せず明示を要求する', () => {
  assert.throws(
    () => fromFaces('missing-role', 'missing-role', [
      { trigger: [], mode: 'simultaneous', rows: faceAtF('あ') },
    ]),
    /inputRoleを明示する必要がある/,
  );

  const face: Face = {
    trigger: ['d', 'k'],
    mode: 'simultaneous',
    rows: faceAtF('あ'),
    role: 'modifier',
    inputRole: 'modifier',
    triggerPersistence: 'single',
  };
  const layout = fromFaces('multi-trigger-modifier', 'multi-trigger-modifier', [face]);
  assert.equal(layout.faceLayerIds?.get(face), 'face:0');
  assert.equal(layout.layerDefinitions?.some((definition) => definition.kind === 'combo'), false);
  assert.deepEqual(classifyPresentationFaces(layout).combos, []);
});

test('compiled presentation Layerはaggregation identity / role / orderを保持する', () => {
  const base: Face = {
    ...faceFromEntries([], 'simultaneous', { a: 'あ' }),
    inputRole: 'layer',
  };
  const modifier: Face = {
    ...faceFromEntries(['d'], 'prefix', { j: 'い' }),
    layer: '中指',
    role: 'modifier',
    inputRole: 'modifier',
    triggerPersistence: 'single',
  };
  const shifted: Face = {
    ...faceFromEntries(['f'], 'prefix', { k: 'う' }),
    layer: '人差指',
    inputRole: 'layer',
    triggerPersistence: 'single',
  };
  const layout = fromFaces('presentation-layer-id', 'presentation-layer-id', [
    base,
    modifier,
    shifted,
  ]);

  assert.deepEqual(
    layout.layerDefinitions
      ?.filter((definition) => definition.kind === 'layer')
      .map((definition) => [definition.id, definition.presentationRole]),
    [
      ['single', 'layer'],
      ['layer:中指', 'modifier'],
      ['layer:人差指', 'layer'],
    ],
  );

  const groups = classifyPresentationFaces(layout);
  assert.deepEqual(
    [...groups.layers, ...groups.modifiers]
      .sort((left, right) => left.order - right.order)
      .map((layer) => [layer.id, layer.role, layer.order]),
    [
      ['single', 'layer', 0],
      ['layer:中指', 'modifier', 1],
      ['layer:人差指', 'layer', 2],
    ],
  );
});

test('triggerless compositionはcanonicalとpresentationの両方でcomboへ帰属する', () => {
  const face: Face = {
    trigger: [],
    mode: 'simultaneous',
    rows: faceAtF('きゃ'),
    inputRole: 'composition',
  };
  const layout = fromFaces('triggerless-composition', 'triggerless-composition', [face]);

  const input = layout.canonicalInputs.get('きゃ')?.[0]?.semanticInputs[0];
  assert.ok(input);
  assert.equal(input.aggregationGroupId, 'combo');
  assert.ok(input.classifications.includes('composition'));
  assert.equal(layout.faceLayerIds?.get(face), 'combo');
  assert.deepEqual(
    layout.layerDefinitions?.find((definition) => definition.id === 'combo'),
    { id: 'combo', kind: 'combo', label: 'コンボ' },
  );
  assert.deepEqual(classifyPresentationFaces(layout).combos, [face]);
});

test('出力を持つtrigger FaceはtriggerPersistence必須、空placeholderは許容する', () => {
  assert.throws(
    () => fromFaces('invalid-persistence', 'invalid-persistence', [
      { trigger: ['d'], mode: 'prefix', rows: faceAtF('か'), inputRole: 'modifier' },
    ]),
    /triggerを持つFaceはtriggerPersistenceを明示する必要がある/,
  );

  assert.doesNotThrow(() => fromFaces('empty-placeholder', 'empty-placeholder', [
    { trigger: ['d'], mode: 'prefix', rows: ['', '', '', ''] },
  ]));
});

test('面定義の未知のキーは空欄にせずエラーにする', () => {
  assert.throws(
    () => faceFromEntries([], 'simultaneous', { typo: 'あ' }),
    /面に未知のキーがある: typo/,
  );
});

test('JISかな配列はJIS専用列・Shift面・濁点合成を持つ', () => {
  const layout = JIS_KANA;

  assert.deepEqual(layout.map.get('ー'), [['r0c12']]);
  assert.deepEqual(layout.map.get('む'), [['r2c11']]);
  assert.deepEqual(layout.map.get('ろ'), [['r3c10']]);
  assert.ok(layout.canonicalInputs.get('ぁ')?.some((alternative) =>
    alternative.semanticInputs.some((input) =>
      input.physicalKeys.includes('shift-l')
      && input.physicalKeys.includes('3'))));
  assert.ok(layout.canonicalInputs.has('が'));
  assert.ok(layout.canonicalInputs.has('ぱ'));
});

test('TK音直入力法は英文モードでも英字配置として選べる', () => {
  const layout = LAYOUTS.find((entry) => entry.id === 'oonishi-custom');
  assert.ok(layout);
  assert.equal(layout.name, 'TK音直入力法');
  assert.equal(layout.romajiTable, undefined);
  assert.equal(layout.resolvedComboDefinitions, undefined);
});

test('日本語の配列一覧にDvorakを含める（#48）', () => {
  const dvorak = LAYOUTS_JA.find((layout) => layout.id === 'dvorak');

  assert.ok(dvorak);
  assert.equal(dvorak.name, 'Dvorak');
  assert.ok(dvorak.romajiTable);
});

test('TK音直入力法は正式名称を表示し、内部idは維持する（#109）', () => {
  const oonishi = LAYOUT_BY_ID.get('oonishi');
  const combo = LAYOUT_BY_ID.get('oonishi-custom-combo');
  const tsuki = LAYOUT_BY_ID.get('tsuki-2-263');

  assert.equal(oonishi?.name, '大西配列');
  assert.equal(combo?.id, 'oonishi-custom-combo');
  assert.equal(combo?.name, 'TK音直入力法');
  const desita = combo?.resolvedComboDefinitions?.find((definition) => definition.output === 'desita');
  assert.deepEqual(desita?.inputs, ['d', 's', 't']);
  assert.deepEqual(desita?.keys, ['m', 'l', 'j']);
  assert.equal(desita?.group, '語彙拡張');
  assert.equal(desita?.foldTriggerInputs, undefined);

  const ya = combo?.resolvedComboDefinitions?.find((definition) => definition.output === 'ya');
  const yaku = combo?.resolvedComboDefinitions?.find((definition) => definition.output === 'yaku');
  const atu = combo?.resolvedComboDefinitions?.find((definition) => definition.output === 'atu');
  const ai = combo?.resolvedComboDefinitions?.find((definition) => definition.output === 'ai');
  assert.deepEqual(ya?.foldTriggerInputs, ['i']);
  assert.deepEqual(yaku?.foldTriggerInputs, ['i', 'a']);
  assert.deepEqual(atu?.foldTriggerInputs, [',']);
  assert.deepEqual(ai?.foldTriggerInputs, ['e']);

  const groupCounts = new Map<string, number>();
  for (const definition of combo?.resolvedComboDefinitions ?? []) {
    if (definition.group) groupCounts.set(definition.group, (groupCounts.get(definition.group) ?? 0) + 1);
  }
  assert.deepEqual(Object.fromEntries(groupCounts), {
    '語彙拡張': 17,
    '拗音拡張': 19,
    '入声拡張': 20,
    '撥音拡張': 7,
    '二重母音拡張': 10,
  });
  assert.equal(combo?.resolvedComboDefinitions?.length, 73);
  assert.ok(LAYOUTS_JA.some((layout) => layout.id === 'oonishi-custom-combo'));
  assert.equal(tsuki?.name, '月配列2-263式');
  assert.ok(!oonishi?.name.includes(' '));
  assert.ok(!tsuki?.name.includes(' '));
});

test('combo fold presentation provenanceはcanonical inputから解決する', () => {
  const base = fromRows(
    'canonical-fold-source',
    'canonical-fold-source',
    ['あい', '', '', ''],
    {},
  );
  const canonicalOnly = { ...base, map: new Map<string, string[][]>() };
  const layout = withCombos(
    'canonical-fold-combo',
    'canonical-fold-combo',
    canonicalOnly,
    [[
      '愛',
      ['あ', 'い'],
      undefined,
      { foldTriggerInputs: ['あ'] },
    ]],
  );

  const definition = layout.resolvedComboDefinitions?.find((entry) => entry.output === '愛');
  assert.ok(definition);
  assert.deepEqual(definition.foldTriggerInputs, ['あ']);
  assert.deepEqual(definition.foldTriggerKeys, ['1']);
  assert.equal(definition.foldTargetKey, '2');
});

test('combo fold provenanceは先頭default pathを使いkeyVariantsは全pathを保持する', () => {
  const base = fromRows(
    'canonical-fold-variants',
    'canonical-fold-variants',
    ['あい', '', '', ''],
    {},
  );
  const canonicalInputs = new Map(base.canonicalInputs);
  const defaultAlternative = canonicalInputs.get('あ')?.[0];
  assert.ok(defaultAlternative);
  canonicalInputs.set('あ', [
    defaultAlternative,
    mapInputAlternativePhysicalKeys(
      defaultAlternative,
      (key) => key === '1' ? '3' : key,
    ),
  ]);
  const canonicalOnly = {
    ...base,
    map: new Map<string, string[][]>(),
    canonicalInputs,
  };
  const layout = withCombos(
    'canonical-fold-variants-combo',
    'canonical-fold-variants-combo',
    canonicalOnly,
    [[
      '愛',
      ['あ', 'い'],
      undefined,
      { foldTriggerInputs: ['あ'] },
    ]],
  );

  const definition = layout.resolvedComboDefinitions?.find((entry) => entry.output === '愛');
  assert.ok(definition);
  assert.deepEqual(definition.keys, ['1', '2']);
  assert.deepEqual(definition.keyVariants, [
    ['1', '2'],
    ['3', '2'],
  ]);
  assert.deepEqual(definition.foldTriggerKeys, ['1']);
  assert.equal(definition.foldTargetKey, '2');
});

test('面のセル配列は複数文字の見出しを1キーへ置ける', () => {
  const layout = fromFaces('multi', 'multi', [
    { trigger: [], mode: 'simultaneous', rows: ['', '', ['', '', '', 'きゃ'], ''], inputRole: 'layer' },
  ]);

  assert.deepEqual(layout.map.get('きゃ'), [['f']]);
});

test('presentation分類はcompiled aggregation metadataをauthorityにする', () => {
  const semanticCompositionMappedAsLayer: Face = {
    ...faceFromEntries(['f'], 'simultaneous', { j: 'あ' }),
    inputRole: 'composition',
    role: 'modifier',
  };
  const mappedLayer = {
    faces: [semanticCompositionMappedAsLayer],
    faceLayerIds: new Map([[semanticCompositionMappedAsLayer, 'face:0']]),
    layerDefinitions: [{
      id: 'face:0',
      kind: 'layer' as const,
      label: '面 1',
      presentationRole: 'layer' as const,
    }],
  };
  const layerGroups = classifyPresentationFaces(mappedLayer);
  assert.deepEqual(layerGroups.combos, []);
  assert.deepEqual(layerGroups.layers.flatMap((group) => group.faces), [semanticCompositionMappedAsLayer]);
  assert.deepEqual(layerGroups.modifiers, []);

  const semanticLayerMappedAsModifier: Face = {
    ...faceFromEntries(['a'], 'simultaneous', { ';': 'え' }),
    inputRole: 'layer',
  };
  const mappedModifier = {
    faces: [semanticLayerMappedAsModifier],
    faceLayerIds: new Map([[semanticLayerMappedAsModifier, 'face:1']]),
    layerDefinitions: [{
      id: 'face:1',
      kind: 'layer' as const,
      label: '面 2',
      presentationRole: 'modifier' as const,
    }],
  };
  const modifierGroups = classifyPresentationFaces(mappedModifier);
  assert.deepEqual(modifierGroups.layers, []);
  assert.deepEqual(
    modifierGroups.modifiers.flatMap((group) => group.faces),
    [semanticLayerMappedAsModifier],
  );

  const semanticModifierMappedAsCombo: Face = {
    ...faceFromEntries(['d'], 'simultaneous', { k: 'い' }),
    inputRole: 'modifier',
  };
  const mappedCombo = {
    faces: [semanticModifierMappedAsCombo],
    faceLayerIds: new Map([[semanticModifierMappedAsCombo, 'combo']]),
    layerDefinitions: [{ id: 'combo', kind: 'combo' as const, label: 'コンボ' }],
  };
  const comboGroups = classifyPresentationFaces(mappedCombo);
  assert.deepEqual(comboGroups.combos, [semanticModifierMappedAsCombo]);
  assert.deepEqual(comboGroups.layers, []);
  assert.deepEqual(comboGroups.modifiers, []);
});

test('layer aggregationのpresentationRole欠落は表示契約違反としてerrorにする', () => {
  const face = faceFromEntries(['f'], 'simultaneous', { j: 'あ' });
  assert.throws(
    () => classifyPresentationFaces({
      faces: [face],
      faceLayerIds: new Map([[face, 'face:0']]),
      layerDefinitions: [{ id: 'face:0', kind: 'layer', label: '面 1' }],
    }),
    /presentationRole明示が必要/,
  );
});

test('Faceを持つLayoutは全FaceのfaceLayerIdsを明示する', () => {
  for (const layout of LAYOUTS_JA) {
    if (!layout.faces) continue;
    assert.ok(layout.faceLayerIds, `${layout.id}: faceLayerIds`);
    for (const face of layout.faces) {
      assert.notEqual(
        layout.faceLayerIds.get(face),
        undefined,
        `${layout.id}: Face layerId`,
      );
    }
  }
});

test('宣言された面だけを逆手の条件でレイヤーへ集約する', () => {
  const shingeta = LAYOUT_BY_ID.get('shingeta')!;
  const tsuki = LAYOUT_BY_ID.get('tsuki-2-263')!;
  const nicola = LAYOUT_BY_ID.get('nicola')!;
  const naginata = LAYOUT_BY_ID.get('naginata-v18')!;

  const counts = [shingeta, tsuki, nicola, naginata].map((layout) => {
    const groups = classifyPresentationFaces(layout);
    return [layout.faces!.length, groups.layers.length, groups.modifiers.length, groups.combos.length];
  });
  assert.deepEqual(counts, [
    [7, 5, 0, 0],
    [3, 2, 0, 0],
    [3, 3, 0, 0],
    [33, 2, 29, 0],
  ]);

  assert.deepEqual(
    classifyPresentationFaces(shingeta).layers.map((layer) => layer.faces.map((face) => face.trigger)),
    [[[]], [['k'], ['d']], [['l'], ['s']], [['i']], [['o']]],
  );
  assert.deepEqual(
    classifyPresentationFaces(tsuki).layers.map((layer) => layer.faces.map((face) => face.trigger)),
    [[[]], [['d'], ['k']]],
  );
  assert.deepEqual(
    classifyPresentationFaces(nicola).layers.map((layer) => layer.faces.map((face) => face.trigger)),
    [[[]], [['thumb-l']], [['thumb-r']]],
  );
  assert.deepEqual(
    classifyPresentationFaces(naginata).layers.map((layer) => layer.faces.map((face) => face.trigger)),
    [[[]], [['space']]],
  );
  const naginataGroups = classifyPresentationFaces(naginata);
  assert.deepEqual(
    naginataGroups.modifiers.slice(0, 6).map((layer) => layer.faces.map((face) => face.trigger)),
    [[['q']], [['j'], ['f']], [['m'], ['v']], [['h']], [['p']], [['i']]],
  );
  assert.equal(naginataGroups.modifiers.length, 29);
  assert.equal(naginataGroups.combos.length, 0);

  assert.equal(handOfKey('space'), 'right');

  const invalidFaces: Face[] = [
    {
      trigger: ['a'],
      mode: 'simultaneous',
      rows: faceAtF('x'),
      layer: '不正',
      inputRole: 'layer',
      triggerPersistence: 'single',
    },
    {
      trigger: ['s'],
      mode: 'simultaneous',
      rows: faceAtF('y'),
      layer: '不正',
      inputRole: 'layer',
      triggerPersistence: 'single',
    },
  ];
  assert.throws(
    () => fromFaces('invalid-fold', 'invalid-fold', invalidFaces),
    /レイヤー「不正」の面が畳み条件を満たさない/,
  );
});

test('畳んだレイヤーはauthoringで明示したpresentation membershipだけを表示する（#95, #261）', () => {
  const layout = LAYOUT_BY_ID.get('shingeta')!;
  const layers = classifyPresentationFaces(layout).layers;
  const middleLeft = layers[1].faces[0];
  const middleRight = layers[1].faces[1];
  const ringLeft = layers[2].faces[0];
  const ringRight = layers[2].faces[1];

  // reciprocal semantic membershipはrows側へ明示済み。
  assert.equal(faceCells(middleRight).get('k'), 'れ');
  assert.equal(faceCells(ringRight).get('l'), 'さ');

  // 別レイヤー交点はsemantic rowsを増やさずpresentation-onlyで明示する。
  assert.equal(faceCells(middleRight).has('l'), false);
  assert.equal(faceCells(ringRight).has('k'), false);
  assert.equal(faceDisplayCells(middleRight).get('l'), 'お');
  assert.equal(faceDisplayCells(ringRight).get('k'), 'じ');
  assert.equal(faceDisplayCells(middleLeft).get('d'), 'れ');
  assert.equal(faceDisplayCells(ringLeft).get('s'), 'さ');

  assert.deepEqual(layout.map.get('お'), [['l', 'd']]);
  assert.deepEqual(layout.map.get('じ'), [['k', 's']]);
  assert.deepEqual(layout.map.get('さ'), [['l', 's']]);

  const tsuki = LAYOUT_BY_ID.get('tsuki-2-263')!;
  const tsukiLayer = classifyPresentationFaces(tsuki).layers[1];
  const tsukiCells = new Map(tsukiLayer.faces.flatMap((face) => [...faceDisplayCells(face)]));
  assert.equal(tsukiCells.get('d'), 'ら');
  assert.equal(tsukiCells.get('k'), 'も');
});

test('薙刀式v18は面から生成され、全定義を1ステップで保持する', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18')!;

  assert.equal(layout.map.size, 150);
  assert.equal(layout.map.has(' '), false);
  assert.equal(layout.legends.get('thumb-l'), 'Space');
  assert.equal(layout.legends.get('thumb-r'), 'Space');
  assert.equal(layout.legends.has('space'), false);
  for (const sequence of layout.map.values()) assert.equal(sequence.length, 1);
  assert.deepEqual(layout.map.get('きゃ'), [['h', 'w']]);
  assert.deepEqual(layout.map.get('ぐゎ'), [['.', 'f', 'h']]);
});

test('薙刀式の装飾triggerはcanonical logical groupを保持する', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18')!;

  const sandS = layout.canonicalInputs.get('お')?.[0]?.semanticInputs[0];
  const youon = layout.canonicalInputs.get('きゃ')?.[0]?.semanticInputs[0];
  const extension = layout.canonicalInputs.get('ぐゎ')?.[0]?.semanticInputs[0];
  assert.ok(sandS);
  assert.ok(youon);
  assert.ok(extension);

  assert.deepEqual(
    sandS.roles.filter((role) => role.role === 'modifier'),
    [{ key: 'thumb-r', role: 'modifier', modifierGroupId: 'SandS' }],
  );
  assert.deepEqual(
    youon.roles.filter((role) => role.role === 'modifier'),
    [{ key: 'h', role: 'modifier', modifierGroupId: '拗音' }],
  );
  assert.equal(extension.classifications.includes('composition'), false);
  assert.deepEqual(
    extension.roles
      .filter((role) => role.role === 'modifier')
      .map((role) => [role.key, role.modifierGroupId])
      .sort(),
    [['.', '外来音'], ['f', '濁音']],
  );
});

test('薙刀式のSandS presentationをFace authoringで明示する', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18')!;
  const centerShift = classifyPresentationFaces(layout).layers[1].faces[0];

  assert.deepEqual(centerShift.trigger, ['space']);
  assert.deepEqual(centerShift.presentationTriggerAlternatives, [['thumb-l'], ['thumb-r']]);
  assert.equal(centerShift.presentationTriggerText, 'Space');
  assert.equal(centerShift.presentationLabel, 'SandS');
  assert.deepEqual(displayTriggerKeys(centerShift), ['thumb-l', 'thumb-r']);
  assert.equal(layout.faceLayerIds?.get(centerShift), 'layer:SandS');
  assert.deepEqual(layout.layerViewPresentation?.compact, {
    keepLayerIds: ['single', 'layer:SandS'],
    mergeIntoLayerId: 'single',
    mergedTitleSuffix: '（レイヤー3以降を合算）',
    controlLabel: '薙刀式の表示',
    compactLabel: '2面にまとめる',
    detailLabel: '全レイヤー詳細',
  });
  assert.deepEqual(layout.map.get('の'), [['space', 'j']]);
});

test('新JISの親指shift presentationは左右を同じSpaceとして扱う', () => {
  for (const id of ['shin-jis-prefix', 'shin-jis-simultaneous']) {
    const layout = LAYOUT_BY_ID.get(id)!;
    const shifted = classifyPresentationFaces(layout).layers[1]?.faces[0];
    assert.ok(shifted);
    assert.deepEqual(
      shifted.presentationTriggerAlternatives,
      [['thumb-l'], ['thumb-r']],
    );
    assert.equal(shifted.presentationTriggerText, 'Space');
    assert.equal(shifted.presentationLabel, 'Shift');
    assert.equal(layout.legends.get('thumb-l'), 'Space');
    assert.equal(layout.legends.get('thumb-r'), 'Space');
  }
});

test('trigger presentationは明示alternativeとchordを区別して正規化する', () => {
  const explicit: Face = {
    ...faceFromEntries(['space'], 'simultaneous', { j: 'あ' }),
    presentationTriggerAlternatives: [['thumb-l'], ['thumb-r']],
    presentationTriggerText: '任意の両親指表示',
    presentationLabel: 'Custom Shift',
  };
  assert.deepEqual(displayTriggerAlternatives(explicit), [['thumb-l'], ['thumb-r']]);
  assert.deepEqual(displayTriggerKeys(explicit), ['thumb-l', 'thumb-r']);
  assert.equal(displayTriggerHandLabel(explicit), undefined);
  assert.equal(explicit.presentationTriggerText, '任意の両親指表示');
  assert.equal(explicit.presentationLabel, 'Custom Shift');

  const ordinary = faceFromEntries(['space'], 'simultaneous', { j: 'あ' });
  assert.deepEqual(displayTriggerAlternatives(ordinary), [['thumb-r']]);
  assert.deepEqual(displayTriggerKeys(ordinary), ['thumb-r']);
  assert.equal(displayTriggerHandLabel(ordinary), '右手');

  const chord = faceFromEntries(['j', 'k'], 'simultaneous', { r: 'い' });
  assert.deepEqual(displayTriggerAlternatives(chord), [['j', 'k']]);
  assert.deepEqual(displayTriggerKeys(chord), ['j', 'k']);
  assert.equal(displayTriggerHandLabel(chord), '右手');

  const twoHandChord: Face = {
    ...ordinary,
    presentationTriggerAlternatives: [['thumb-l', 'thumb-r']],
  };
  assert.deepEqual(displayTriggerAlternatives(twoHandChord), [['thumb-l', 'thumb-r']]);
  assert.equal(displayTriggerHandLabel(twoHandChord), '両手');
});

test('presentation trigger matcherはalternative単位のexact matchだけを許可する', () => {
  const face: Face = {
    ...faceFromEntries(['space'], 'simultaneous', { j: 'あ' }),
    presentationTriggerAlternatives: [
      ['thumb-l'],
      ['thumb-r'],
      ['j', 'k'],
    ],
  };
  assert.equal(matchesDisplayTriggerAlternative(face, new Set(['thumb-l'])), true);
  assert.equal(matchesDisplayTriggerAlternative(face, new Set(['thumb-r'])), true);
  assert.equal(matchesDisplayTriggerAlternative(face, new Set(['j', 'k'])), true);
  assert.equal(matchesDisplayTriggerAlternative(face, new Set(['j'])), false);
  assert.equal(matchesDisplayTriggerAlternative(face, new Set(['thumb-l', 'thumb-r'])), false);
});

test('presentation trigger alternativesはalias・重複を正規化し空authoringを拒否する', () => {
  const face: Face = {
    ...faceFromEntries(['space'], 'simultaneous', { j: 'あ' }),
    presentationTriggerAlternatives: [
      ['space', 'thumb-r'],
      ['thumb-r'],
    ],
  };
  assert.deepEqual(displayTriggerAlternatives(face), [['thumb-r']]);

  assert.throws(
    () => displayTriggerAlternatives({
      ...face,
      presentationTriggerAlternatives: [[]] as unknown as NonNullable<Face['presentationTriggerAlternatives']>,
    }),
    /空にできない/,
  );
  assert.throws(
    () => displayTriggerAlternatives({
      ...face,
      presentationTriggerAlternatives: [] as unknown as NonNullable<Face['presentationTriggerAlternatives']>,
    }),
    /presentationTriggerAlternativesは空にできない/,
  );
});

test('fromFacesはFaceModeをaggregation presentation metadataへcompileする', () => {
  const simultaneous: Face = {
    ...faceFromEntries(['d'], 'simultaneous', { j: 'あ' }),
    layer: '同時層',
    inputRole: 'layer',
    triggerPersistence: 'single',
  };
  const prefix: Face = {
    ...faceFromEntries(['f'], 'prefix', { k: 'い' }),
    layer: '前置層',
    inputRole: 'layer',
    triggerPersistence: 'single',
  };
  const suffix: Face = {
    ...faceFromEntries(['g'], 'suffix', { l: 'う' }),
    layer: '後置層',
    inputRole: 'layer',
    triggerPersistence: 'single',
  };
  const layout = fromFaces('mode-presentation', 'mode-presentation', [
    simultaneous,
    prefix,
    suffix,
  ]);

  assert.equal(
    layout.layerDefinitions?.find((definition) => definition.id === 'layer:同時層')?.presentationModeLabel,
    '同時',
  );
  assert.equal(
    layout.layerDefinitions?.find((definition) => definition.id === 'layer:前置層')?.presentationModeLabel,
    '前置',
  );
  assert.equal(
    layout.layerDefinitions?.find((definition) => definition.id === 'layer:後置層')?.presentationModeLabel,
    '後置',
  );
  assert.equal(
    layout.layerDefinitions?.find((definition) => definition.id === 'single')?.presentationModeLabel,
    undefined,
  );
});

test('triggerOrderが異なるFaceは同じレイヤーへ畳まない', () => {
  const first: Face = {
    ...faceFromEntries(['k'], 'simultaneous', { d: 'あ' }),
    layer: '順序',
    triggerOrder: 'prefix',
    triggerPersistence: 'single',
  };
  const second: Face = {
    // canonical上は同一outputの別pathとして合法にし、authoring folding validationを直接踏む。
    ...faceFromEntries(['d'], 'simultaneous', { k: 'あ' }),
    layer: '順序',
    triggerPersistence: 'single',
  };

  assert.throws(
    () => fromFaces('invalid-trigger-order', 'invalid-trigger-order', [
      { ...first, inputRole: 'layer' },
      { ...second, inputRole: 'layer' },
    ]),
    /triggerOrderが異なる/,
  );
});

test('シフトの表示色は手ではなく所属aggregationで揃え、singleはshift扱いしない', () => {
  const layout = LAYOUT_BY_ID.get('shingeta')!;
  const layers = classifyPresentationFaces(layout).layers;
  const styles = layerShiftStyles(layers);

  assert.equal(layers[0].id, 'single');
  assert.equal(styles.has(layers[0].faces[0]), false, 'single aggregationはシフト色を持たない');
  assert.ok(styles.has(layers[1].faces[0]), '相互シフトの片側に枠色がある');
  assert.ok(styles.has(layers[1].faces[1]), '相互シフトのもう片側にも枠色がある');
  assert.equal(styles.get(layers[1].faces[0])?.layerIndex, 2);
  assert.equal(styles.get(layers[1].faces[0])?.colorSlot, styles.get(layers[1].faces[1])?.colorSlot);
  assert.notEqual(styles.get(layers[1].faces[0])?.colorSlot, styles.get(layers[2].faces[0])?.colorSlot);
});

test('相互同時シフトは両トリガーを1回分の色として残す', () => {
  const layout = LAYOUT_BY_ID.get('shingeta')!;
  const layers = classifyPresentationFaces(layout).layers;
  for (const [layerIndex, trigger, output] of [[1, 'k', 'd'], [2, 'l', 's']] as const) {
    const colors = normalizedLayerColors(layers[layerIndex], {
      keyCounts: new Map([[trigger, 1], [output, 1]]),
      triggerKeyCounts: new Map([[trigger, 1]]),
      pairedTriggerKeyCounts: new Map([[trigger, 1]]),
    });

    assert.equal(colors.size, 2);
    assert.equal(colors.get(trigger), 1);
    assert.equal(colors.get(output), 1);
  }
});

test('薙刀式の合算表示はスペースなし層のトリガーを単打側の色に残す', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18')!;
  const base = classifyPresentationFaces(layout).layers[0];
  const colors = normalizedLayerColors(base, {
      keyCounts: new Map([['j', 1], ['f', 1]]),
      triggerKeyCounts: new Map([['j', 1]]),
      pairedTriggerKeyCounts: new Map([['j', 1]]),
  });

  assert.equal(colors.size, 2);
  assert.equal(colors.get('j'), 1);
  assert.equal(colors.get('f'), 1);
});

test('通常の層トリガーは残さず、薙刀式の濁音詳細も除外する', () => {
  const shingeta = LAYOUT_BY_ID.get('shingeta')!;
  const middle = classifyPresentationFaces(shingeta).layers[1];
  const normalColors = normalizedLayerColors(middle, {
    keyCounts: new Map([['k', 1], ['w', 1]]),
    triggerKeyCounts: new Map([['k', 1]]),
    pairedTriggerKeyCounts: new Map(),
  });
  assert.deepEqual([...normalColors], [['w', 1]]);

  const naginata = LAYOUT_BY_ID.get('naginata-v18')!;
  const modifiers = classifyPresentationFaces(naginata).modifiers;
  const voiced = modifiers.find((layer) => layer.faces.some((face) => face.layer === '濁音'))!;
  const detailColors = normalizedLayerColors(voiced, {
    keyCounts: new Map([['j', 1], ['f', 1]]),
    triggerKeyCounts: new Map([['j', 1]]),
    pairedTriggerKeyCounts: new Map([['j', 1], ['f', 1]]),
  });
  assert.deepEqual([...detailColors], [['f', 1]]);
});

test('NICOLAは3面の直接かな入力を同時押しとして保持する', () => {
  const layout = LAYOUT_BY_ID.get('nicola')!;

  assert.equal(layout.map.size, 89);
  assert.deepEqual(layout.map.get('。'), [['q']]);
  assert.deepEqual(layout.map.get('え'), [['thumb-l', 'w']]);
  assert.deepEqual(layout.map.get('が'), [['thumb-r', 'w']]);
  assert.deepEqual(layout.map.get('ー'), [['thumb-l', 'x']]);
  assert.deepEqual(layout.map.get('っ'), [['thumb-r', ';']]);
  assert.equal(layout.legends.get('thumb-l'), '無変換');
  assert.equal(layout.legends.get('thumb-r'), '変換');
  for (const sequence of layout.map.values()) assert.equal(sequence.length, 1);
  assertKanaLayout(layout, ['ゎ']);
});

test('新下駄配列は7面の直接かな入力を同時押しとして保持する', () => {
  const layout = LAYOUT_BY_ID.get('shingeta')!;

  assert.deepEqual(layout.map.get('ー'), [['q']]);
  assert.deepEqual(layout.map.get('あ'), [['d', 'j']]);
  assert.deepEqual(layout.map.get('しゃ'), [['i', 'c']]);
  assert.deepEqual(layout.map.get('ぁ'), [['k', '1']]);
  assert.deepEqual(layout.map.get('ヴ'), [['d', '/']]);
  assert.equal(layout.legends.has('thumb-l'), false);
  assert.equal(layout.legends.has('thumb-r'), false);
  for (const sequence of layout.map.values()) assert.equal(sequence.length, 1);
  assertKanaLayout(layout);
});


test('かわせみ配列改は二重母音拡張のみを追加し長音をQWERTY /位置に置く', () => {
  const layout = LAYOUT_BY_ID.get('kawasemi-kai')!;

  assert.equal(layout.name, 'かわせみ配列改');
  assert.deepEqual(layout.map.get('あ'), [[';']]);
  assert.deepEqual(layout.map.get('ー'), [['/']]);
  assert.deepEqual(layout.map.get('けい'), [['h', 'j', 's']]);
  assert.deepEqual(layout.map.get('きょう'), [['u', 'i', 's']]);
  assert.deepEqual(layout.map.get('うい'), [['.', ',']]);
  assert.deepEqual(layout.map.get('ヴ'), [['t', '8']]);
  assert.equal(layout.map.has('そく'), false);
  assert.equal(layout.map.has('てつ'), false);
  for (const sequence of layout.map.values()) assert.equal(sequence.length, 1);
  assertKanaLayout(layout);
});

test('かわせみ配列+はKikyo版の4拡張を同時打鍵として保持する', () => {
  const layout = LAYOUT_BY_ID.get('kawasemi-plus')!;

  assert.equal(layout.name, 'かわせみ配列+');
  assert.deepEqual(layout.map.get('あ'), [[';']]);
  assert.deepEqual(layout.map.get('ー'), [['/']]);
  assert.deepEqual(layout.map.get('けい'), [['h', 'j', 's']]);
  assert.deepEqual(layout.map.get('きょう'), [['u', 'i', 's']]);
  assert.deepEqual(layout.map.get('こと'), [['d', 's']]);
  assert.deepEqual(layout.map.get('そく'), [['thumb-r', 'd', 'j']]);
  assert.deepEqual(layout.map.get('てつ'), [['thumb-l', 'v']]);
  assert.deepEqual(layout.map.get('ヴ'), [['t', '8']]);
  assert.equal(layout.legends.get('thumb-l'), '左親指');
  assert.equal(layout.legends.get('thumb-r'), '右親指');

  const rightThumb = layout.faces?.find((face) => face.layer === '右親指');
  const leftThumb = layout.faces?.find((face) => face.layer === '左親指');
  assert.equal(rightThumb?.inputRole, 'modifier');
  assert.equal(rightThumb?.triggerPersistence, 'hold-capable');
  assert.equal(leftThumb?.inputRole, 'modifier');
  assert.equal(leftThumb?.triggerPersistence, 'hold-capable');

  // 現行schemaでは複合triggerの一部（親指だけ）を保持対象にできないため、
  // 親指 + 行指定の3キーコンボはwhole-trigger holdに誤解されないようsingleとする。
  const rightThumbSa = layout.faces?.find((face) =>
    face.trigger.includes('thumb-r') && face.trigger.includes('d')
  );
  assert.equal(rightThumbSa?.triggerPersistence, 'single');
  for (const sequence of layout.map.values()) assert.equal(sequence.length, 1);
  assertKanaLayout(layout);
});

test('面定義を出典フィクスチャの全セルと照合する（#83）', () => {
  for (const id of [
    'naginata-v18',
    'nicola',
    'asuka',
    'shin-jis-prefix',
    'shin-jis-simultaneous',
    'shingeta',
    'shin-koume',
    'tsuki-2-263',
  ]) {
    assertKanaLayoutFixture(LAYOUT_BY_ID.get(id)!);
  }
});

test('月配列2-263式はクロスシフトと濁音の逐次合成を保持する', () => {
  const layout = LAYOUT_BY_ID.get('tsuki-2-263')!;

  assert.deepEqual(layout.map.get('そ'), [['q']]);
  assert.deepEqual(layout.map.get('ら'), [['k'], ['d']]);
  assert.deepEqual(layout.map.get('お'), [['d'], ['j']]);
  assert.deepEqual(layout.map.get('が'), [['s'], ['l']]);
  assert.deepEqual(layout.map.get('ぱ'), [['a'], ['/']]);
  assert.deepEqual(layout.map.get('ゔ'), [['j'], ['l']]);
  assert.equal(layout.map.has('ヴ'), false);
  assert.equal(layout.legends.has('thumb-l'), false);
  assert.equal(layout.legends.has('thumb-r'), false);
  assertKanaLayout(layout, ['ゎ', 'ヴ']);
});

test('新JISは同じかな配置を逐次シフトと通常シフトで共有する', () => {
  const prefix = LAYOUT_BY_ID.get('shin-jis-prefix')!;
  const simultaneous = LAYOUT_BY_ID.get('shin-jis-simultaneous')!;

  assertKanaLayout(prefix, ['ゎ', 'ヴ']);
  assertKanaLayout(simultaneous, ['ゎ', 'ヴ']);

  const faceCells = (layout: typeof prefix) => layout.faces!.map((face) =>
    face.rows.map((row) => typeof row === 'string' ? [...row] : [...row]),
  );
  assert.deepEqual(faceCells(prefix), faceCells(simultaneous));
  assert.deepEqual([...prefix.map.keys()].sort(), [...simultaneous.map.keys()].sort());

  assert.deepEqual(prefix.map.get('そ'), [['q']]);
  assert.deepEqual(simultaneous.map.get('そ'), [['q']]);
  assert.deepEqual(prefix.map.get('ぁ'), [['thumb-r'], ['q']]);
  assert.deepEqual(simultaneous.map.get('ぁ'), [['thumb-r', 'q']]);
  assert.deepEqual(prefix.map.get('が'), [['s'], ['l']]);
  assert.deepEqual(simultaneous.map.get('が'), [['s'], ['l']]);
  assert.deepEqual(prefix.map.get('ぱ'), [['a'], ['thumb-r'], ['w']]);
  assert.deepEqual(simultaneous.map.get('ぱ'), [['a'], ['thumb-r', 'w']]);

  assert.equal(prefix.thumbShiftKey, 'thumb-r');
  assert.equal(simultaneous.thumbShiftKey, 'thumb-r');
  assert.deepEqual(prefix.thumbShiftKeys, ['thumb-r', 'thumb-l']);
  assert.deepEqual(simultaneous.thumbShiftKeys, ['thumb-r', 'thumb-l']);
  for (const layout of [prefix, simultaneous]) {
    assert.equal(layout.legends.get('thumb-l'), 'Space');
    assert.equal(layout.legends.get('thumb-r'), 'Space');
  }
});

test('imported user Sequenceもcanonical SemanticInput列へ同期する', () => {
  const layout = toLayout({
    id: 'user-sequence',
    name: 'user-sequence',
    rows: ['', '', '', ''],
    romaji: 'kunrei',
    sequences: [['x', [['space', 'j'], ['j']]]],
    legends: [],
    direct: true,
  });

  const inputs = layout.canonicalInputs.get('x')?.[0]?.semanticInputs;
  assert.ok(inputs);
  assert.equal(inputs.length, 2);
  assert.deepEqual(inputs[0].physicalKeys, ['j', 'thumb-r']);
  assert.deepEqual(inputs[0].requirements, [
    { kind: 'overlap', keys: ['j', 'thumb-r'] },
  ]);
  assert.equal(inputs[0].output, '');
  assert.deepEqual(inputs[1].physicalKeys, ['j']);
  assert.equal(inputs[1].output, 'x');
});

test('imported user Sequenceの完全一致pathはcanonical identityで1件へdedupeする', () => {
  const layout = toLayout({
    id: 'user-sequence-dedupe',
    name: 'user-sequence-dedupe',
    rows: ['x', '', '', ''],
    romaji: 'kunrei',
    sequences: [['x', [['1']]]],
    legends: [],
    direct: true,
  });

  const alternatives = layout.canonicalInputs.get('x');
  assert.ok(alternatives);
  assert.equal(alternatives.length, 1);
  assert.deepEqual(alternatives[0].baseRealizations[0].actions, [['1']]);
});

test('保存済み凡例のspaceもthumb-rへ解決する', () => {
  const layout = toLayout({
    id: 'user-legacy',
    name: 'legacy',
    rows: ['', '', '', ''],
    romaji: 'kunrei',
    sequences: [['x', [['space']]]],
    legends: [['space', 'Space']],
    direct: true,
  });

  assert.equal(layout.legends.get('thumb-r'), 'Space');
  assert.equal(layout.legends.has('space'), false);
  assert.equal(layout.canonicalInputs.has(' '), false, 'imported keymapへsynthetic spaceを追加しない');
  assert.deepEqual(layout.canonicalInputs.get('x')?.[0]?.semanticInputs?.[0].physicalKeys, ['thumb-r']);
});

test('薙刀式v18の面移行で入力可能範囲とphysical action数を維持する', () => {
  const geometry = buildGeometry('row-staggered');
  const layout = LAYOUT_BY_ID.get('naginata-v18')!;
  const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
  const trace = evaluate(text, layout, geometry, DEFAULT_OPTIONS);
  const metrics = computeMetrics(trace, geometry);

  assert.equal(trace.skipped, 0);
  assert.equal(metrics.strokes, 1654);
  assert.equal(metrics.presses, 2440);
  assert.ok(Number.isFinite(metrics.totalUnits) && metrics.totalUnits > 0);
});


test('custom combo classificationはpresentation groupと独立してcanonicalへ保持する', () => {
  const layout = LAYOUT_BY_ID.get('oonishi-custom-combo')!;
  const vocabulary = layout.canonicalInputs.get('desita')?.[0]?.semanticInputs[0];
  const youon = layout.canonicalInputs.get('yaku')?.[0]?.semanticInputs[0];
  assert.ok(vocabulary);
  assert.ok(youon);
  assert.deepEqual(vocabulary.classifications, ['composition', 'vocabulary-extension']);
  assert.deepEqual(youon.classifications, ['composition', 'youon-extension']);
});


test('presentationLabelはcompiled layerDefinition labelへ保持される', () => {
  const face: Face = {
    ...faceFromEntries(['space'], 'simultaneous', { j: 'の' }),
    inputRole: 'modifier',
    triggerPersistence: 'single',
    presentationLabel: 'Custom Shift',
  };
  const layout = fromFaces('presentation-label', 'presentation-label', [face]);
  const layerId = layout.faceLayerIds?.get(face);
  assert.ok(layerId);
  assert.equal(
    layout.layerDefinitions?.find((definition) => definition.id === layerId)?.label,
    'Custom Shift',
  );
});


test('同一aggregationのpresentationLabel conflictはFace順によらずrejectする', () => {
  const left: Face = {
    ...faceFromEntries(['d'], 'simultaneous', { j: '甲' }),
    layer: 'X',
    role: 'modifier',
    inputRole: 'modifier',
    triggerPersistence: 'single',
    presentationLabel: 'Alpha',
  };
  const right: Face = {
    ...faceFromEntries(['k'], 'simultaneous', { f: '乙' }),
    layer: 'X',
    role: 'modifier',
    inputRole: 'modifier',
    triggerPersistence: 'single',
    presentationLabel: 'Beta',
  };

  for (const faces of [[left, right], [right, left]] as const) {
    assert.throws(
      () => fromFaces('presentation-label-conflict', 'presentation-label-conflict', faces),
      /presentationLabelが競合している/,
    );
  }
});

test('同一aggregationで片側だけpresentationLabelなら順序によらずcompiled labelへ採用する', () => {
  const explicit: Face = {
    ...faceFromEntries(['d'], 'simultaneous', { j: '甲' }),
    layer: 'X',
    role: 'modifier',
    inputRole: 'modifier',
    triggerPersistence: 'single',
    presentationLabel: 'Custom X',
  };
  const implicit: Face = {
    ...faceFromEntries(['k'], 'simultaneous', { f: '乙' }),
    layer: 'X',
    role: 'modifier',
    inputRole: 'modifier',
    triggerPersistence: 'single',
  };

  for (const faces of [[explicit, implicit], [implicit, explicit]] as const) {
    const layout = fromFaces('presentation-label-merge', 'presentation-label-merge', faces);
    const definition = layout.layerDefinitions?.find((entry) => entry.id === 'layer:X');
    assert.equal(definition?.label, 'Custom X');
    assert.equal(definition?.presentationRole, 'modifier');
    assert.equal(definition?.presentationModeLabel, '同時');
  }
});


test('composition FaceのpresentationLabelはsilent ignoreせずrejectする', () => {
  const face: Face = {
    ...faceFromEntries(['d'], 'simultaneous', { j: '甲' }),
    inputRole: 'composition',
    triggerPersistence: 'single',
    presentationLabel: 'Custom Combo',
  };

  assert.throws(
    () => fromFaces('composition-presentation-label', 'composition-presentation-label', [face]),
    /composition FaceではpresentationLabelを指定できない/,
  );
});
