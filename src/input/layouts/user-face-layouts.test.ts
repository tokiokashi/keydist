import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { userLayoutRows } from '#app/assets/user-asset-rows.ts';
import { buildGeometry, THUMB_KEY } from '../shapes/geometry.ts';
import { layoutKind } from './kind.ts';
import { isStageUserLayout, updateUserLayout } from './layout-edit.ts';
import { buildUserCatalog, userInputLayouts } from './user-catalog.ts';
import { decodeUserLayouts, isValidUserLayout, toLayout, USER_LAYOUTS_CODEC, type FaceUserLayout, type StageUserLayout } from './user-layouts.ts';

/** 単打の面と左親指の面を持ち、濁点を後置して合成する、面で定義する配列。 */
const FACE_LAYOUT: FaceUserLayout = {
  kind: 'kana',
  id: 'user-face',
  name: '面の配列',
  faces: [
    { trigger: [], inputRole: 'layer', outputs: { a: 'あ', s: 'か', d: 'さ', f: '゛' } },
    {
      trigger: [THUMB_KEY.LT],
      mode: 'simultaneous',
      triggerPersistence: 'single',
      inputRole: 'modifier',
      layer: '左親指',
      outputs: { a: 'ぁ', s: 'い' },
    },
  ],
  composition: { dakuten: true, handakuten: false },
};

const STAGE_LAYOUT: StageUserLayout = {
  kind: 'alpha',
  id: 'user-stage',
  name: '段の配列',
  rows: ['1234567890', 'qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'],
  romaji: 'kunrei',
};

const clone = <T>(value: T): T => structuredClone(value);

test('面で定義する配列は、保存の読み込みで値が変わらず診断も無い', () => {
  const result = decodeUserLayouts(clone([FACE_LAYOUT, STAGE_LAYOUT]));
  assert.deepEqual(result.value, [FACE_LAYOUT, STAGE_LAYOUT]);
  assert.deepEqual(result.diagnostics, []);
});

test('面で定義する配列は、triggerのキーを正式名にそろえて読む', () => {
  const stored = clone(FACE_LAYOUT);
  stored.faces[1]!.trigger = ['space'];
  const result = decodeUserLayouts([stored]);
  assert.deepEqual(result.value[0]?.faces?.[1]?.trigger, [THUMB_KEY.RT]);
});

test('面で定義する配列を捨てる時は、どの面の何が誤りかを診断に含める', () => {
  const broken = clone(FACE_LAYOUT);
  delete broken.faces[1]!.triggerPersistence;
  const result = decodeUserLayouts([broken]);
  assert.deepEqual(result.value, []);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0]!.path, '[0]');
  assert.match(result.diagnostics[0]!.message, /形式が不正なため自作の配列を捨てました（面2は、切り替えのキーの持続/);
});

test('面の形は段の形・取り込み形式と併せ持てず、どれを併せ持っているかを診断に含める', () => {
  for (const extra of [{ rows: ['', '', '', ''] }, { sequences: [] }, { legends: [] }, { direct: true }]) {
    const result = decodeUserLayouts([{ ...clone(FACE_LAYOUT), ...extra }]);
    assert.deepEqual(result.value, [], JSON.stringify(extra));
    assert.match(result.diagnostics[0]!.message, new RegExp(`「${Object.keys(extra)[0]}」`));
  }
  // faces だけ・composition だけの半端な形も、段の形として通さない
  assert.equal(isValidUserLayout({ ...clone(STAGE_LAYOUT), faces: [] }), false);
  const { faces: _faces, ...withoutFaces } = clone(FACE_LAYOUT);
  assert.equal(isValidUserLayout(withoutFaces), false);
});

test('USER_LAYOUTS_CODEC: 面で定義する配列が往復する', () => {
  const encoded = USER_LAYOUTS_CODEC.encode([FACE_LAYOUT, STAGE_LAYOUT]);
  const decoded = USER_LAYOUTS_CODEC.decode(JSON.parse(JSON.stringify(encoded)));
  assert.deepEqual(decoded, { ok: true, value: [FACE_LAYOUT, STAGE_LAYOUT], diagnostics: [] });
});

