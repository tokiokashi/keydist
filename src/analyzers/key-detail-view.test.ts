import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID, withRomaji } from '#input/layouts/index.ts';
import { tableForRule } from '#input/romaji/rules.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { computeKeyDetails, mergeKeyDetails, type KeyDetail } from '#interpretation/key-detail.ts';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import {
  distanceRows,
  faceRows,
  keyDetailTooltip,
  keyName,
  keyPatternGroups,
  originRows,
  rankedCounts,
  roleSetLabel,
  shareText,
} from './key-detail-view.ts';

const geometry = buildGeometry('row-staggered');

function detailsFor(layoutId: string, text: string, rule?: string) {
  const base = LAYOUT_BY_ID.get(layoutId);
  assert.ok(base);
  const layout = rule ? withRomaji(base, tableForRule(rule)) : base;
  return computeKeyDetails(generateTrace(text, layout, geometry, DEFAULT_TRACE_POLICY), geometry);
}

test('刻印が無い、または物理キーの名前と同じ時は、物理キーの名前だけを出す', () => {
  assert.equal(keyName('q', undefined), 'Q');
  assert.equal(keyName('q', ''), 'Q');
  // 大文字と小文字は区別しない
  assert.equal(keyName('q', 'q'), 'Q');
  assert.equal(keyName('q', 'Q'), 'Q');
  assert.equal(keyName('shift-r', '右Shift'), '右Shift');
});

test('刻印が物理キーの名前と違う時は、刻印を先に出して物理キーの名前を添える', () => {
  assert.equal(keyName('q', 'あ'), 'あ（Q）');
  assert.equal(keyName('thumb-l', '変換'), '変換（左親指）');
  assert.equal(keyName('shift-l', 'Shift'), 'Shift（左Shift）');
});

test('複数の刻印を結合したものも、同じ規則で物理キーの名前と比べる', () => {
  assert.equal(keyName('a', 'a / A'), 'A');
  assert.equal(keyName('a', 'あ / ぁ'), 'あ / ぁ（A）');
  assert.equal(keyName('a', 'a / ぁ'), 'a / ぁ（A）');
});

test('物理配列の規格に応じた物理キーの名前を出す', () => {
  assert.equal(keyName('backquote', undefined, 'jis'), '半角/全角');
  assert.equal(keyName('backquote', undefined, 'ansi'), '`');
  assert.equal(keyName('[', 'ろ', 'jis'), 'ろ（@）');
});

test('押し方の表示名は、役の組を「・」でつなぐ', () => {
  assert.equal(roleSetLabel('output'), '出力');
  assert.equal(roleSetLabel('trigger'), 'トリガー');
  assert.equal(roleSetLabel('output+held-trigger'), '出力・押したままのトリガー');
  assert.equal(roleSetLabel('none'), 'その他');
});

test('回数の並べ替えは、降順で、同じ回数ならキーの昇順', () => {
  const ranked = rankedCounts(new Map([['う', 2], ['あ', 2], ['い', 5]]));
  assert.deepEqual(ranked, [['い', 5], ['あ', 2], ['う', 2]]);
  assert.deepEqual(rankedCounts(new Map([[3, 1], [1, 1]])), [[1, 1], [3, 1]]);
});

test('割合は小数第1位まで。母数が0なら出さない', () => {
  assert.equal(shareText(1, 3), '33.3%');
  assert.equal(shareText(0, 0), '');
});

test('ツールチップ: 押下が無いキーは名前と0打だけ', () => {
  assert.equal(keyDetailTooltip('E', undefined), 'E: 0打');
  const details = detailsFor('qwerty', 'aa', 'kunrei');
  assert.equal(keyDetailTooltip('Z', details.merged.get('z')), 'Z: 0打');
});

test('ツールチップ: 押下数・押し方の内訳・前の文字の上位を、回数を添えて出す', () => {
  // 「かかか」は同じキーdを3回。2回目と3回目の前の文字が「か」、先頭は前の文字が無い
  const details = detailsFor('shingeta', 'かかか');
  assert.equal(
    keyDetailTooltip('D', details.merged.get('d')),
    'D: 3打\n押し方: 出力 3打\n前の文字: か 2打',
  );
});

test('ツールチップ: 前の文字は上位3件までで、残りは「ほか」にまとめる', () => {
  // aの前の文字は、あ（5回）・か・さ・た・な（各1回）。先頭のaだけ前の文字が無い
  const details = detailsFor('qwerty', 'あかあさあたあなあか', 'kunrei');
  const detail = details.merged.get('a');
  assert.ok(detail);
  assert.equal(detail.presses, 10);
  assert.equal(detail.noPreviousChar, 1);
  assert.equal(
    keyDetailTooltip('A', detail),
    'A: 10打\n押し方: 出力 10打\n前の文字: あ 5打・か 1打・さ 1打・ほか 2打',
  );
});

