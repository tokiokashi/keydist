import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faceFromEntries } from '../src/layouts/index.ts';
import type { Layout } from '../src/layouts/index.ts';
import { allTriggerKeys, matchCombos, summarizeCandidateMatches } from '../src/combo-picker.ts';

function stubLayout(overrides: Partial<Layout>): Layout {
  return {
    id: 'stub',
    name: 'stub',
    map: new Map(),
    legends: new Map(),
    ...overrides,
  };
}

test('matchCombos: 完全一致でexactに出力が入る', () => {
  const face = faceFromEntries(['j', 'k'], 'simultaneous', { j: 'あ', k: 'い' });
  const layout = stubLayout({ faces: [face] });
  const result = matchCombos(layout, new Set(['j', 'k']));
  assert.equal(result.exact.length, 1);
  assert.equal(result.exact[0].output, 'あ / い');
  assert.equal(result.candidates.size, 0);
});

test('matchCombos: 部分一致で相方候補が返る', () => {
  const face = faceFromEntries(['j', 'k'], 'simultaneous', { j: 'あ' });
  const layout = stubLayout({ faces: [face] });
  const result = matchCombos(layout, new Set(['j']));
  assert.equal(result.exact.length, 0);
  assert.deepEqual([...result.candidates.keys()], ['k']);
  assert.equal(result.candidates.get('k')?.[0].output, 'あ');
});

test('matchCombos: 選択が空なら何も返らない', () => {
  const face = faceFromEntries(['j', 'k'], 'simultaneous', { j: 'あ' });
  const layout = stubLayout({ faces: [face] });
  const result = matchCombos(layout, new Set());
  assert.equal(result.exact.length, 0);
  assert.equal(result.candidates.size, 0);
});

test('matchCombos: 選択がコンボのtriggerを超えて含む場合は一致しない', () => {
  const face = faceFromEntries(['j', 'k'], 'simultaneous', { j: 'あ' });
  const layout = stubLayout({ faces: [face] });
  const result = matchCombos(layout, new Set(['j', 'l']));
  assert.equal(result.exact.length, 0);
  assert.equal(result.candidates.size, 0);
});

test('matchCombos: 単キーのFaceはコンボ候補に数えない（レイヤートリガーとの混同を避ける）', () => {
  const face = faceFromEntries(['j'], 'simultaneous', { k: 'あ' });
  const layout = stubLayout({ faces: [face] });
  const result = matchCombos(layout, new Set(['j']));
  assert.equal(result.exact.length, 0);
  assert.equal(result.candidates.size, 0);
});

test('matchCombos: resolvedComboDefinitions（規則化コンボ）も見る', () => {
  const layout = stubLayout({
    resolvedComboDefinitions: [
      { output: 'yaku', inputs: ['y', 'a', 'k', 'u'], keys: ['j', 'k'], group: '拗音拡張' },
    ],
  });
  const exact = matchCombos(layout, new Set(['j', 'k']));
  assert.equal(exact.exact[0]?.output, 'yaku');
  const partial = matchCombos(layout, new Set(['j']));
  assert.equal(partial.candidates.get('k')?.[0].output, 'yaku');
});

test('summarizeCandidateMatches: 閾値以下は出力を列挙する', () => {
  const matches = [
    { output: 'あ', keys: ['j'] },
    { output: 'い', keys: ['j'] },
  ];
  assert.equal(summarizeCandidateMatches(matches), 'あ / い');
});

test('summarizeCandidateMatches: 閾値を超えたらグループ件数へ畳む', () => {
  const matches = Array.from({ length: 6 }, (_, i) => ({ output: `out${i}`, group: '入声拡張', keys: ['j'] }));
  assert.equal(summarizeCandidateMatches(matches), '入声拡張 ×6');
});

test('summarizeCandidateMatches: グループを持たないコンボは「その他」へ集約する', () => {
  const matches = Array.from({ length: 5 }, (_, i) => ({ output: `out${i}`, keys: ['j'] }));
  assert.equal(summarizeCandidateMatches(matches), 'その他 ×5');
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
