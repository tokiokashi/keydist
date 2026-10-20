import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { AnalysisTarget } from '#input/setup/index.ts';
import type { ReadingWord } from '#input/text/reading.ts';
import type { PaneText } from './reading-evaluation.ts';
import { createStrokeCounter, orderReadingWords } from './reading-words.ts';
import type { PaneCatalog } from './resolve-pane-input.ts';

const word = (surface: string, dictionaryReadings: readonly string[], count = 1): ReadingWord => ({ surface, count, dictionaryReadings });

test('読みが複数ある語を、配列ごとの「最大−最小」のうち最大の大きい順に並べ、残りは出現の順に続ける', () => {
  // 2つの配列の打鍵数を、読みごとに決めた値で与える（配列1は差が小さく、配列2で差が大きい読みがある）
  const counts: Record<string, readonly number[]> = { あ: [3, 3], い: [4, 9], う: [5, 5], え: [5, 6], お: [2, 2] };
  const ordered = orderReadingWords(
    [word('甲', ['あ']), word('乙', []), word('丙', ['お']), word('丁', ['う'])],
    { 甲: ['あ', 'い'], 乙: ['う', 'え'], 丁: ['う', 'お'] },
    (reading) => counts[reading]!,
  );
  // 甲: あ[3,3]・い[4,9] → 配列2の差6。乙: う[5,5]・え[5,6] → 1。丁: う[5,5]・お[2,2] → 3。丙は候補が1つ
  assert.deepEqual(
    ordered.map((entry) => [entry.word.surface, entry.spread]),
    [
      ['甲', 6],
      ['丁', 3],
      ['乙', 1],
      ['丙', 0],
    ],
  );
});

test('候補は表の読みに辞書の読みを足し、同じ読みを二重に出さない', () => {
  const [entry] = orderReadingWords([word('日本', ['にほん', 'にぽん'])], { 日本: ['にほん', 'にっぽん'] }, () => [1]);
  assert.deepEqual(entry!.candidates, ['にほん', 'にっぽん', 'にぽん']);
});

test('変わり方が同じ語は出現の順のまま', () => {
  const ordered = orderReadingWords([word('甲', []), word('乙', [])], { 甲: ['あ', 'い'], 乙: ['あ', 'い'] }, (reading) =>
    reading === 'あ' ? [1] : [2],
  );
  assert.deepEqual(
    ordered.map((entry) => entry.word.surface),
    ['甲', '乙'],
  );
});

const CATALOG: PaneCatalog = {
  setupCatalog: {
    layouts: LAYOUT_BY_ID,
    shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
  },
  userLayouts: new Map(),
};

const TEXT: PaneText = {
  ref: { kind: 'user', id: 't' },
  name: 't',
  text: '今日',
  language: 'ja',
  languageOverride: undefined,
  isBuiltin: false,
  readingCorrections: {},
};

test('createStrokeCounter: 読みを単独のテキストとして、比べている配列ごとの打鍵数を数える', () => {
  const targets: AnalysisTarget[] = [
    { kind: 'layout', layoutId: 'qwerty' },
    { kind: 'layout', layoutId: 'nicola' },
    // 同じ対象は1度だけ数える
    { kind: 'layout', layoutId: 'qwerty' },
    // 配列が見つからない対象は数えない
    { kind: 'layout', layoutId: 'no-such-layout' },
  ];
  const count = createStrokeCounter(targets, new Map(), CATALOG, EMPTY_SETTINGS_OVERRIDES, TEXT);
  // ローマ字入力のQWERTYは綴りの長さ（nihonnの6打）、NICOLAはかな1文字1打で数える
  assert.deepEqual(count('にほん'), [6, 3]);
  const longer = count('にっぽん');
  assert.equal(longer.length, 2);
  assert.ok(longer[0]! > 6, 'QWERTYでは促音の分だけ打鍵が増える');
});
