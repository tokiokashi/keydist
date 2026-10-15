import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assignKeyFinger } from './finger-assignment-edit.ts';
import { ALL_FINGERS, DEFAULT_FINGER_ASSIGNMENT, JIS_FINGER_ASSIGNMENT, QWERTY_OPTIMIZED_FINGER_ASSIGNMENT, type FingerAssignment } from './geometry.ts';
import {
  createUserFingerAssignment,
  deleteUserFingerAssignment,
  duplicateUserFingerAssignment,
  newId,
  renameUserFingerAssignment,
  updateUserFingerAssignment,
  USER_FINGER_ASSIGNMENTS_CODEC,
  USER_FINGER_ASSIGNMENT_ID_PREFIX,
} from './user-finger-assignments.ts';

const CUSTOM: FingerAssignment = {
  ...DEFAULT_FINGER_ASSIGNMENT,
  id: 'finger-abc123',
  name: '自作運指',
};

test('newId: 組み込みと衝突しない名前空間のidを発行する', () => {
  assert.ok(newId().startsWith(USER_FINGER_ASSIGNMENT_ID_PREFIX));
  assert.notEqual(newId(), newId());
});

test('codec: encode→decodeで往復できる', () => {
  const decoded = USER_FINGER_ASSIGNMENTS_CODEC.decode(USER_FINGER_ASSIGNMENTS_CODEC.encode([CUSTOM]));
  assert.equal(decoded.ok, true);
  if (decoded.ok) {
    assert.deepEqual(decoded.value, [CUSTOM]);
    assert.deepEqual(decoded.diagnostics, []);
  }
});

test('codec: 未来バージョンの資産は黙って切り捨てず失敗として報告する', () => {
  const result = USER_FINGER_ASSIGNMENTS_CODEC.decode({ version: 999, assignments: [] });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason.kind, 'future-version');
});

test('codec: assignmentsが無ければ空の手持ちとして読む', () => {
  const result = USER_FINGER_ASSIGNMENTS_CODEC.decode({ version: 1 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, []);
    assert.deepEqual(result.diagnostics, []);
  }
});

test('codec: トップレベルがオブジェクトでなければnot-an-objectで失敗させる', () => {
  const result = USER_FINGER_ASSIGNMENTS_CODEC.decode([]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason.kind, 'not-an-object');
});

test('codec: idが組み込みの名前空間（finger-接頭辞以外）の要素は捨てて診断を積む', () => {
  const broken = { ...CUSTOM, id: 'default' }; // 組み込みidと衝突する名前は自作として不正
  const result = USER_FINGER_ASSIGNMENTS_CODEC.decode({ version: 1, assignments: [broken, CUSTOM] });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, [CUSTOM]);
    assert.equal(result.diagnostics.length, 1);
  }
});

test('codec: id重複は後発を捨てて診断を積む', () => {
  const duplicate = { ...CUSTOM, name: '別名だが同id' };
  const result = USER_FINGER_ASSIGNMENTS_CODEC.decode({ version: 1, assignments: [CUSTOM, duplicate] });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, [CUSTOM]);
    assert.equal(result.diagnostics.length, 1);
  }
});

test('codec: keyFingerの予約名キー（JSON由来の__proto__等）は捨てて診断を積む', () => {
  // JSON.parseはリテラルなown property "__proto__"を作れる。valibotのrecordは黙って落とすので、
  // 落ちた事実が診断に出ることを確かめる
  const raw = JSON.parse(
    `{"version":1,"assignments":[${JSON.stringify(CUSTOM).replace('"baseFinger":{', '"baseFinger":{"__proto__":"LP","constructor":"LP",')}]}`,
  );
  const result = USER_FINGER_ASSIGNMENTS_CODEC.decode(raw);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, [CUSTOM]);
    assert.deepEqual(
      result.diagnostics.map((d) => d.path).sort(),
      ['assignments[0].baseFinger.__proto__', 'assignments[0].baseFinger.constructor'],
    );
    assert.equal(Object.getPrototypeOf(result.value[0]!.baseFinger), Object.prototype);
  }
});

test('createUserFingerAssignment: baseの中身を引き継ぎ、idだけ発行し直す', () => {
  const created = createUserFingerAssignment([], () => 'finger-new', DEFAULT_FINGER_ASSIGNMENT, 'マイ運指');
  assert.equal(created.length, 1);
  assert.equal(created[0]!.id, 'finger-new');
  assert.equal(created[0]!.name, 'マイ運指');
  assert.deepEqual(created[0]!.baseFinger, DEFAULT_FINGER_ASSIGNMENT.baseFinger);
  assert.deepEqual(created[0]!.fingerKeys, DEFAULT_FINGER_ASSIGNMENT.fingerKeys);
});

test('createUserFingerAssignment: name省略時は「◯◯のコピー」になる', () => {
  const created = createUserFingerAssignment([], () => 'finger-new', JIS_FINGER_ASSIGNMENT);
  assert.equal(created[0]!.name, `${JIS_FINGER_ASSIGNMENT.name}のコピー`);
});

test('duplicateUserFingerAssignment: 複製元が存在しなければ同一参照を返す（no-op判定用）', () => {
  const assignments = [CUSTOM];
  assert.equal(duplicateUserFingerAssignment(assignments, 'no-such-id', () => 'finger-x'), assignments);
});

test('duplicateUserFingerAssignment: 複製元が存在すれば新しいidで複製する', () => {
  const duplicated = duplicateUserFingerAssignment([CUSTOM], CUSTOM.id, () => 'finger-dup');
  assert.equal(duplicated.length, 2);
  assert.equal(duplicated[1]!.id, 'finger-dup');
  assert.equal(duplicated[1]!.name, `${CUSTOM.name}のコピー`);
});