test('同じキーのツールチップは、合算した面でも面ごとでも、その範囲の値だけを出す', () => {
  const details = detailsFor('shingeta', 'かぱ');
  const single = details.faces.get('single')!.get('d')!;
  const shift = details.faces.get('layer:中指シフト')!.get('d')!;
  assert.equal(keyDetailTooltip('D', single), 'D: 1打\n押し方: 出力 1打');
  assert.equal(keyDetailTooltip('D', shift), 'D: 1打\n押し方: トリガー 1打\n前の文字: か 1打');
  const both = mergeKeyDetails([single, shift]);
  assert.equal(keyDetailTooltip('D', both), 'D: 2打\n押し方: 出力 1打・トリガー 1打\n前の文字: か 1打');
  assert.equal(keyDetailTooltip('D', details.merged.get('d')), keyDetailTooltip('D', both));
});

test('移動の起点: 回数の多い順で、物理キーに当たらない位置は座標で示す', () => {
  const detail: KeyDetail = {
    presses: 6,
    roles: new Map(),
    previousChars: new Map(),
    noPreviousChar: 0,
    origins: [
      { x: 1.5, y: 2, keyIds: [], fromPrevious: 1, fromHome: 0 },
      { x: 0, y: 2, keyIds: ['a'], fromPrevious: 1, fromHome: 3 },
      { x: 1, y: 2, keyIds: ['s', 'x'], fromPrevious: 1, fromHome: 0 },
    ],
    distances: new Map(),
  };
  assert.deepEqual(originRows(detail.origins), [
    { label: 'A', fromPrevious: 1, fromHome: 3, total: 4 },
    { label: 'S / X', fromPrevious: 1, fromHome: 0, total: 1 },
    { label: 'キーのない位置（1.5, 2）', fromPrevious: 1, fromHome: 0, total: 1 },
  ]);
});

test('距離の分布は、距離の短い順', () => {
  assert.deepEqual(distanceRows(new Map([[1.2, 1], [0, 4], [0.5, 2]])), [
    { distance: 0, count: 4 },
    { distance: 0.5, count: 2 },
    { distance: 1.2, count: 1 },
  ]);
});

test('面ごとの内訳: キーが押された面だけを、Traceに現れた順に出す', () => {
  const details = detailsFor('shingeta', 'かぱ');
  const rows = faceRows(details, 'd', (id) => `<${id}>`);
  assert.deepEqual(rows.map((row) => [row.faceId, row.label, row.detail.presses]), [
    ['single', '<single>', 1],
    ['layer:中指シフト', '<layer:中指シフト>', 1],
  ]);
  assert.deepEqual(faceRows(details, 'q', (id) => id), []);
});

test('入力パターン: そのキーを含むパターンを面ごとに分け、トリガーのガイドを添える', () => {
  const layout = LAYOUT_BY_ID.get('shingeta')!;
  const groups = keyPatternGroups(layout, 'd', (id) => id);
  assert.deepEqual(groups.map((group) => group.faceId), ['single', 'layer:中指シフト', 'layer:薬指シフト']);
  const [single, middle, ring] = groups;
  assert.deepEqual(single.rows, [{ keyNames: ['D'], output: 'か', group: undefined, ordered: false }]);
  assert.deepEqual(single.triggers, []);
  // dは中指シフトのトリガーの1つ。中指シフトのパターンは、dまたはkと文字キーの組
  assert.equal(middle.selfTrigger, true);
  assert.deepEqual(middle.triggers.map((trigger) => trigger.keyNames), [['K'], ['D']]);
  assert.ok(middle.rows.length > 1);
  assert.ok(middle.rows.every((row) => row.keyNames.includes('D') || row.keyNames.includes('K')));
  // 薬指シフトでは、dは出力側のキー。トリガーはl
  assert.equal(ring.selfTrigger, false);
  assert.deepEqual(ring.triggers.map((trigger) => trigger.keyNames), [['L']]);
  assert.deepEqual(ring.rows.map((row) => row.keyNames), [['D', 'L']]);
});

test('入力パターン: 押したまま打つトリガーを示し、コンボの面はトリガーを持たない', () => {
  const qwerty = keyPatternGroups(LAYOUT_BY_ID.get('qwerty')!, 'a', (id) => id);
  assert.deepEqual(qwerty.find((group) => group.faceId === 'layer:Shift')?.triggers, [
    { keyNames: ['左Shift'], held: true },
    { keyNames: ['右Shift'], held: true },
  ]);
  const kawasemi = keyPatternGroups(LAYOUT_BY_ID.get('kawasemi-plus')!, 'l', (id) => id);
  const combo = kawasemi.find((group) => group.faceId === 'combo');
  assert.ok(combo);
  assert.deepEqual(combo.triggers, []);
  assert.equal(combo.selfTrigger, false);
  assert.ok(combo.rows.length > 1);
  assert.deepEqual(keyPatternGroups(LAYOUT_BY_ID.get('qwerty')!, 'no-such-key', (id) => id), []);
});
