import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faceFromEntries, LAYOUT_BY_ID } from '../src/layouts/index.ts';
import type { Face, Layout } from '../src/layouts/index.ts';
import {
  allTriggerKeys, buildComboPickerMatrix, findActiveLayerFace, matchCombos, summarizeCandidateMatches,
} from '../src/combo-picker.ts';

function stubLayout(overrides: Partial<Layout>): Layout {
  return {
    id: 'stub',
    name: 'stub',
    map: new Map(),
    legends: new Map(),
    ...overrides,
  };
}

test('buildComboPickerMatrix: 単キーtrigger + 文字キーを物理キー集合へ展開する', () => {
  const face = faceFromEntries(['j'], 'simultaneous', { r: 'じ' });
  const layout = stubLayout({ faces: [face] });
  const matrix = buildComboPickerMatrix(layout);
  assert.deepEqual(matrix, [{ output: 'じ', group: undefined, keys: ['j', 'r'] }]);
});

test('buildComboPickerMatrix: 複数trigger + 文字キーも同じ表へ展開する', () => {
  const face = faceFromEntries(['h', 'j'], 'simultaneous', { r: 'じゃ' });
  const layout = stubLayout({ faces: [face] });
  const matrix = buildComboPickerMatrix(layout);
  assert.deepEqual(matrix, [{ output: 'じゃ', group: undefined, keys: ['h', 'j', 'r'] }]);
});

test('buildComboPickerMatrix: triggerなしの単打面は候補表へ入れない', () => {
  const face = faceFromEntries([], 'simultaneous', { r: 'し' });
  const layout = stubLayout({ faces: [face] });
  assert.equal(buildComboPickerMatrix(layout).length, 0);
});

test('buildComboPickerMatrix: resolvedComboDefinitionsも同じ表へ入れる', () => {
  const layout = stubLayout({
    resolvedComboDefinitions: [
      { output: 'ye', inputs: ['i', 'e'], keys: ['k', 'd'], group: '拗音拡張' },
    ],
  });
  assert.deepEqual(buildComboPickerMatrix(layout), [
    { output: 'ye', group: '拗音拡張', keys: ['k', 'd'] },
  ]);
});

test('matchCombos: レイヤー出力はtrigger + 文字キーの完全一致でexactになる', () => {
  const face = faceFromEntries(['j'], 'simultaneous', { r: 'じ' });
  const layout = stubLayout({ faces: [face] });
  const result = matchCombos(layout, new Set(['j', 'r']));
  assert.deepEqual(result.exact.map((match) => match.output), ['じ']);
  assert.equal(result.candidates.size, 0);
});

test('matchCombos: 選択集合 + 1キーで完成する出力を相方候補へ返す', () => {
  const face = faceFromEntries(['j'], 'simultaneous', { r: 'じ' });
  const layout = stubLayout({ faces: [face] });
  const result = matchCombos(layout, new Set(['j']));
  assert.deepEqual([...result.candidates.keys()], ['r']);
  assert.equal(result.candidates.get('r')?.[0].output, 'じ');
});

test('matchCombos: 2キー以上先の出力はまだ候補表示しない', () => {
  const face = faceFromEntries(['h', 'j'], 'simultaneous', { r: 'じゃ' });
  const layout = stubLayout({ faces: [face] });
  const result = matchCombos(layout, new Set(['j']));
  assert.equal(result.exact.length, 0);
  assert.equal(result.candidates.size, 0);
});

test('matchCombos: exactがあっても1キー追加で成立する上位出力を候補に残す', () => {
  const dakuon = faceFromEntries(['j'], 'simultaneous', { r: 'じ' });
  const youon = {
    ...faceFromEntries(['h', 'j'], 'simultaneous', { r: 'じゃ' }),
    inputRole: 'composition' as const,
  };
  const layout = stubLayout({ faces: [dakuon, youon] });
  const result = matchCombos(layout, new Set(['j', 'r']));
  assert.deepEqual(result.exact.map((match) => match.output), ['じ']);
  assert.equal(result.candidates.get('h')?.[0].output, 'じゃ');
});

