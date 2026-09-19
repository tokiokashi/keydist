import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '../src/geometry.ts';
import { DEFAULT_OPTIONS, evaluate } from '../src/evaluate.ts';
import { faceFromEntries, fromFaces, LAYOUT_BY_ID, LAYOUTS, LAYOUTS_JA } from '../src/layouts/index.ts';
import { computeMetrics } from '../src/metrics.ts';
import { SAMPLE_TEXT_JA } from '../src/sample-text-ja.ts';
import { toLayout } from '../src/user-layouts.ts';
import { assertKanaLayout, assertKanaLayoutFixture } from './kana-layout-helpers.ts';
import {
  canFoldFaces,
  classifyFaces,
  displayTriggerKeys,
  foldedLayerCells,
  groupFacesIntoLayers,
  handOfKey,
  layerShiftStyles,
} from '../src/layers.ts';
import { normalizedLayerColors } from '../src/layer-heatmap.ts';

const faceAtF = (output: string) => ['', '', ['', '', '', output], ''];

test('面はprefix / suffix / simultaneousをSequenceに展開する', () => {
  const layout = fromFaces('faces', 'faces', [
    { trigger: [], mode: 'simultaneous', rows: faceAtF('あ') },
    { trigger: ['d'], mode: 'prefix', rows: faceAtF('か'), triggerPersistence: 'single' },
    { trigger: ['d'], mode: 'suffix', rows: faceAtF('さ'), triggerPersistence: 'single' },
    { trigger: ['j'], mode: 'simultaneous', rows: faceAtF('た'), triggerPersistence: 'single' },
  ]);

  assert.deepEqual(layout.map.get('あ'), [['f']]);
  assert.deepEqual(layout.map.get('か'), [['d'], ['f']]);
  assert.deepEqual(layout.map.get('さ'), [['f'], ['d']]);
  assert.deepEqual(layout.map.get('た'), [['j', 'f']]);
});

test('面の展開後も各ステップの層帰属を保持する（#87）', () => {
  const layout = fromFaces('attribution', 'attribution', [
    { trigger: [], mode: 'simultaneous', rows: faceAtF('あ') },
    { trigger: ['d'], mode: 'prefix', rows: faceAtF('か'), layer: '中指', triggerPersistence: 'single' },
    { trigger: ['j'], mode: 'prefix', rows: faceAtF('さ'), layer: '人差指', triggerPersistence: 'single' },
    { trigger: ['k', 'l'], mode: 'simultaneous', rows: faceAtF('た'), triggerPersistence: 'single' },
  ]);
  const trace = evaluate('あかさた', layout, buildGeometry('row-staggered'), DEFAULT_OPTIONS);

  assert.deepEqual(trace.strokes.map((stroke) => stroke.layerId), [
    'face:0', 'layer:中指', 'layer:中指', 'layer:人差指', 'layer:人差指', 'combo',
  ]);
  const metrics = computeMetrics(trace, buildGeometry('row-staggered'));
  assert.deepEqual(metrics.layers.map((layer) => [layer.id, layer.presses]), [
    ['face:0', 1], ['layer:中指', 2], ['layer:人差指', 2],
  ]);
  assert.equal(metrics.comboPresses, 3);
});

