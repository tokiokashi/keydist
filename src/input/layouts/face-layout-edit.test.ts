import assert from 'node:assert/strict';
import test from 'node:test';
import { THUMB_KEY } from '../shapes/geometry.ts';
import {
  blankFaceLayoutDraft,
  checkFaceLayout,
  contentOfFaceLayout,
  createUserFaceLayout,
  draftOf,
  updateUserFaceLayout,
  type FaceLayoutDraft,
} from './face-layout-edit.ts';
import type { KanaLayoutContent } from './kana-face-layout-file.ts';
import type { StageUserLayout } from './user-layouts.ts';

const CONTENT: KanaLayoutContent = {
  name: '面の配列',
  faces: [
    { trigger: [], inputRole: 'layer', outputs: { a: 'あ', s: 'か', d: '゛' } },
    {
      trigger: [THUMB_KEY.LT],
      mode: 'simultaneous',
      triggerPersistence: 'single',
      inputRole: 'layer',
      layer: '左親指',
      outputs: { a: 'ぁ', s: 'い' },
    },
  ],
  composition: { dakuten: true, handakuten: false },
};

const STAGE: StageUserLayout = { id: 'user-stage', name: '段の配列', rows: ['', '', '', ''] };

const clone = <T>(value: T): T => structuredClone(value);

test('新しい配列の下書きは、出力が無い単打の面1つで、名前と出力を入れるまで保存できない', () => {
  const check = checkFaceLayout(blankFaceLayoutDraft());
  assert.equal(check.content, undefined);
  assert.deepEqual(
    check.problems.map((problem) => problem.path),
    ['name', 'faces[0].outputs'],
  );
});

test('誤りの無い下書きは、保存する中身と、打てないかなを返す', () => {
  const check = checkFaceLayout(draftOf(CONTENT));
  assert.deepEqual(check.problems, []);
  assert.deepEqual(check.content, CONTENT);
  assert.ok(check.uncovered?.includes('き'));
  assert.equal(check.uncovered?.includes('ぁ'), false);
  assert.equal(check.uncovered?.includes('が'), false);
});

test('打鍵の順序を選んでいないtrigger付きの面は、順序を書くよう誤りにして推論しない', () => {
  const draft = draftOf(CONTENT);
  delete draft.faces[1]!.mode;
  const check = checkFaceLayout(draft);
  assert.equal(check.content, undefined);
  assert.deepEqual(
    check.problems.map((problem) => [problem.path, problem.message]),
    [['faces[1].mode', '面2は、打鍵の順序（mode）を書いてください']],
  );
});

test('未選択を表すundefinedの項目は、無い項目と同じに扱う', () => {
  const draft = draftOf(CONTENT);
  draft.faces[0]!.mode = undefined;
  draft.faces[0]!.layer = undefined;
  assert.deepEqual(checkFaceLayout(draft).problems, []);
});

test('面の組が配列として組めない時は、面の位置で返して保存する中身を作らない', () => {
  const draft = draftOf(CONTENT);
  // 同じtriggerで順序だけ違う面は読み込みの段では通り、組み立てで初めて合わなくなる
  draft.faces.push({ ...clone(draft.faces[1]!), mode: 'prefix', outputs: { a: 'ぁ' } });
  const check = checkFaceLayout(draft);
  assert.equal(check.content, undefined);
  assert.ok(check.problems.length >= 1);
  assert.ok(check.problems.every((problem) => problem.path.startsWith('faces')));
});

test('ホームキーは空の指定を落とし、物理キーの名前でない値は誤りにする', () => {
  const draft: FaceLayoutDraft = { ...draftOf(CONTENT), homeKeys: { LP: 'a', LR: '' } };
  assert.deepEqual(checkFaceLayout(draft).content?.homeKeys, { LP: 'a' });
  const broken: FaceLayoutDraft = { ...draftOf(CONTENT), homeKeys: { LP: 'zz' } };
  assert.deepEqual(
    checkFaceLayout(broken).problems.map((problem) => problem.path),
    ['homeKeys.LP'],
  );
});

test('同じかなが2か所にある時は、保存を止めずに注意として返す', () => {
  const draft = draftOf(CONTENT);
  draft.faces[1]!.outputs.f = 'あ';
  const check = checkFaceLayout(draft);
  assert.deepEqual(check.problems, []);
  assert.equal(check.notices.length, 1);
  assert.equal(check.notices[0]!.output, 'あ');
});

test('濁点で合成すると指定して濁点がどの面にも無い時は、合成の位置で誤りにする', () => {
  const draft = draftOf(CONTENT);
  delete draft.faces[0]!.outputs.d;
  assert.deepEqual(
    checkFaceLayout(draft).problems.map((problem) => problem.path),
    ['composition.dakuten'],
  );
});

test('作成は定義を末尾に足し、誤りのある入力は拒否する', () => {
  const created = createUserFaceLayout([STAGE], () => 'user-face', CONTENT);
  assert.ok(created.ok);
  assert.deepEqual(
    created.layouts.map((layout) => layout.id),
    ['user-stage', 'user-face'],
  );
  const rejected = createUserFaceLayout([], () => 'user-face', { ...CONTENT, name: ' ' });
  assert.equal(rejected.ok, false);
});

test('更新は中身を書き換え、同じ中身なら同じ参照を返し、面で定義する配列でない対象は拒否する', () => {
  const created = createUserFaceLayout([STAGE], () => 'user-face', CONTENT);
  assert.ok(created.ok);
  const unchanged = updateUserFaceLayout(created.layouts, 'user-face', clone(CONTENT));
  assert.ok(unchanged.ok);
  assert.equal(unchanged.layouts, created.layouts);

  const edited = updateUserFaceLayout(created.layouts, 'user-face', { ...CONTENT, name: '改名', homeKeys: { LP: 'a' } });
  assert.ok(edited.ok);
  const layout = edited.layouts.find((candidate) => candidate.id === 'user-face');
  assert.equal(layout?.name, '改名');
  assert.deepEqual(layout?.homeKeys, { LP: 'a' });
  assert.ok(layout?.faces !== undefined);
  assert.deepEqual(contentOfFaceLayout(layout).faces, CONTENT.faces);

  assert.equal(updateUserFaceLayout(created.layouts, 'user-stage', CONTENT).ok, false);
  assert.equal(updateUserFaceLayout(created.layouts, 'user-face', { ...CONTENT, composition: { dakuten: true, handakuten: true } }).ok, false);
  const missing = updateUserFaceLayout(created.layouts, 'user-none', CONTENT);
  assert.ok(missing.ok);
  assert.equal(missing.layouts, created.layouts);
});
