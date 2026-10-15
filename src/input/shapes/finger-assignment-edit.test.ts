import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assignColumnFinger,
  assignHomeKey,
  assignKeyFinger,
  assignmentProblems,
  resetToDefaultAssignment,
  shapeColumns,
  shapeKeyIds,
} from './finger-assignment-edit.ts';
import {
  DEFAULT_FINGER_ASSIGNMENT,
  JIS_FINGER_ASSIGNMENT,
  keyOwners,
  PHYSICAL_SHAPES,
  QWERTY_OPTIMIZED_FINGER_ASSIGNMENT,
  type FingerAssignment,
} from './geometry.ts';

const ANSI = PHYSICAL_SHAPES['row-staggered'];
const JIS = PHYSICAL_SHAPES['jis-row-staggered'];
const BASE: FingerAssignment = { ...DEFAULT_FINGER_ASSIGNMENT, id: 'finger-a', name: '編集用' };

test('物理配列の列は、上の段から各段の同じ位置のキーを集める', () => {
  const columns = shapeColumns(ANSI);
  assert.equal(columns.length, 12);
  assert.deepEqual(columns[0], ['1', 'q', 'a', 'z']);
  // 下段は10キー、ホーム段は11キーなので、11列目は上の3段になる
  assert.deepEqual(columns[10], ['-', '[', "'"]);
  assert.deepEqual(columns[11], ['=', ']']);
  assert.equal(shapeKeyIds(ANSI).length, 12 + 12 + 11 + 10);
  assert.equal(shapeColumns(JIS).length, 13);
});

test('キー単位の割り当ては元を変えず、同じ指なら同じ参照を返す', () => {
  const changed = assignKeyFinger(BASE, 'b', 'RI');
  assert.equal(changed.baseFinger.b, 'RI');
  assert.equal(BASE.baseFinger.b, 'LI');
  assert.equal(assignKeyFinger(BASE, 'b', 'LI'), BASE);
});

test('列の一括は、その列のキーだけを書き換える', () => {
  const changed = assignColumnFinger(BASE, ANSI, 0, 'LR');
  for (const id of ['1', 'q', 'a', 'z']) assert.equal(changed.baseFinger[id], 'LR');
  assert.equal(changed.baseFinger.w, BASE.baseFinger.w);
  assert.equal(assignColumnFinger(BASE, ANSI, 0, 'LP'), BASE);
  assert.equal(assignColumnFinger(BASE, ANSI, 99, 'LP'), BASE);
});

test('選んだ物理配列に無いキーの割り当ては、キー単位・列単位の編集で残る', () => {
  // JISの13列目のキー（r0c12）はANSIに無い
  const jisBased: FingerAssignment = { ...JIS_FINGER_ASSIGNMENT, id: 'finger-j', name: 'JIS由来' };
  assert.equal(jisBased.baseFinger.r0c12, 'RP');
  const edited = assignColumnFinger(assignKeyFinger(jisBased, 'q', 'LR'), ANSI, 0, 'LM');
  assert.equal(edited.baseFinger.r0c12, 'RP');
  assert.equal(edited.baseFinger.q, 'LM');
});

test('ホームキーの変更は、その指だけを書き換える', () => {
  const changed = assignHomeKey(BASE, 'RI', 'u');
  assert.equal(changed.homeKey.RI, 'u');
  assert.equal(changed.homeKey.LI, BASE.homeKey.LI);
  assert.equal(assignHomeKey(BASE, 'RI', BASE.homeKey.RI), BASE);
});

test('既定へ戻すと、キーとホームキーが既定の中身に置き換わり、既定に無いキーも消える。idと名前は残る', () => {
  const edited = assignKeyFinger(assignKeyFinger(BASE, 'b', 'RI'), 'r9c20', 'RP');
  const ansi = resetToDefaultAssignment(edited, DEFAULT_FINGER_ASSIGNMENT);
  assert.deepEqual(ansi.baseFinger, DEFAULT_FINGER_ASSIGNMENT.baseFinger);
  assert.deepEqual(ansi.fingerKeys, DEFAULT_FINGER_ASSIGNMENT.fingerKeys);
  assert.deepEqual(ansi.homeKey, DEFAULT_FINGER_ASSIGNMENT.homeKey);
  assert.equal(ansi.baseFinger.r9c20, undefined);
  assert.deepEqual([ansi.id, ansi.name], ['finger-a', '編集用']);
  const jis = resetToDefaultAssignment(edited, JIS_FINGER_ASSIGNMENT);
  assert.deepEqual(jis.baseFinger, JIS_FINGER_ASSIGNMENT.baseFinger);
  assert.deepEqual(jis.homeKey, JIS_FINGER_ASSIGNMENT.homeKey);
});

test('点検: 既定の割り当ては、対応する物理配列で問題が無い', () => {
  assert.deepEqual(assignmentProblems(DEFAULT_FINGER_ASSIGNMENT, ANSI), []);
  assert.deepEqual(assignmentProblems(JIS_FINGER_ASSIGNMENT, JIS), []);
});

test('点検: 指の決まっていないキー・物理配列に無いホームキー・別の指のホームキーを見つける', () => {
  // ANSI由来の割り当てをJISの物理配列で使うと、JISにだけあるキーに指が無い
  const unassigned = assignmentProblems(DEFAULT_FINGER_ASSIGNMENT, JIS);
  assert.deepEqual(unassigned.map((problem) => problem.kind), ['unassigned']);
  assert.deepEqual(unassigned[0], { kind: 'unassigned', keyIds: ['r0c12', 'r2c11', 'r3c10'] });

  const missingHome = assignHomeKey(BASE, 'LP', 'r9c9');
  assert.deepEqual(assignmentProblems(missingHome, ANSI), [{ kind: 'home-missing', finger: 'LP', keyId: 'r9c9' }]);

  const otherFinger = assignKeyFinger(BASE, 'f', 'RI');
  assert.deepEqual(assignmentProblems(otherFinger, ANSI), [{ kind: 'home-other-finger', finger: 'LI', keyId: 'f', keyFinger: 'RI' }]);
});

test('キーの指を変えると、そのキーの基本の指がその指になり、追加の担当は外れる。編集していないキーの追加の担当は残る', () => {
  const base: FingerAssignment = { ...QWERTY_OPTIMIZED_FINGER_ASSIGNMENT, id: 'finger-q', name: '編集用' };
  assert.deepEqual(keyOwners(base, 'k'), ['RI', 'RM', 'RR']);
  const changed = assignKeyFinger(base, 'k', 'RP');
  assert.equal(changed.baseFinger.k, 'RP');
  assert.deepEqual(keyOwners(changed, 'k'), ['RP']);
  // 別のキーの追加の担当は保たれる
  assert.deepEqual(keyOwners(changed, 'i'), keyOwners(base, 'i'));
  assert.deepEqual(keyOwners(changed, 'n'), keyOwners(base, 'n'));
  // 列の一括でも、その列のキーだけが1本の担当になる
  const column = assignColumnFinger(base, ANSI, 5, 'LI');
  assert.deepEqual(keyOwners(column, 'y'), ['LI']);
  assert.deepEqual(keyOwners(column, 'u'), keyOwners(base, 'u'));
  // 担当から外したホームキーは、今のhome-other-fingerの点検で見つかる
  const homeMoved = assignKeyFinger(base, 'j', 'RM');
  assert.deepEqual(assignmentProblems(homeMoved, ANSI), [{ kind: 'home-other-finger', finger: 'RI', keyId: 'j', keyFinger: 'RM' }]);
});
