import assert from 'node:assert/strict';
import test from 'node:test';
import { userLayoutRows } from '#app/assets/user-asset-rows.ts';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { buildGeometry, QWERTY_LEGEND, THUMB_KEY } from '../shapes/geometry.ts';
import { blankFaceLayoutDraft, checkFaceLayout, contentOfFaceLayout, draftOf } from './face-layout-edit.ts';
import { layoutKind } from './kind.ts';
import { isEditableUserLayout } from './layout-edit.ts';
import { kanaLayoutFileText, parseKanaLayoutFile } from './kana-face-layout-file.ts';
import { buildUserCatalog } from './user-catalog.ts';
import {
  decodeUserLayouts,
  isKanaFaceUserLayout,
  toJapaneseLayout,
  toLayout,
  USER_LAYOUTS_CODEC,
  type AlphaFaceUserLayout,
  type KanaFaceUserLayout,
  type StageUserLayout,
  type UserLayout,
} from './user-layouts.ts';

/** QWERTY刻印のキーに、そのキーの文字をそのまま置いた面の出力 */
const IDENTITY_OUTPUTS: Record<string, string> = Object.fromEntries(QWERTY_LEGEND.flatMap((row) => [...row].map((key) => [key, key])));

/** 基底の面と、右親指との同時押しでローマ字のまとまりを出す面を持つ、英字の種類の面の形。 */
const ALPHA_FACE: AlphaFaceUserLayout = {
  id: 'user-alpha-face',
  name: '英字の面',
  kind: 'alpha',
  faces: [
    { trigger: [], inputRole: 'layer', outputs: IDENTITY_OUTPUTS },
    {
      trigger: [THUMB_KEY.RT],
      mode: 'simultaneous',
      triggerPersistence: 'single',
      inputRole: 'layer',
      outputs: { q: 'ka', w: 'si', e: 'tu', r: 'ne', a: 'no', s: 'ni' },
    },
  ],
  romaji: 'kunrei',
};

const KANA_FACE: KanaFaceUserLayout = {
  id: 'user-kana-face',
  name: 'かなの面',
  kind: 'kana',
  faces: [{ trigger: [], inputRole: 'layer', outputs: { a: 'あ', s: 'か', d: 'さ', f: '゛' } }],
  composition: { dakuten: true, handakuten: false },
};

const ALPHA_STAGE: StageUserLayout = {
  id: 'user-alpha-stage',
  name: '英字の段',
  kind: 'alpha',
  rows: ['1234567890', 'qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'],
  romaji: 'kunrei',
};

const clone = <T>(value: T): T => structuredClone(value);
const geometry = buildGeometry('row-staggered');

test('種類は形と独立に保存され、読み込んでも変わらない', () => {
  const layouts: UserLayout[] = [ALPHA_STAGE, ALPHA_FACE, KANA_FACE];
  const decoded = decodeUserLayouts(clone(layouts));
  assert.deepEqual(decoded.diagnostics, []);
  assert.deepEqual(decoded.value, layouts);
  const catalog = buildUserCatalog(layouts, []);
  assert.deepEqual(
    [...catalog.layouts.values()].map((layout) => layoutKind(layout, catalog.userLayouts)),
    ['alpha', 'alpha', 'kana'],
  );
  const encoded = JSON.parse(JSON.stringify(USER_LAYOUTS_CODEC.encode(layouts)));
  assert.deepEqual(USER_LAYOUTS_CODEC.decode(encoded), { ok: true, value: layouts, diagnostics: [] });
});

test('英字の面の形は、ローマ字規則を通して日本語のテキストを打てる', () => {
  const layout = toJapaneseLayout(ALPHA_FACE);
  assert.notEqual(layout.romajiTable, undefined);
  const trace = generateTrace('かしつねのに', layout, geometry, DEFAULT_TRACE_POLICY);
  assert.deepEqual(trace.errors, []);
  assert.equal(trace.skipped, 0);
  assert.equal(trace.strokes.length, 6);
  // 面の出力のkaやsiなどは右親指との同時押し1打鍵で打つ
  assert.ok(trace.strokes.every((stroke) => stroke.presses.flatMap((press) => press.keys).length === 2));
  const catalog = buildUserCatalog([ALPHA_FACE], []);
  assert.equal(catalog.layouts.get(ALPHA_FACE.id)!.recommendedRomajiRuleId, 'kunrei');
});

test('英字の面の形は、大文字と記号を通常Shiftで打てる。かなの面の形には通常Shiftが付かない', () => {
  const alpha = toLayout(ALPHA_FACE);
  const trace = generateTrace('Aa!', alpha, geometry, DEFAULT_TRACE_POLICY);
  assert.equal(trace.skipped, 0);
  assert.equal(trace.strokes.length, 3);
  assert.equal(alpha.canonicalInputs.has('A'), true);
  assert.equal(alpha.canonicalInputs.has('!'), true);
  const kana = toLayout(KANA_FACE);
  assert.equal(kana.canonicalInputs.has('A'), false);
  assert.equal(
    [...kana.canonicalInputs.keys()].some((output) => /[A-Z!]/.test(output)),
    false,
  );
});

test('英字の面の形が定義に置いた大文字は、置いた定義を優先して通常Shiftを足さない', () => {
  const layout = clone(ALPHA_FACE);
  layout.faces[1]!.outputs = { ...layout.faces[1]!.outputs, z: 'A' };
  const built = toLayout(layout);
  const alternatives = built.canonicalInputs.get('A')!;
  assert.equal(alternatives.length, 1);
  assert.deepEqual(alternatives[0]!.baseRealizations[0]!.defaultTriggerKeys, [THUMB_KEY.RT]);
});

