import assert from 'node:assert/strict';
import test from 'node:test';
import { blankFaceLayoutDraft, checkFaceLayout, contentOfFaceLayout, draftOf } from './face-layout-edit.ts';
import {
  FACE_LAYOUT_FILE_FORMAT,
  faceLayoutFileBody,
  faceLayoutFileText,
  parseFaceLayoutFile,
  type AlphaLayoutContent,
  type KanaLayoutContent,
} from './face-layout-file.ts';
import type { LayoutKind } from './kind.ts';

const ALPHA: AlphaLayoutContent = {
  kind: 'alpha',
  name: '英字の面',
  faces: [
    { trigger: [], inputRole: 'layer', outputs: { a: 'a', s: 's', d: 'd', f: 'f' } },
    { trigger: ['thumb-r'], mode: 'simultaneous', triggerPersistence: 'single', inputRole: 'layer', outputs: { q: 'ka', w: 'si' } },
  ],
  romaji: 'kunrei',
  homeKeys: { LI: 'f' },
};

const KANA: KanaLayoutContent = {
  kind: 'kana',
  name: 'かなの面',
  faces: [{ trigger: [], inputRole: 'layer', outputs: { a: 'あ', s: 'か', d: 'さ', f: '゛' } }],
  composition: { dakuten: true, handakuten: false },
};

const read = (text: string, kind: LayoutKind) => {
  const result = parseFaceLayoutFile(text, kind);
  assert.ok(result.ok, result.ok ? '' : result.problems.map((problem) => `${problem.path}: ${problem.message}`).join('\n'));
  if (!result.ok) throw new Error('unreachable');
  return result.layout;
};

const problemsOf = (value: unknown, kind: LayoutKind) => {
  const result = parseFaceLayoutFile(typeof value === 'string' ? value : JSON.stringify(value), kind);
  assert.equal(result.ok, false, '誤りがあるのに読めてしまった');
  return result.ok ? [] : result.problems;
};

test('英字の種類の面の形は、種類とローマ字規則を含めて書き出し → 貼り付けで同じ中身に戻る', () => {
  const text = faceLayoutFileText(ALPHA);
  const body = JSON.parse(text) as Record<string, unknown>;
  assert.equal(body.format, FACE_LAYOUT_FILE_FORMAT);
  assert.equal(body.kind, 'alpha');
  assert.equal(body.romaji, 'kunrei');
  assert.equal('composition' in body, false);
  assert.deepEqual(read(text, 'alpha'), ALPHA);
  assert.equal(faceLayoutFileText(read(text, 'alpha')), text);
});

test('かなの種類の面の形は、種類と濁点・半濁点を含めて書き出し → 貼り付けで同じ中身に戻る', () => {
  const text = faceLayoutFileText(KANA);
  const body = JSON.parse(text) as Record<string, unknown>;
  assert.equal(body.kind, 'kana');
  assert.deepEqual(body.composition, { dakuten: true, handakuten: false });
  assert.equal('romaji' in body, false);
  assert.deepEqual(read(text, 'kana'), KANA);
});

test('ローマ字規則を指定しない英字の種類は、romajiを書き出さず、読み込んでも持たない', () => {
  const { romaji: _removed, ...bare } = ALPHA;
  const text = faceLayoutFileText(bare);
  assert.equal('romaji' in faceLayoutFileBody(bare), false);
  assert.deepEqual(read(text, 'alpha'), bare);
});

test('画面の種類と違う種類のJSONは、読まずに、開ける画面を示して取り込まない', () => {
  const alphaInKana = problemsOf(faceLayoutFileText(ALPHA), 'kana');
  assert.deepEqual(
    alphaInKana.map((problem) => problem.path),
    ['kind'],
  );
  assert.match(alphaInKana[0]!.message, /英字の配列の定義です。ローマ字配列の画面で貼り付けてください/);

  const kanaInAlpha = problemsOf(faceLayoutFileText(KANA), 'alpha');
  assert.deepEqual(
    kanaInAlpha.map((problem) => problem.path),
    ['kind'],
  );
  assert.match(kanaInAlpha[0]!.message, /かなの配列の定義です。かな配列の画面で貼り付けてください/);
});

test('かなの種類のJSONにromaji、英字の種類のJSONにcompositionがあれば、読み込みで落ちる', () => {
  const kanaWithRomaji = { ...faceLayoutFileBody(KANA), romaji: 'kunrei' };
  const kana = problemsOf(kanaWithRomaji, 'kana');
  assert.deepEqual(
    kana.map((problem) => problem.path),
    ['romaji'],
  );

  const alphaWithComposition = { ...faceLayoutFileBody(ALPHA), composition: { dakuten: false, handakuten: false } };
  const alpha = problemsOf(alphaWithComposition, 'alpha');
  assert.deepEqual(
    alpha.map((problem) => problem.path),
    ['composition'],
  );
});

test('種類（kind）の無いJSONは、画面の種類と見なさず、種類を書くよう伝える', () => {
  const { kind: _kind, ...withoutKind } = faceLayoutFileBody(ALPHA);
  const problems = problemsOf(withoutKind, 'alpha');
  assert.equal(problems[0]?.path, 'kind');
});

test('英字の種類のJSONも、通常Shiftを足した後に衝突する定義は取り込まない', () => {
  const colliding = faceLayoutFileBody({
    ...ALPHA,
    faces: [...ALPHA.faces, { trigger: ['shift-l'], mode: 'simultaneous', triggerPersistence: 'single', inputRole: 'modifier', outputs: { a: '@' } }],
  });
  const problems = problemsOf(colliding, 'alpha');
  assert.match(problems[0]!.message, /同時に成り立つため、配列として組み立てられません/);
});

test('古い形式名のJSONは取り込まない', () => {
  const problems = problemsOf({ ...faceLayoutFileBody(KANA), format: 'keydist-kana-layout' }, 'kana');
  assert.equal(problems[0]?.path, 'format');
});

test('下書きの検査を通した中身と、JSONから読んだ中身が一致する', () => {
  const draft = { ...blankFaceLayoutDraft('alpha', 'kunrei'), name: '英字の面', faces: structuredClone(ALPHA.faces) as never, homeKeys: { LI: 'f' } };
  const check = checkFaceLayout(draft);
  assert.deepEqual(check.problems, []);
  assert.deepEqual(check.content, ALPHA);
  assert.deepEqual(draftOf(contentOfFaceLayout({ id: 'x', ...ALPHA })), draft);
});