test('面で定義する配列は、ローマ字を経ないかな配列に判定される', () => {
  const catalog = buildUserCatalog([FACE_LAYOUT, STAGE_LAYOUT], []);
  assert.deepEqual([...catalog.layouts.keys()], ['user-face', 'user-stage']);
  assert.equal(layoutKind(catalog.layouts.get('user-face')!, catalog.userLayouts), 'kana');
  assert.equal(layoutKind(catalog.layouts.get('user-stage')!, catalog.userLayouts), 'alpha');
});

test('面で定義する配列は、組んだ配列でかなが打てる（合成を含む）', () => {
  const layout = toLayout(FACE_LAYOUT);
  const trace = generateTrace('あかさがぁい', layout, buildGeometry('row-staggered'), DEFAULT_TRACE_POLICY);
  assert.deepEqual(trace.errors, []);
  assert.equal(trace.skipped, 0);
  // が は 元のかなと濁点の2ステップ、ぁ・い は左親指との同時押しの1ステップ
  assert.equal(trace.strokes.length, 3 + 2 + 2);
});

test('Tester用の配列は、面で定義する配列にローマ字の表を持たせない', () => {
  const layouts = userInputLayouts([FACE_LAYOUT], []);
  assert.deepEqual(
    layouts.map((layout) => layout.id),
    ['user-face'],
  );
  assert.equal(layouts[0]!.romajiTable, undefined);
  assert.equal(buildUserCatalog([FACE_LAYOUT], []).layouts.get('user-face')!.recommendedRomajiRuleId, undefined);
});

test('組めない面は、どの面かを診断と使えない理由に含め、残りの配列は使える', () => {
  const conflicting = clone(FACE_LAYOUT);
  conflicting.id = 'user-bad';
  // 前置の面に、後置の先押しの制約は両立しない
  Object.assign(conflicting.faces[1]!, { mode: 'prefix', triggerOrder: 'suffix' });
  const catalog = buildUserCatalog([conflicting, STAGE_LAYOUT], []);
  assert.deepEqual([...catalog.layouts.keys()], ['user-stage']);
  assert.match(catalog.diagnostics[0]!.message, /配列として組めないため捨てました（面2を加えると/);
  assert.equal(catalog.diagnostics[0]!.path, 'userLayouts[0]');
  assert.equal(catalog.unusableLayouts.has(0), true);
});

test('濁点の合成が組めない配列も、組めない旨を診断に残す', () => {
  const noMark = clone(FACE_LAYOUT);
  noMark.id = 'user-nomark';
  noMark.faces[0]!.outputs = { a: 'あ', s: 'か' };
  // 読み込みの検査をすり抜けた値（直接組み立てた場合）でも、組み立てが投げて捨てられる
  const catalog = buildUserCatalog([noMark], []);
  assert.deepEqual([...catalog.layouts.keys()], []);
  assert.match(catalog.diagnostics[0]!.message, /濁点・半濁点の合成を組めません/);
});

test('ローマ字配列の画面は、面で定義する配列を直せる配列に出さない', () => {
  assert.equal(isStageUserLayout(FACE_LAYOUT), false);
  assert.equal(isStageUserLayout(STAGE_LAYOUT), true);
  const result = updateUserLayout([FACE_LAYOUT], FACE_LAYOUT.id, { name: 'x', rows: ['', 'q', 'a', 'z'], homeKeys: {} });
  assert.equal(result.ok, false);
});

test('資産の一覧の行: 面で定義する配列は、その旨を補足にする', () => {
  const rows = userLayoutRows([FACE_LAYOUT, STAGE_LAYOUT], []);
  assert.equal(rows[0]!.detail, '面で定義した、ローマ字を経ずに直接打つ配列');
  assert.match(rows[1]!.detail ?? '', /ローマ字規則/);
});
