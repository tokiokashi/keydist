import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { buildGeometry } from '../shapes/geometry.ts';
import { checkFaceLayout, createUserFaceLayout, draftOf } from './face-layout-edit.ts';
import type { AlphaLayoutContent } from './face-layout-file.ts';
import { importBenizara, importDvorakJ, importKanaLayoutFile, importRomajiLayoutFile, importVial, type ImportedDefinition } from './import.ts';
import { isAlphaFaceUserLayout, toJapaneseLayout, toLayout, type UserLayout } from './user-layouts.ts';

const geometry = buildGeometry('row-staggered');
const encode = (text: string) => new TextEncoder().encode(text);

const alphaOf = (result: ImportedDefinition) => {
  assert.equal(result.kind, 'alpha');
  return result.kind === 'alpha' ? result : assert.fail();
};

/** 保存して、日本語を打つ配列にする。 */
function savedLayout(content: AlphaLayoutContent) {
  const created = createUserFaceLayout([], () => 'user-x', { ...content, romaji: 'kunrei' });
  assert.ok(created.ok, created.ok ? '' : created.reason);
  const saved: UserLayout = created.layouts[0]!;
  assert.ok(isAlphaFaceUserLayout(saved));
  return saved;
}

const faceOf = (content: AlphaLayoutContent, trigger: string[], mode?: string) =>
  content.faces.find((face) => face.trigger.join() === trigger.join() && (mode === undefined || face.mode === mode));

/** 基底の面と、スペースの位置のキーと同時に押すと複数文字を出す面を持つ定義。 */
const DJ_SPACE_SYLLABLES = [
  '-option-input[',
  '  {S} | +shift',
  ']',
  '[',
  '  1|2|3|',
  '  q|w|e|r|t|y|u|i|o|p|',
  '  a|s|d|f|g|h|j|k|l|',
  '  z|x|c|v|b|n|m|',
  ']',
  '({S}[',
  '  |||',
  '  ka|si|tu|ne|no|ni|',
  '  {BS}|ta|ti|to|te|na|',
  ']',
].join('\n');

test('DvorakJのローマ字の定義は、切り替えのキーのある面を持てば英字の面の形になり、複数文字の出力も語の登録として落ちない', () => {
  const { content, warnings } = alphaOf(importDvorakJ(DJ_SPACE_SYLLABLES, 'テスト'));
  assert.equal(content.kind, 'alpha');
  assert.equal(content.name, 'テスト');
  assert.deepEqual(
    content.faces.map((face) => face.trigger),
    [[], ['thumb-r']],
  );
  assert.deepEqual(faceOf(content, ['thumb-r'])?.outputs, {
    q: 'ka',
    w: 'si',
    e: 'tu',
    r: 'ne',
    t: 'no',
    y: 'ni',
    s: 'ta',
    d: 'ti',
    f: 'to',
    g: 'te',
    h: 'na',
  });
  assert.deepEqual(warnings, []);
  // 推奨のローマ字規則は画面が決める
  assert.equal(content.romaji, undefined);
});

test('スペースの位置のキーだけが切り替えのキーの同時押し・前置の面は押したまま続けられ、後置の面と他のキーを含む面は単発のまま', () => {
  const persistence = (source: string, trigger: string[], mode: string) => {
    const content = alphaOf(importDvorakJ(source)).content;
    return faceOf(content, trigger, mode)?.triggerPersistence;
  };
  const alias = ['-option-input[', '  {S} | +shift', '  {F} | +21', ']'];
  const body = ['[', '  |||', '  q|w|', ']'];
  const face = ['  |||', '  ka|ki|', ']'];
  const sequential = (heading: string) => ['順に打鍵する配列', ...alias, ...body, heading, ...face].join('\n');
  const simultaneous = (heading: string) => ['同時に打鍵する配列', ...alias, ...body, heading, ...face].join('\n');
  assert.equal(persistence(simultaneous('-space['), ['thumb-r'], 'simultaneous'), 'hold-capable');
  assert.equal(persistence(sequential('{S}['), ['thumb-r'], 'prefix'), 'hold-capable');
  // 後置の面は保持を引き継がない
  assert.equal(persistence(sequential('{S}[['), ['thumb-r'], 'suffix'), 'single');
  // スペース以外のキーが入る面は、スペースを含んでいても単発のまま
  assert.equal(persistence(simultaneous('-space-21['), ['thumb-r', 'f'], 'simultaneous'), 'single');
  assert.equal(persistence(simultaneous('-21['), ['f'], 'simultaneous'), 'single');
  assert.equal(persistence(simultaneous('-shift['), ['shift-l'], 'simultaneous'), 'single');
});