test('matchCombos: resolvedComboDefinitionsもexact/candidateの両方で見る', () => {
  const layout = stubLayout({
    resolvedComboDefinitions: [
      { output: 'ye', inputs: ['i', 'e'], keys: ['k', 'd'], group: '拗音拡張' },
    ],
  });
  const exact = matchCombos(layout, new Set(['k', 'd']));
  assert.equal(exact.exact[0]?.output, 'ye');
  const partial = matchCombos(layout, new Set(['k']));
  assert.equal(partial.candidates.get('d')?.[0].output, 'ye');
});

test('matchCombos: TK音直でi選択後、eの物理キーにyeを表示できる', () => {
  const layout = LAYOUT_BY_ID.get('oonishi-custom-combo');
  assert.ok(layout);
  const iKey = layout.map.get('i')?.[0]?.[0];
  const eKey = layout.map.get('e')?.[0]?.[0];
  assert.ok(iKey);
  assert.ok(eKey);
  const result = matchCombos(layout, new Set([iKey]));
  assert.ok(result.candidates.get(eKey)?.some((match) => match.output === 'ye'));
});

test('matchCombos: 薙刀式で「じ」確定後もh追加の「じゃ」を候補表示する', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18');
  assert.ok(layout);
  const result = matchCombos(layout, new Set(['r', 'j']));
  assert.ok(result.exact.some((match) => match.output === 'じ'));
  assert.ok(result.candidates.get('h')?.some((match) => match.output === 'じゃ'));
});

test('matchCombos: 選択が空なら何も返らない', () => {
  const face = faceFromEntries(['j'], 'simultaneous', { r: 'じ' });
  const layout = stubLayout({ faces: [face] });
  const result = matchCombos(layout, new Set());
  assert.equal(result.exact.length, 0);
  assert.equal(result.candidates.size, 0);
});

test('matchCombos: 選択が定義外キーを含む場合は一致しない', () => {
  const face = faceFromEntries(['j'], 'simultaneous', { r: 'じ' });
  const layout = stubLayout({ faces: [face] });
  const result = matchCombos(layout, new Set(['j', 'z']));
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

test('allTriggerKeys: FaceのtriggerとresolvedComboの物理キーを両方拾う', () => {
  const face = faceFromEntries(['j'], 'simultaneous', { k: 'あ' });
  const layout = stubLayout({
    faces: [face],
    resolvedComboDefinitions: [{ output: 'x', inputs: ['a', 'b'], keys: ['l', ';'] }],
  });
  const keys = allTriggerKeys(layout);
  assert.ok(keys.has('j'));
  assert.ok(keys.has('l'));
  assert.ok(keys.has(';'));
});

test('findActiveLayerFace: 単キーtriggerだけを選択した時はその面を返す', () => {
  const shiftFace = faceFromEntries(['f'], 'prefix', { j: 'あ', k: 'い' });
  const layout = stubLayout({ faces: [shiftFace] });
  assert.equal(findActiveLayerFace(layout, new Set(['f'])), shiftFace);
  assert.equal(findActiveLayerFace(layout, new Set()), undefined);
  assert.equal(findActiveLayerFace(layout, new Set(['z'])), undefined);
  assert.equal(findActiveLayerFace(layout, new Set(['f', 'j'])), undefined);
});

test('findActiveLayerFace: 複数キーtriggerはレイヤーとして扱わない', () => {
  const comboFace = faceFromEntries(['j', 'k'], 'simultaneous', { r: 'あ' });
  const layout = stubLayout({ faces: [comboFace] });
  assert.equal(findActiveLayerFace(layout, new Set(['j', 'k'])), undefined);
});

test('findActiveLayerFace: inputRole===compositionの単キー面も除外する', () => {
  const comboFace: Face = {
    ...faceFromEntries(['f'], 'simultaneous', { j: 'あ' }),
    inputRole: 'composition',
  };
  const layout = stubLayout({ faces: [comboFace] });
  assert.equal(findActiveLayerFace(layout, new Set(['f'])), undefined);
});
