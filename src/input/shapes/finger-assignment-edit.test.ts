import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addKeyToFinger,
  assignColumnFinger,
  assignHomeKey,
  assignKeyFinger,
  assignmentProblems,
  ownerChangeBlock,
  removeKeyFromFinger,
  resetToDefaultAssignment,
  setBaseFinger,
  shapeColumns,
  shapeKeyIds,
  toggleKeyOfFinger,
} from './finger-assignment-edit.ts';
import {
  ALL_FINGERS,
  DEFAULT_FINGER_ASSIGNMENT,
  JIS_FINGER_ASSIGNMENT,
  keyOwners,
  PHYSICAL_SHAPES,
  QWERTY_OPTIMIZED_FINGER_ASSIGNMENT,
  type Finger,
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
  assert.deepEqual(
    unassigned.map((problem) => problem.kind),
    ['unassigned'],
  );
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

test('基本の指の選び直しは担当を変えない。担当していない指を渡すと割り当ては変わらない', () => {
  const owned = addKeyToFinger(BASE, 'q', 'RP');
  const changed = setBaseFinger(owned, 'q', 'RP');
  assert.equal(changed.baseFinger.q, 'RP');
  assert.deepEqual(keyOwners(changed, 'q'), ['LP', 'RP']);
  assert.deepEqual(keyOwners(changed, 'w'), keyOwners(BASE, 'w'));
  assert.equal(setBaseFinger(owned, 'q', 'LP'), owned);
  // 担当していない指は基本の指にできない
  assert.equal(setBaseFinger(BASE, 'q', 'RP'), BASE);
  // 元の割り当ては書き換えない
  assert.equal(BASE.baseFinger.q, 'LP');
  const optimized: FingerAssignment = { ...QWERTY_OPTIMIZED_FINGER_ASSIGNMENT, id: 'finger-q', name: '編集用' };
  const moved = setBaseFinger(optimized, 'k', 'RR');
  assert.equal(moved.baseFinger.k, 'RR');
  assert.deepEqual(keyOwners(moved, 'k'), ['RI', 'RM', 'RR']);
});

test('指に担当するキーを足す・外す。親指以外の最後の担当は外せず、親指も親指以外のキーを担当できる', () => {
  const added = addKeyToFinger(BASE, 'f', 'RT');
  assert.deepEqual(keyOwners(added, 'f'), ['LI', 'RT']);
  assert.equal(added.baseFinger.f, 'LI');
  assert.equal(addKeyToFinger(added, 'f', 'RT'), added);

  const removed = removeKeyFromFinger(added, 'f', 'RT');
  assert.deepEqual(keyOwners(removed, 'f'), ['LI']);
  // 親指以外の最後の担当は、親指が担当していても外せない
  assert.equal(removeKeyFromFinger(added, 'f', 'LI'), added);
  assert.equal(removeKeyFromFinger(BASE, 'f', 'LI'), BASE);
  assert.equal(ownerChangeBlock(BASE, 'f', 'LI'), 'last-non-thumb');
  assert.equal(ownerChangeBlock(added, 'f', 'RT'), undefined);
  // 担当していない指の担当を外しても変わらない
  assert.equal(removeKeyFromFinger(BASE, 'f', 'RI'), BASE);

  const toggled = toggleKeyOfFinger(BASE, 'f', 'RM');
  assert.deepEqual(keyOwners(toggled, 'f'), ['LI', 'RM']);
  assert.deepEqual(keyOwners(toggleKeyOfFinger(toggled, 'f', 'RM'), 'f'), ['LI']);
});

test('基本の指を外すと、同じ手の近い指が新しい基本の指になる。同じ近さなら指の固定の順', () => {
  const withOwners = (owners: Finger[]) => owners.reduce((current, finger) => addKeyToFinger(current, 'f', finger), BASE);
  // fの基本の指は左人差し指。左小指と左中指が残る時は、近い左中指
  const near = removeKeyFromFinger(withOwners(['LP', 'LM']), 'f', 'LI');
  assert.equal(near.baseFinger.f, 'LM');
  assert.deepEqual(keyOwners(near, 'f'), ['LP', 'LM']);
  // 左薬指と右人差し指が残る時は、同じ手の左薬指
  assert.equal(removeKeyFromFinger(withOwners(['LR', 'RI']), 'f', 'LI').baseFinger.f, 'LR');
  // 左中指を基本の指にして外す時、左薬指と左人差し指は同じ近さ。固定の順の左薬指
  const middle = setBaseFinger(withOwners(['LR', 'LM']), 'f', 'LM');
  assert.equal(removeKeyFromFinger(middle, 'f', 'LM').baseFinger.f, 'LR');
  // 親指は新しい基本の指にならない
  const thumb = removeKeyFromFinger(withOwners(['LT', 'LP']), 'f', 'LI');
  assert.equal(thumb.baseFinger.f, 'LP');
  assert.deepEqual(keyOwners(thumb, 'f'), ['LP', 'LT']);
});

test('同じ手の指が残らない時は反対の手の指が新しい基本の指になり、同じ規則で近い指を選ぶ', () => {
  const withOwners = (owners: Finger[]) => owners.reduce((current, finger) => addKeyToFinger(current, 'f', finger), BASE);
  const moved = removeKeyFromFinger(withOwners(['RP', 'RM']), 'f', 'LI');
  assert.equal(moved.baseFinger.f, 'RM');
  assert.deepEqual(keyOwners(moved, 'f'), ['RM', 'RP']);
});

test('基本でない担当を外しても基本の指は変わらない', () => {
  const added = addKeyToFinger(BASE, 'f', 'RM');
  const removed = removeKeyFromFinger(added, 'f', 'RM');
  assert.equal(removed.baseFinger.f, 'LI');
  assert.deepEqual(keyOwners(removed, 'f'), ['LI']);
});

test('基本の指が無いキーは、親指以外の指の担当を足すとその指が基本の指になり、親指の担当だけでは足せない', () => {
  const sparse: FingerAssignment = {
    ...BASE,
    baseFinger: Object.fromEntries(Object.entries(BASE.baseFinger).filter(([id]) => id !== 'z')),
    fingerKeys: Object.fromEntries(
      ALL_FINGERS.map((finger) => [finger, BASE.fingerKeys[finger].filter((id) => id !== 'z')]),
    ) as unknown as FingerAssignment['fingerKeys'],
  };
  assert.deepEqual(keyOwners(sparse, 'z'), []);
  assert.equal(addKeyToFinger(sparse, 'z', 'RT'), sparse);
  assert.equal(ownerChangeBlock(sparse, 'z', 'RT'), 'thumb-needs-base');
  assert.equal(ownerChangeBlock(sparse, 'z', 'RM'), undefined);
  const added = addKeyToFinger(sparse, 'z', 'RM');
  assert.equal(added.baseFinger.z, 'RM');
  assert.deepEqual(keyOwners(added, 'z'), ['RM']);
});

test('ホームキーを担当から外すと点検で見つかり、その指の担当に戻すか別のキーをホームにすると消える', () => {
  const optimized: FingerAssignment = { ...QWERTY_OPTIMIZED_FINGER_ASSIGNMENT, id: 'finger-q', name: '編集用' };
  // jの右人差し指の担当を外す: 基本の指は残った担当から決まり、右人差し指のホームキーが右人差し指の担当でなくなる
  const owned = addKeyToFinger(optimized, 'j', 'RM');
  const broken = removeKeyFromFinger(owned, 'j', 'RI');
  assert.deepEqual(assignmentProblems(broken, ANSI), [{ kind: 'home-other-finger', finger: 'RI', keyId: 'j', keyFinger: 'RM' }]);
  assert.deepEqual(assignmentProblems(addKeyToFinger(broken, 'j', 'RI'), ANSI), []);
  assert.deepEqual(assignmentProblems(assignHomeKey(broken, 'RI', 'h'), ANSI), []);
});