test('deleteUserFingerAssignment: 存在しないidの削除は同一参照を返す', () => {
  const assignments = [CUSTOM];
  assert.equal(deleteUserFingerAssignment(assignments, 'no-such-id'), assignments);
});

test('deleteUserFingerAssignment: 実在するidは取り除く', () => {
  const result = deleteUserFingerAssignment([CUSTOM], CUSTOM.id);
  assert.deepEqual(result, []);
});

test('renameUserFingerAssignment: 既に同じ名前なら同一参照を返す', () => {
  const assignments = [CUSTOM];
  assert.equal(renameUserFingerAssignment(assignments, CUSTOM.id, CUSTOM.name), assignments);
});

test('renameUserFingerAssignment: 名前を変更する', () => {
  const result = renameUserFingerAssignment([CUSTOM], CUSTOM.id, '別名');
  assert.equal(result[0]!.name, '別名');
});

test('decode: assignmentsが配列でない値（文字列・オブジェクト・数値・null）なら診断を1件積んで空にする', () => {
  for (const assignments of ['not-an-array', { a: 1 }, 42, null]) {
    const result = USER_FINGER_ASSIGNMENTS_CODEC.decode({ version: 1, assignments });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.value, []);
      assert.equal(result.diagnostics.length, 1);
      assert.equal(result.diagnostics[0].path, 'assignments');
    }
  }
});

test('decode: assignmentsが無い（undefined）時は診断を積まない', () => {
  const result = USER_FINGER_ASSIGNMENTS_CODEC.decode({ version: 1 });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.diagnostics, []);
});

test('updateUserFingerAssignment: 中身だけを書き換え、idと名前は変えない。対象なし・同じ中身は同じ配列を返す', () => {
  const list = [CUSTOM];
  const content = {
    ...assignKeyFinger(CUSTOM, 'q', 'RP'),
    homeKey: { ...CUSTOM.homeKey, LP: 'z' },
  };
  const updated = updateUserFingerAssignment(list, CUSTOM.id, content);
  assert.notEqual(updated, list);
  assert.equal(updated[0]!.baseFinger.q, 'RP');
  assert.equal(updated[0]!.fingerKeys.RP.includes('q'), true);
  assert.equal(updated[0]!.homeKey.LP, 'z');
  assert.deepEqual([updated[0]!.id, updated[0]!.name], [CUSTOM.id, CUSTOM.name]);
  assert.equal(CUSTOM.baseFinger.q, 'LP');
  assert.equal(updateUserFingerAssignment(list, 'no-such-id', content), list);
  assert.equal(updateUserFingerAssignment(list, CUSTOM.id, structuredClone(CUSTOM)), list);
  // 追加の担当だけが変わる変更も変更として扱う
  const withExtra = { ...CUSTOM, fingerKeys: { ...CUSTOM.fingerKeys, RM: [...CUSTOM.fingerKeys.RM, 'q'] } };
  assert.notEqual(updateUserFingerAssignment(list, CUSTOM.id, withExtra), list);
  // キーが減る変更（既定へ戻す操作で起きる）も変更として扱う
  const { q: _q, ...fewer } = CUSTOM.baseFinger;
  const fewerKeys = Object.fromEntries(ALL_FINGERS.map((finger) => [finger, CUSTOM.fingerKeys[finger].filter((id) => id !== 'q')])) as unknown as FingerAssignment["fingerKeys"];
  assert.notEqual(updateUserFingerAssignment(list, CUSTOM.id, { baseFinger: fewer, fingerKeys: fewerKeys, homeKey: CUSTOM.homeKey }), list);
});

test('codec: 担当するキーと基本の指がエンコード→デコードで保たれる', () => {
  const multi: FingerAssignment = { ...structuredClone(QWERTY_OPTIMIZED_FINGER_ASSIGNMENT), id: 'finger-multi', name: '複数の指' };
  const decoded = USER_FINGER_ASSIGNMENTS_CODEC.decode(USER_FINGER_ASSIGNMENTS_CODEC.encode([multi]));
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.deepEqual(decoded.value, [multi]);
  assert.deepEqual(decoded.value[0]!.fingerKeys.RM.includes('u'), true);
  assert.equal(decoded.value[0]!.baseFinger.u, 'RI');
  assert.deepEqual(decoded.diagnostics, []);
});

test('codec: 基本の指がそのキーを担当していない・基本の指が無い割り当ては捨て、ホームキーが担当でない割り当ては編集の途中として残す', () => {
  const mutate = (change: (value: FingerAssignment) => void) => {
    const value = { ...structuredClone(CUSTOM), id: 'finger-bad' };
    change(value);
    return USER_FINGER_ASSIGNMENTS_CODEC.decode(USER_FINGER_ASSIGNMENTS_CODEC.encode([value]));
  };
  const dropped = (result: ReturnType<typeof mutate>) =>
    result.ok && result.value.length === 0 && result.diagnostics.length > 0;
  // 基本の指(LP)の担当からqが外れている
  assert.ok(dropped(mutate((v) => { v.fingerKeys = { ...v.fingerKeys, LP: v.fingerKeys.LP.filter((key) => key !== 'q') }; })));
  // 担当するキーに基本の指が無い
  assert.ok(dropped(mutate((v) => { delete v.baseFinger.q; })));
  // ホームキーを、その指が担当していない状態は、編集の途中として保存できる
  const kept = mutate((v) => { v.homeKey = { ...v.homeKey, LP: 'j' }; });
  assert.ok(kept.ok && kept.value.length === 1 && kept.value[0]!.homeKey.LP === 'j');
  // 指ごとの担当キーが10本ぶん揃っていない
  assert.ok(dropped(mutate((v) => { delete (v.fingerKeys as Record<string, unknown>).RT; })));
});