test('出力を持つtrigger FaceはtriggerPersistence必須、空placeholderは許容する', () => {
  assert.throws(
    () => fromFaces('invalid-persistence', 'invalid-persistence', [
      { trigger: ['d'], mode: 'prefix', rows: faceAtF('か') },
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

test('TK音直入力法は英文モードでも英字配置として選べる', () => {
  const layout = LAYOUTS.find((entry) => entry.id === 'oonishi-custom');
  assert.ok(layout);
  assert.equal(layout.name, 'TK音直入力法');
  assert.equal(layout.romajiTable, undefined);
  assert.equal(layout.comboDefinitions, undefined);
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
  const desita = combo?.comboDefinitions?.find((definition) => definition.output === 'desita');
  assert.deepEqual(desita?.inputs, ['d', 's', 't']);
  assert.deepEqual(desita?.keys, ['m', 'l', 'j']);
  assert.equal(desita?.group, '語彙拡張');
  assert.equal(desita?.foldTriggerInputs, undefined);

  const ya = combo?.comboDefinitions?.find((definition) => definition.output === 'ya');
  const yaku = combo?.comboDefinitions?.find((definition) => definition.output === 'yaku');
  const atu = combo?.comboDefinitions?.find((definition) => definition.output === 'atu');
  const ai = combo?.comboDefinitions?.find((definition) => definition.output === 'ai');
  assert.deepEqual(ya?.foldTriggerInputs, ['i']);
  assert.deepEqual(yaku?.foldTriggerInputs, ['i', 'a']);
  assert.deepEqual(atu?.foldTriggerInputs, [',']);
  assert.deepEqual(ai?.foldTriggerInputs, ['e']);

  const groupCounts = new Map<string, number>();
  for (const definition of combo?.comboDefinitions ?? []) {
    if (definition.group) groupCounts.set(definition.group, (groupCounts.get(definition.group) ?? 0) + 1);
  }
  assert.deepEqual([...groupCounts], [
    ['語彙拡張', 17],
    ['拗音拡張', 19],
    ['入声拡張', 20],
    ['撥音拡張', 7],
    ['二重母音拡張', 10],
  ]);
  assert.equal(combo?.comboDefinitions?.length, 73);
  assert.ok(LAYOUTS_JA.some((layout) => layout.id === 'oonishi-custom-combo'));
  assert.equal(tsuki?.name, '月配列2-263式');
  assert.ok(!oonishi?.name.includes(' '));
  assert.ok(!tsuki?.name.includes(' '));
});

test('面のセル配列は複数文字の見出しを1キーへ置ける', () => {
  const layout = fromFaces('multi', 'multi', [
    { trigger: [], mode: 'simultaneous', rows: ['', '', ['', '', '', 'きゃ'], ''] },
  ]);

  assert.deepEqual(layout.map.get('きゃ'), [['f']]);
  assert.equal(layout.maxCharLength, 2);
});

test('宣言された面だけを逆手の条件でレイヤーへ集約する', () => {
  const shingeta = LAYOUT_BY_ID.get('shingeta')!;
  const tsuki = LAYOUT_BY_ID.get('tsuki-2-263')!;
  const nicola = LAYOUT_BY_ID.get('nicola')!;
  const naginata = LAYOUT_BY_ID.get('naginata-v18')!;

  const counts = [shingeta, tsuki, nicola, naginata].map((layout) => {
    const groups = classifyFaces(layout.faces!);
    return [layout.faces!.length, groups.layers.length, groups.modifiers.length, groups.combos.length];
  });
  assert.deepEqual(counts, [
    [7, 3, 0, 2],
    [3, 2, 0, 0],
    [3, 3, 0, 0],
    [33, 2, 6, 23],
  ]);

  assert.deepEqual(
    groupFacesIntoLayers(shingeta.faces!).map((layer) => layer.faces.map((face) => face.trigger)),
    [[[]], [['k'], ['d']], [['l'], ['s']]],
  );
  assert.deepEqual(
    groupFacesIntoLayers(tsuki.faces!).map((layer) => layer.faces.map((face) => face.trigger)),
    [[[]], [['d'], ['k']]],
  );
  assert.deepEqual(
    groupFacesIntoLayers(nicola.faces!).map((layer) => layer.faces.map((face) => face.trigger)),
    [[[]], [['thumb-l']], [['thumb-r']]],
  );
  assert.deepEqual(
    groupFacesIntoLayers(naginata.faces!).map((layer) => layer.faces.map((face) => face.trigger)),
    [[[]], [['space']]],
  );
  assert.deepEqual(
    classifyFaces(naginata.faces!).modifiers.map((layer) => layer.faces.map((face) => face.trigger)),
    [[['q']], [['j'], ['f']], [['m'], ['v']], [['h']], [['p']], [['i']]],
  );

  assert.equal(handOfKey('space'), 'right');
  assert.equal(canFoldFaces(shingeta.faces![1], shingeta.faces![2]), true);
  assert.equal(canFoldFaces(shingeta.faces![1], shingeta.faces![5]), false);
  assert.equal(canFoldFaces(naginata.faces![3], naginata.faces![4]), true);
  assert.equal(canFoldFaces(naginata.faces![5], naginata.faces![6]), true);
  assert.equal(canFoldFaces(nicola.faces![1], nicola.faces![2]), false);
  assert.equal(canFoldFaces(
    { trigger: ['k'], mode: 'simultaneous', rows: faceAtF('x') },
    { trigger: ['d'], mode: 'prefix', rows: ['', '', ['', '', '', '', '', '', 'y'], ''] },
  ), false);
  const invalidFaces = [
    { trigger: ['a'], mode: 'simultaneous' as const, rows: faceAtF('x'), layer: '不正' },
    { trigger: ['s'], mode: 'simultaneous' as const, rows: faceAtF('y'), layer: '不正' },
  ];
  assert.throws(() => canFoldFaces(invalidFaces[0], invalidFaces[1]), /レイヤー「不正」の面が畳み条件を満たさない/);
  assert.throws(() => groupFacesIntoLayers(invalidFaces), /レイヤー「不正」の面が畳み条件を満たさない/);
});

test('畳んだレイヤーの空きセルを相互シフトの対称位置から描画用に補完する（#95）', () => {
  const layout = LAYOUT_BY_ID.get('shingeta')!;
  const layers = groupFacesIntoLayers(layout.faces!);
  const middle = foldedLayerCells(layers[1], layout.faces!);
  const ring = foldedLayerCells(layers[2], layout.faces!);

  // Layout.mapの定義は片方向のままでも、図では同じ同時押しを相方の位置に出す。
  assert.equal(middle.get('k'), 'れ');
  assert.equal(middle.get('l'), 'お');
  assert.equal(ring.get('k'), 'じ');
  assert.equal(ring.get('l'), 'さ');
  assert.deepEqual(layout.map.get('じ'), [['k', 's']]);
  assert.deepEqual(layout.map.get('さ'), [['l', 's']]);

  const tsuki = LAYOUT_BY_ID.get('tsuki-2-263')!;
  const tsukiLayer = groupFacesIntoLayers(tsuki.faces!)[1];
  const tsukiCells = foldedLayerCells(tsukiLayer, tsuki.faces!);
  assert.equal(tsukiCells.get('d'), 'ら');
  assert.equal(tsukiCells.get('k'), 'も');
});

test('薙刀式v18は面から生成され、全定義を1ステップで保持する', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18')!;

  assert.equal(layout.map.size, 150);
  assert.equal(layout.map.has(' '), false);
  assert.equal(layout.legends.get('thumb-l'), '親指');
  assert.equal(layout.legends.get('thumb-r'), 'Space');
  assert.equal(layout.legends.has('space'), false);
  for (const sequence of layout.map.values()) assert.equal(sequence.length, 1);
  assert.deepEqual(layout.map.get('きゃ'), [['h', 'w']]);
  assert.deepEqual(layout.map.get('ぐゎ'), [['.', 'f', 'h']]);
});

test('薙刀式のSandS表示だけ左右のSpaceを強調する', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18')!;
  const centerShift = groupFacesIntoLayers(layout.faces!)[1].faces[0];

  assert.deepEqual(centerShift.trigger, ['space']);
  assert.deepEqual(displayTriggerKeys(layout, centerShift), ['thumb-l', 'thumb-r']);
  assert.deepEqual(layout.map.get('の'), [['space', 'j']]);
});

test('シフトの表示色は手ではなく所属レイヤーで揃える', () => {
  const layout = LAYOUT_BY_ID.get('shingeta')!;
  const layers = groupFacesIntoLayers(layout.faces!);
  const styles = layerShiftStyles(layers);

  assert.ok(styles.has(layers[1].faces[0]), '相互シフトの片側に枠色がある');
  assert.ok(styles.has(layers[1].faces[1]), '相互シフトのもう片側にも枠色がある');
  assert.equal(styles.get(layers[1].faces[0])?.layerIndex, 2);
  assert.equal(styles.get(layers[1].faces[0])?.colorSlot, styles.get(layers[1].faces[1])?.colorSlot);
  assert.notEqual(styles.get(layers[1].faces[0])?.colorSlot, styles.get(layers[2].faces[0])?.colorSlot);
});

test('相互同時シフトは両トリガーを1回分の色として残す', () => {
  const layout = LAYOUT_BY_ID.get('shingeta')!;
  const layers = groupFacesIntoLayers(layout.faces!);
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
  const base = classifyFaces(layout.faces!).layers[0];
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
  const middle = groupFacesIntoLayers(shingeta.faces!)[1];
  const normalColors = normalizedLayerColors(middle, {
    keyCounts: new Map([['k', 1], ['w', 1]]),
    triggerKeyCounts: new Map([['k', 1]]),
    pairedTriggerKeyCounts: new Map(),
  });
  assert.deepEqual([...normalColors], [['w', 1]]);

  const naginata = LAYOUT_BY_ID.get('naginata-v18')!;
  const modifiers = classifyFaces(naginata.faces!).modifiers;
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
  assert.equal(layout.maxCharLength, 1);
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


test('かわせみ配列+はKikyo版の4拡張を同時打鍵として保持する', () => {
  const layout = LAYOUT_BY_ID.get('kawasemi-plus')!;

  assert.equal(layout.name, 'かわせみ配列+');
  assert.deepEqual(layout.map.get('あ'), [[';']]);
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
  for (const layout of [prefix, simultaneous]) {
    assert.equal(layout.legends.get('thumb-l'), 'シフト');
    assert.equal(layout.legends.get('thumb-r'), 'シフト');
  }
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
});

test('薙刀式v18の面移行で総距離とステップ数を維持する', () => {
  const geometry = buildGeometry('row-staggered');
  const layout = LAYOUT_BY_ID.get('naginata-v18')!;
  const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
  const trace = evaluate(text, layout, geometry, DEFAULT_OPTIONS);
  const metrics = computeMetrics(trace, geometry);

  assert.equal(trace.skipped, 0);
  assert.equal(metrics.strokes, 1654);
  assert.equal(metrics.presses, 2440);
  assert.ok(Math.abs(metrics.totalUnits - 1131.0836338355334) < 1e-9);
});