test('面の形の読み込みは、種類ごとに持てる項目を守る', () => {
  const rejects = (layout: unknown, message: RegExp) => {
    const result = decodeUserLayouts([layout]);
    assert.deepEqual(result.value, []);
    assert.match(result.diagnostics[0]!.message, message);
  };
  // かなの種類はcompositionが必須で、romajiを持てない
  const { composition: _composition, ...withoutComposition } = clone(KANA_FACE);
  rejects(withoutComposition, /濁点・半濁点を後から打って合成するか/);
  rejects({ ...clone(KANA_FACE), romaji: 'kunrei' }, /「romaji」/);
  // 英字の種類はcompositionを持てない
  rejects({ ...clone(ALPHA_FACE), composition: { dakuten: false, handakuten: false } }, /「composition」/);
  // 種類の無い値・知らない種類・かなの種類の段の形は読まない
  const { kind: _kind, ...withoutKind } = clone(ALPHA_FACE);
  rejects(withoutKind, /配列の種類（kind）/);
  const { kind: _stageKind, ...stageWithoutKind } = clone(ALPHA_STAGE);
  rejects(stageWithoutKind, /種類（kind）/);
  rejects({ ...clone(ALPHA_FACE), kind: 'hangul' }, /配列の種類（kind）/);
  rejects({ ...clone(ALPHA_STAGE), kind: 'kana' }, /種類（kind）/);
  // romajiは省略できる
  const { romaji: _romaji, ...withoutRomaji } = clone(ALPHA_FACE);
  assert.deepEqual(decodeUserLayouts([withoutRomaji]).value, [withoutRomaji]);
});

test('ローマ字規則は、英字の面の形でも推奨・同梱・参照の対象になり、かなの面の形では見ない', () => {
  const rows = userLayoutRows([ALPHA_FACE, KANA_FACE], []);
  assert.match(rows[0]!.detail ?? '', /ローマ字規則/);
  assert.equal(rows[1]!.detail, '面で定義した、ローマ字を経ずに直接打つ配列');
  const unknown = { ...clone(ALPHA_FACE), romaji: 'no-such-rule' };
  const catalog = buildUserCatalog([unknown], []);
  assert.equal(catalog.layouts.get(unknown.id)!.recommendedRomajiRuleId, undefined);
  assert.match(catalog.diagnostics[0]!.message, /ローマ字規則「no-such-rule」が見つからない/);
});

test('ローマ字配列の画面が段の形として開く配列は、種類ではなく形で決まる', () => {
  assert.equal(isEditableUserLayout(ALPHA_STAGE), true);
  assert.equal(isEditableUserLayout(ALPHA_FACE), false);
  assert.equal(isEditableUserLayout(KANA_FACE), false);
  assert.equal(isKanaFaceUserLayout(KANA_FACE), true);
  assert.equal(isKanaFaceUserLayout(ALPHA_FACE), false);
  assert.equal(isKanaFaceUserLayout(ALPHA_STAGE), false);
});

test('下書きの検査: 全かなの確認はかなの種類だけに掛け、英字の種類はcompositionを保存に入れない', () => {
  const alphaDraft = { ...draftOf(contentOfFaceLayout(ALPHA_FACE)), composition: { dakuten: true, handakuten: true } };
  const alpha = checkFaceLayout(alphaDraft);
  assert.deepEqual(alpha.problems, []);
  assert.deepEqual(alpha.uncovered, []);
  assert.deepEqual(alpha.content, contentOfFaceLayout(ALPHA_FACE));
  assert.equal(alpha.content?.kind, 'alpha');

  const kana = checkFaceLayout(draftOf(contentOfFaceLayout(KANA_FACE)));
  assert.deepEqual(kana.problems, []);
  assert.ok((kana.uncovered ?? []).length > 0);
  assert.equal(kana.content?.kind, 'kana');
  assert.equal(blankFaceLayoutDraft().kind, 'kana');
});

test('貼り付け・書き出しのJSONは、かなの種類の面の形だけを読み書きする', () => {
  const kana = contentOfFaceLayout(KANA_FACE);
  assert.equal(kana.kind, 'kana');
  const text = kanaLayoutFileText(kana as Parameters<typeof kanaLayoutFileText>[0]);
  const body = JSON.parse(text) as Record<string, unknown>;
  assert.equal('kind' in body, false);
  const read = parseKanaLayoutFile(text);
  assert.ok(read.ok);
  assert.equal(read.layout.kind, 'kana');
  // 種類とローマ字規則はJSONの項目にない
  for (const extra of [{ kind: 'alpha' }, { romaji: 'kunrei' }]) {
    const result = parseKanaLayoutFile(JSON.stringify({ ...body, ...extra }));
    assert.equal(result.ok, false);
  }
});

test('英字の面の形の保存の検査は、通常Shiftを足した後の衝突を保存の時に知らせる', () => {
  const colliding = clone(ALPHA_FACE);
  colliding.faces.push({
    trigger: ['shift-l'],
    mode: 'simultaneous',
    triggerPersistence: 'single',
    inputRole: 'modifier',
    outputs: { a: '@' },
  });
  assert.throws(() => toLayout(colliding));
  const check = checkFaceLayout(draftOf(contentOfFaceLayout(colliding)));
  assert.equal(check.content, undefined);
  assert.match(check.problems[0]!.message, /同時に成り立つため、配列として組み立てられません/);
  assert.deepEqual(checkFaceLayout(draftOf(contentOfFaceLayout(ALPHA_FACE))).problems, []);
});