test('紅皿のスペースの位置のキーだけの面は押したまま続けられ、左親指や左右親指の面は単発のまま', () => {
  const source = [
    '[ローマ字シフト無し]',
    'q,w,e,r',
    'a,s,d,f',
    'z,x,c,v',
    '[ローマ字右親指シフト]',
    'ka,ki,ku,ke',
    'sa,si,su,se',
    '[ローマ字左親指シフト]',
    'ta,ti,tu,te',
    '[ローマ字左右親指シフト]',
    'na,ni,nu,ne',
    '[ローマ字スペース]',
    'ha,hi,hu,he',
  ].join('\n');
  const { content, warnings } = alphaOf(importBenizara(source, 'テスト'));
  assert.deepEqual(
    warnings.filter((warning) => warning.includes('表せない')),
    [],
  );
  assert.equal(faceOf(content, ['thumb-r'])?.triggerPersistence, 'hold-capable');
  assert.equal(faceOf(content, ['thumb-l'])?.triggerPersistence, 'single');
  assert.equal(faceOf(content, ['thumb-l', 'thumb-r'])?.triggerPersistence, 'single');
});

test('切り替えのキーがShiftのキーだけの面を持つ定義も、英字の面の形になる。機能キーの表示名は残らない', () => {
  const source = ['同時に打鍵する配列', '[', '  |||', '  q|w|{BS}|', '  a|s|d|', ']', '-shift[', '  |||', '  Q|W|{Enter}|', ']'].join('\n');
  const { content } = alphaOf(importDvorakJ(source));
  assert.deepEqual(
    content.faces.map((face) => face.trigger),
    [[], ['shift-l'], ['shift-r']],
  );
  assert.ok(content.faces.every((face) => face.trigger.length === 0 || face.triggerPersistence === 'single'));
  // 機能キーだけのセルは出力にせず、表示名を残す場所も無い
  assert.equal(faceOf(content, [])?.outputs.e, undefined);
  assert.equal('legends' in content, false);
  assert.equal(
    content.faces.some((face) => Object.values(face.outputs).some((output) => /BS|Enter/.test(output))),
    false,
  );
});

test('切り替えのキーのある面を持たない定義とVialは、段の形のまま返す', () => {
  const noSwitch = importDvorakJ(['[', '  |||', '  k|a|t|', '  s|i|u|', ']'].join('\n'));
  assert.equal(noSwitch.kind, 'stage');
  assert.equal(importBenizara(['[ローマ字シフト無し]', 'a,b,c,d', 'e,f,g,h', 'i,j,k,l', 'm,n,o,p'].join('\n')).kind, 'stage');
  // 基底の面と種類が違うために落ちる面だけが切り替えの面なら、面の形にしない
  const droppedOnly = importDvorakJ(['同時に打鍵する配列', '[', '  |||', '  q|w|e|', ']', '-21[', '  |||', '  が|ぎ|ぐ|', ']'].join('\n'));
  assert.equal(droppedOnly.kind, 'stage');
  // 出力のセルが無い切り替えの面だけの定義も面の形にしない
  const emptySwitch = importDvorakJ(['同時に打鍵する配列', '[', '  |||', '  q|w|e|', ']', '-21[', '  |||', '  {BS}|{Enter}|', ']'].join('\n'));
  assert.equal(emptySwitch.kind, 'stage');
  const vial = importVial(JSON.stringify({ layout: [[['KC_1'], ['KC_Q', 'KC_W'], ['KC_A'], ['KC_Z']]] }));
  assert.ok(Array.isArray(vial.sequences));
});

