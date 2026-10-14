import assert from 'node:assert/strict';
import test from 'node:test';
import type { UserLayout } from '#input/layouts/user-layouts.ts';
import type { UserRomajiRule } from '#input/romaji/rules.ts';
import { DEFAULT_FINGER_ASSIGNMENT } from '#input/shapes/geometry.ts';
import { userFingerAssignmentRows, userLayoutRows, userRomajiRuleRows } from './user-asset-rows.ts';

const ROWS: UserLayout['rows'] = ['', 'qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'];
const RULE: UserRomajiRule = { id: 'rule-a', name: '自作の規則', base: 'kunrei', overrides: {}, generateSokuon: true };

test('配列の行: 推奨の規則の名前を出し、見つからない規則・組み込みの規則・直接入力を言い分ける', () => {
  const rows = userLayoutRows(
    [
      { id: 'a', name: 'A', rows: ROWS, romaji: 'rule-a' },
      { id: 'b', name: 'B', rows: ROWS, romaji: 'rule-gone' },
      { id: 'c', name: 'C', rows: ROWS, romaji: 'azik' },
      { id: 'd', name: 'D', rows: ROWS, romaji: 'rule-gone', direct: true },
    ],
    [RULE],
  );
  assert.equal(rows[0]!.detail, '推奨のローマ字規則: 自作の規則');
  assert.match(rows[1]!.detail!, /見つからないため、全体の値の規則で打ちます/);
  assert.match(rows[2]!.detail!, /^推奨のローマ字規則: AZIK/);
  assert.equal(rows[3]!.detail, 'ローマ字を経ずに直接打つ配列');
});

test('規則の行: 推奨に使っている配列を挙げる。使われていなければ補足なし', () => {
  const layouts: UserLayout[] = [
    { id: 'a', name: 'A', rows: ROWS, romaji: 'rule-a' },
    { id: 'd', name: 'D', rows: ROWS, romaji: 'rule-a', direct: true },
  ];
  assert.match(userRomajiRuleRows(layouts, [RULE])[0]!.detail!, /^推奨に使っている配列: A。/);
  assert.equal(userRomajiRuleRows([], [RULE])[0]!.detail, undefined);
});

test('指の割り当ての行: 名前と、削除した時に既定の割り当てで測る旨を出す', () => {
  const rows = userFingerAssignmentRows([{ ...DEFAULT_FINGER_ASSIGNMENT, id: 'finger-a', name: '自作の運指' }]);
  assert.deepEqual(rows.map((row) => [row.id, row.name]), [['finger-a', '自作の運指']]);
  assert.match(rows[0]!.detail!, /既定の割り当てで測ります/);
});