test('面の形で表せない切り替えの面は、表せる面があればその面だけを落とし、なければ段の形のまま今と同じ打鍵列で返す', () => {
  const alias = ['-option-input[', '  {F} | +21', '  {J} | +24', ']'];
  const base = ['[', '  |||', '  ka|ki|ku|', ']'];
  const sequentialFJ = ['{F}{J}[', '  |||', '  ta|ti|tu|', ']'];
  const only = importDvorakJ(['順に打鍵する配列', ...alias, ...base, ...sequentialFJ].join('\n'));
  assert.equal(only.kind, 'stage');
  if (only.kind === 'stage') {
    assert.deepEqual(new Map(only.layout.sequences).get('ta'), [['f'], ['j'], ['q']]);
    assert.deepEqual(only.layout.warnings, []);
  }
  const prefixY = ['{Y}[', '  |||', '  na|ni|nu|', ']'];
  const mixed = alphaOf(
    importDvorakJ(['順に打鍵する配列', ...alias, '-option-input[', '  {Y} | -14', ']', ...base, ...prefixY, ...sequentialFJ].join('\n')),
  );
  assert.equal(mixed.content.faces.length, 2);
  assert.equal(
    mixed.content.faces.some((face) => Object.values(face.outputs).includes('ta')),
    false,
  );
  assert.ok(mixed.warnings.some((warning) => warning.includes('英字の面の形で表せない')));
});

test('面の形で取り込んだ英字の配列は、ローマ字規則を通して日本語を打て、押したまま続ける設定で切り替えのキーを押し直さない', () => {
  const layout = toJapaneseLayout(savedLayout(alphaOf(importDvorakJ(DJ_SPACE_SYLLABLES)).content));
  const text = 'かしつねのにたち';
  const off = generateTrace(text, layout, geometry, DEFAULT_TRACE_POLICY);
  assert.deepEqual(off.errors, []);
  assert.equal(off.skipped, 0);
  assert.equal(off.strokes.length, 8);
  // 複数文字の出力（ka など）は、切り替えのキーとの同時押し1打鍵で出る
  assert.ok(off.strokes.every((stroke) => stroke.presses.flatMap((press) => press.keys).length === 2));
  const triggerPresses = (trace: typeof off) => trace.strokes.filter((stroke) => stroke.participations.some((p) => p.roles.includes('trigger'))).length;
  const heldStrokes = (trace: typeof off) => trace.strokes.filter((stroke) => stroke.participations.some((p) => p.roles.includes('held-trigger'))).length;
  assert.equal(triggerPresses(off), 8);
  assert.equal(heldStrokes(off), 0);
  const on = generateTrace(text, layout, geometry, { ...DEFAULT_TRACE_POLICY, triggerRealizationPolicy: { useHold: true } });
  assert.equal(on.strokes.length, 8);
  assert.equal(triggerPresses(on), 1);
  // 最初の打鍵も押したままの切り替えのキーを使う面の打鍵に数える
  assert.equal(heldStrokes(on), 8);
});

test('面の形で取り込んだ英字の配列は、定義に無い大文字と記号を通常Shiftで打てる', () => {
  const layout = toJapaneseLayout(savedLayout(alphaOf(importDvorakJ(DJ_SPACE_SYLLABLES)).content));
  const trace = generateTrace('Aa!', layout, geometry, DEFAULT_TRACE_POLICY);
  assert.equal(trace.skipped, 0);
  assert.equal(trace.strokes.length, 3);
});

/** 基底の面と、同じ位置に `shiftRow` を置くShiftの面を持つ定義。 */
const shiftFace = (shiftRow: string) =>
  ['同時に打鍵する配列', '[', '  1|2|3|', '  q|w|e|', '  a|s|d|', ']', '-shift[', '  !|@|#|', `  ${shiftRow}`, '  A|S|D|', ']'].join('\n');

test('Shiftの面が通常Shiftと同じ出力だけを置く定義は保存でき、別の文字を置く定義は保存の時に利用者向けの文で止まる', () => {
  const same = alphaOf(importDvorakJ(shiftFace('Q|W|E|')));
  const check = checkFaceLayout(draftOf({ ...same.content, romaji: 'kunrei' }));
  assert.deepEqual(check.problems, []);
  assert.ok(createUserFaceLayout([], () => 'user-x', { ...same.content, romaji: 'kunrei' }).ok);
  // 保存した後の組み立てでも、通常Shiftの経路は足されずに置いた定義が残る
  assert.doesNotThrow(() => toLayout(savedLayout(same.content)));

  const different = alphaOf(importDvorakJ(shiftFace('Z|W|E|')));
  // 取り込みの段階では黙って捨てず、面のまま残す
  assert.equal(faceOf(different.content, ['shift-l'])?.outputs.q, 'Z');
  const blocked = checkFaceLayout(draftOf({ ...different.content, romaji: 'kunrei' }));
  assert.equal(blocked.content, undefined);
  assert.match(blocked.problems[0]!.message, /「Z」の打鍵（Q・左Shift）と「Q」の打鍵（Q・左Shift）が同時に成り立つため、配列として組み立てられません/);
  const created = createUserFaceLayout([], () => 'user-x', { ...different.content, romaji: 'kunrei' });
  assert.equal(created.ok, false);
});

test('ローマ字配列の画面の取り込みは切り替えのキーのある面を持つ定義を面の形で返し、かな配列の画面はローマ字配列の画面で開けることを理由に断る', () => {
  const result = importRomajiLayoutFile('私の配列.txt', encode(DJ_SPACE_SYLLABLES));
  assert.ok(result.ok && result.kind === 'face');
  assert.equal(result.content.name, '私の配列');
  assert.equal(faceOf(result.content, ['thumb-r'])?.triggerPersistence, 'hold-capable');

  const kana = importKanaLayoutFile('私の配列.txt', encode(DJ_SPACE_SYLLABLES));
  assert.ok(!kana.ok);
  assert.match(kana.message, /ローマ字配列の画面で取り込んでください/);
  assert.equal(kana.romajiLayout, true);
});

const KANA_DJ = [
  '同時に打鍵する配列',
  '-option-input[',
  '  {F} | +21',
  ']',
  '[',
  '  |||',
  '  あ|い|う|',
  ']',
  '-space[',
  '  |||',
  '  ぎ|ぐ|げ|',
  ']',
  '-21[',
  '  |||',
  '  が|ぎ|ぐ|',
  ']',
  '-shift[',
  '  |||',
  '  ア|イ|ウ|',
  ']',
].join('\n');

test('かなの取り込みでも、スペースの位置のキーだけが切り替えのキーの面は押したまま続けられ、ほかの面は単発のまま', () => {
  const result = importDvorakJ(KANA_DJ);
  assert.equal(result.kind, 'kana');
  if (result.kind !== 'kana') return;
  const persistence = Object.fromEntries(result.content.faces.map((face) => [face.trigger.join('+') || '-', face.triggerPersistence]));
  assert.deepEqual(persistence, { '-': undefined, 'thumb-r': 'hold-capable', f: 'single', 'shift-l': 'single', 'shift-r': 'single' });

  const benizara = importBenizara(
    ['[かなシフト無し]', 'あ,い,う', '[かな右親指シフト]', 'ぎ,ぐ,げ', '[かな左親指シフト]', 'が,ぎ,ぐ', '[かな左右親指シフト]', 'ざ,じ,ず'].join('\n'),
  );
  assert.equal(benizara.kind, 'kana');
  if (benizara.kind !== 'kana') return;
  assert.equal(faceOf(benizara.content as never, ['thumb-r'])?.triggerPersistence, 'hold-capable');
  assert.equal(faceOf(benizara.content as never, ['thumb-l'])?.triggerPersistence, 'single');
  assert.equal(faceOf(benizara.content as never, ['thumb-l', 'thumb-r'])?.triggerPersistence, 'single');
});

test('かなの語の登録の判定は、かなの取り込みだけに掛かる', () => {
  const kana = importBenizara(['[かなシフト無し]', 'あ,い,う', 'か,トシ,く'].join('\n'));
  assert.equal(kana.kind, 'kana');
  if (kana.kind === 'kana') assert.ok(!Object.values(kana.content.faces[0]!.outputs).includes('トシ'));
  const alpha = alphaOf(importDvorakJ(DJ_SPACE_SYLLABLES));
  assert.ok(Object.values(faceOf(alpha.content, ['thumb-r'])!.outputs).includes('ka'));
});
