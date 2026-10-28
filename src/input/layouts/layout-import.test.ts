import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeLayoutFile,
  formatForFileName,
  hasKanaLetter,
  importBenizara,
  importDvorakJ,
  importKanaLayoutFile,
  importRomajiLayoutFile,
  importVial,
  type ImportedDefinition,
  type ImportedLayout,
} from './import.ts';
import { dvorakJScanCode } from './dvorakj-heading.ts';
import { isWordRegistration } from './import-faces.ts';
import { CUSTOM_COMBOS } from './combos-custom.ts';
import { buildFaceLayout, duplicateOutputNotices } from './kana-face-layout.ts';
import { createUserLayout, contentOfImported } from './layout-edit.ts';
import { toLayout, type StageUserLayout, type UserLayout } from './user-layouts.ts';

const kanaOf = (result: ImportedDefinition) => {
  assert.equal(result.kind, 'kana');
  return result.kind === 'kana' ? result : assert.fail();
};

const stageOf = (result: ImportedDefinition): ImportedLayout => {
  assert.equal(result.kind, 'stage');
  return result.kind === 'stage' ? result.layout : assert.fail();
};

const vialKeyCode = (key: string): string => {
  if (key === '-') return 'KC_MINS';
  if (key === ',') return 'KC_COMMA';
  return `KC_${key.toUpperCase()}`;
};

test('Vialの第0層・通常キー出力・マクロ出力のコンボを読む', () => {
  const layout = importVial(
    JSON.stringify({
      layout: [
        [
          ['KC_1', 'KC_2', 'KC_3', 'KC_4', 'KC_5', 'KC_6', 'KC_7', 'KC_8', 'KC_9', 'KC_0', 'KC_MINS', 'KC_ENTER'],
          ['KC_Q', 'KC_W', 'KC_E', 'KC_R', 'KC_T', 'KC_Y', 'KC_U', 'KC_I', 'KC_O', 'KC_P', 'KC_LBRC', 'KC_RBRC'],
          ['KC_A', 'KC_S', 'KC_D', 'KC_F', 'KC_G', 'KC_H', 'KC_J', 'KC_K', 'KC_L', 'KC_SCOLON', 'KC_QUOTE'],
          ['KC_Z', 'KC_X', 'KC_C', 'KC_V', 'KC_B', 'KC_N', 'KC_M', 'KC_COMMA', 'KC_DOT', 'KC_SLASH'],
        ],
      ],
      macro: [[['text', 'desu']], [['tap', 'KC_K', 'KC_A']]],
      combo: [
        ['KC_D', 'KC_S', 'KC_NO', 'KC_NO', 'M0'],
        ['KC_K', 'KC_A', 'KC_NO', 'KC_NO', 'KC_DOT'],
        ['KC_K', 'KC_A', 'KC_NO', 'KC_NO', 'M1'],
        ['MO(1)', 'KC_A', 'KC_NO', 'KC_NO', 'KC_B'],
      ],
    }),
  );
  assert.equal(layout.rows[1].slice(0, 2), 'qw');
  assert.deepEqual(
    layout.sequences.find(([output]) => output === 'desu'),
    ['desu', [['d', 's']]],
  );
  assert.deepEqual(
    layout.sequences.find(([output]) => output === '.'),
    ['.', [['k', 'a']]],
  );
  assert.deepEqual(
    layout.sequences.find(([output]) => output === 'ka'),
    ['ka', [['k', 'a']]],
  );
  assert.ok(layout.legends.some(([key, label]) => key === '=' && label === 'KC_ENTER'));
  assert.ok(!layout.sequences.some(([output]) => output === 'KC_ENTER'));
  assert.ok(layout.warnings.some((warning) => warning.includes('MO(1)')));
});

test('既存のVial由来コンボ73件を全件取り込める', () => {
  const data = {
    layout: [
      [
        ['KC_1', 'KC_2', 'KC_3', 'KC_4', 'KC_5', 'KC_6', 'KC_7', 'KC_8', 'KC_9', 'KC_0', 'KC_MINS', 'KC_EQL'],
        ['KC_Q', 'KC_W', 'KC_E', 'KC_R', 'KC_T', 'KC_Y', 'KC_U', 'KC_I', 'KC_O', 'KC_P', 'KC_LBRC', 'KC_RBRC'],
        ['KC_A', 'KC_S', 'KC_D', 'KC_F', 'KC_G', 'KC_H', 'KC_J', 'KC_K', 'KC_L', 'KC_SCLN', 'KC_QUOT'],
        ['KC_Z', 'KC_X', 'KC_C', 'KC_V', 'KC_B', 'KC_N', 'KC_M', 'KC_COMMA', 'KC_DOT', 'KC_SLASH'],
      ],
    ],
    macro: CUSTOM_COMBOS.map(([output]) => [['text', output]]),
    combo: CUSTOM_COMBOS.map(([, inputs], index) => [
      ...inputs.map(vialKeyCode),
      ...Array.from({ length: 4 - inputs.length }, () => 'KC_NO'),
      `M${index}`,
    ]),
  };
  const imported = importVial(JSON.stringify(data));
  const sequences = new Map(imported.sequences);
  assert.equal(CUSTOM_COMBOS.length, 73);
  for (const [output, inputs] of CUSTOM_COMBOS) {
    assert.deepEqual(sequences.get(output), [inputs.map((key) => key)]);
  }
});

const DVORAKJ_KANA = [
  '-option-input[',
  '  {F} | +21',
  '  {J} | +24',
  '  {S} | +shift',
  '  {Z} | +99',
  ']',
  '[',
  '  1|2|3|',
  '  き|{←}|{→}|',
  '  あ|い|う|',
  '  た|ち|つ|',
  ']',
  '({S}[',
  '  |||',
  '  、{Enter}|ぎ|ぐ|',
  '  |||',
  '  |||',
  ']',
  '({F}{J}[',
  '  |||',
  '  が|ぎ|ぐ|',
  '  |||',
  '  |||',
  ']',
  '(+23, ({S}+23[',
  '  |||',
  ']',
  '({F}[',
  ']',
].join('\n');

test('DvorakJのかな定義は、面ごとのtriggerと出力を持つ面の形になる', () => {
  const result = kanaOf(importDvorakJ(DVORAKJ_KANA, 'テスト'));
  const { faces, composition, name } = result.content;
  assert.equal(name, 'テスト');
  assert.deepEqual(composition, { dakuten: false, handakuten: false });
  assert.deepEqual(
    faces.map((face) => face.trigger),
    [[], ['thumb-r'], ['f', 'j']],
  );
  // triggerの無い面は役割だけを持つ。triggerを持つ面は同時打鍵・単発
  assert.deepEqual(faces[0], {
    trigger: [],
    inputRole: 'layer',
    outputs: { '1': '1', '2': '2', '3': '3', q: 'き', a: 'あ', s: 'い', d: 'う', z: 'た', x: 'ち', c: 'つ' },
  });
  assert.deepEqual(faces[1], {
    trigger: ['thumb-r'],
    mode: 'simultaneous',
    triggerPersistence: 'single',
    inputRole: 'layer',
    outputs: { q: '、', w: 'ぎ', e: 'ぐ' },
  });
  assert.deepEqual(faces[2], {
    trigger: ['f', 'j'],
    mode: 'simultaneous',
    triggerPersistence: 'single',
    inputRole: 'layer',
    outputs: { q: 'が', w: 'ぎ', e: 'ぐ' },
  });
  // 機能キーだけのセルは出力にしない
  assert.ok(faces.every((face) => !Object.values(face.outputs).some((output) => output === '←' || output === '→')));
  // セルの無い見出しは、カンマで分けた2つの面（H、シフトとH）とも取り込める出力が無い
  assert.ok(result.warnings.some((warning) => warning.includes('(+23, ({S}+23[') && warning.includes('取り込めるセルがない')));
  assert.ok(result.warnings.some((warning) => warning.includes('({F}[') && warning.includes('セルがない')));
});

test('同じ出力が複数の面にあれば、全部の置き場を残す', () => {
  const { content } = kanaOf(importDvorakJ(DVORAKJ_KANA));
  const places = content.faces.filter((face) => Object.values(face.outputs).includes('ぎ')).map((face) => face.trigger);
  assert.deepEqual(places, [['thumb-r'], ['f', 'j']]);
  assert.ok(duplicateOutputNotices(content).some((notice) => notice.output === 'ぎ'));
});

test('取り込んだ面の形は、組み立ての検査を通り、保存する自作の配列として組める', () => {
  const { content } = kanaOf(importDvorakJ(DVORAKJ_KANA));
  const layout = buildFaceLayout('imported', content.name, content);
  assert.equal(layout.canonicalInputs.get('ぎ')?.length, 2);
  assert.equal(layout.canonicalInputs.get('が')?.length, 1);
  const user: UserLayout = { id: 'imported', ...content };
  assert.equal(toLayout(user).canonicalInputs.get('あ')?.length, 1);
});

test('同じtriggerの面は1つにまとめ、キーが重なるセルとtrigger自身の位置のセルは注意に入る', () => {
  const source = [
    '-option-input[',
    '  {F} | +21',
    ']',
    '({F}[',
    '  |||',
    '  あ|い|う|',
    '  か|き|く|',
    ']',
    '({F}[',
    '  |||',
    '  え|い|お|',
    '  |||',
    '  さ|し|す|',
    ']',
    '[',
    '  |||',
    '  |||',
    '  ん|ー|',
    ']',
  ].join('\n');
  const { content, warnings } = kanaOf(importDvorakJ(source));
  const faceF = content.faces.find((face) => face.trigger.join() === 'f');
  assert.equal(content.faces.filter((face) => face.trigger.join() === 'f').length, 1);
  // 先に出たセルを残す。同じ出力が重なるだけなら注意にしない
  assert.deepEqual(faceF?.outputs, { q: 'あ', w: 'い', e: 'う', a: 'か', s: 'き', d: 'く', z: 'さ', x: 'し', c: 'す' });
  assert.ok(warnings.some((warning) => warning.includes('「え」') && warning.includes('重なる')));
  assert.ok(warnings.some((warning) => warning.includes('「お」') && warning.includes('重なる')));
  assert.ok(!warnings.some((warning) => warning.includes('「い」')));
});

test('triggerのキー自身の位置にあるセルは、取り込まずに注意へ入れる', () => {
  const source = ['-option-input[', '  {A} | +1e', ']', '({A}[', '  |||', '  |||', '  あ|い|う|', ']', '[', '  あ|い|', ']'].join('\n');
  const { content, warnings } = kanaOf(importDvorakJ(source));
  const face = content.faces.find((entry) => entry.trigger.join() === 'a');
  assert.deepEqual(face?.outputs, { s: 'い', d: 'う' });
  assert.equal(warnings.filter((warning) => warning.includes('自身の位置')).length, 1);
  assert.ok(warnings.some((warning) => warning.includes('「あ」') && warning.includes('自身の位置')));
});

test('DvorakJの面の内容からローマ字の定義は段の形、かなの定義は面の形に分かれる', () => {
  const roman = stageOf(importDvorakJ('[\n  ka|si|tu|ne|\n  q|w|e|r|\n]'));
  assert.ok(roman.sequences.some(([output]) => output === 'ka'));
  assert.throws(() => importDvorakJ('[\n  ka|あ|\n]'), /混在/);
});

const BENIZARA_KANA = [
  '[配列]',
  '名称=テスト',
  '[かなシフト無し]',
  'あ,い,う,え,お',
  'か,き,く,け,こ',
  'さ,し,す,せ,そ',
  'た,ち,つ,て,と',
  '[かな左右親指シフト]',
  'が,ぎ,ぐ,げ,ご',
  'だ,ぢ,づ,で,ど',
  '[かな右親指シフト]',
  'ガ,,,,',
  '[かな小指シフト]',
  'x,x,x,x,x',
].join('\n');

const dvorakJ = (declaration: string, ...blocks: string[][]): string => [declaration, ...blocks.flat()].join('\n');
const FJ_ALIASES = ['-option-input[', '  {F} | +21', '  {J} | +24', '  {Y} | -14', ']'];

const faceOf = (content: { faces: { trigger: string[]; mode?: string; outputs: Record<string, string> }[] }, trigger: string[], mode?: string) =>
  content.faces.find((face) => face.trigger.join() === trigger.join() && (mode === undefined || face.mode === mode));

test('同時に打鍵するファイルのハイフン区切りの見出しは、見出しのキーとセルのキーの同時押しの面になる', () => {
  const source = dvorakJ('同時に打鍵する配列', [
    '[',
    '  |||',
    '  き|く|け|',
    ']',
    '-25[',
    '  |||',
    '  ぁ|ぃ|ぅ|',
    ']',
    '-21-24[',
    '  |||',
    '  が|ぎ|ぐ|',
    ']',
  ]);
  const { content, warnings } = kanaOf(importDvorakJ(source));
  assert.deepEqual(
    content.faces.map((face) => [face.trigger, face.mode]),
    [
      [[], undefined],
      [['k'], 'simultaneous'],
      [['f', 'j'], 'simultaneous'],
    ],
  );
  assert.deepEqual(faceOf(content, ['k'])?.outputs, { q: 'ぁ', w: 'ぃ', e: 'ぅ' });
  assert.deepEqual(warnings, []);
});

test('順に打鍵するファイルの、括弧の無い見出しは前置、括弧で始まる見出しは同時押しの面になる', () => {
  const source = dvorakJ('順に打鍵する配列', FJ_ALIASES, [
    '{Y}[',
    '  |||',
    '  あ|い|う|',
    ']',
    '(-12[',
    '  |||',
    '  か|き|く|',
    ']',
    '({F}{J}[',
    '  |||',
    '  さ|し|す|',
    ']',
  ]);
  const { content } = kanaOf(importDvorakJ(source));
  assert.equal(faceOf(content, ['t'])?.mode, 'prefix');
  assert.equal(faceOf(content, ['e'])?.mode, 'simultaneous');
  assert.equal(faceOf(content, ['f', 'j'])?.mode, 'simultaneous');
  assert.deepEqual(faceOf(content, ['t'])?.outputs, { q: 'あ', w: 'い', e: 'う' });
});

test('順に打鍵するファイルの、先に打つ表（[[）は、キーが1つなら後置の面になる', () => {
  const source = dvorakJ('順に打鍵する配列', FJ_ALIASES, ['{F}[[', '  |||', '  あ|い|う|', ']']);
  const { content } = kanaOf(importDvorakJ(source));
  assert.equal(faceOf(content, ['f'])?.mode, 'suffix');
});

test('同時に打鍵するファイルの [[ の表は、同時押しの面になる', () => {
  const source = dvorakJ('同時に打鍵する配列', FJ_ALIASES, ['{F}[[', '  |||', '  あ|い|う|', ']']);
  const { content } = kanaOf(importDvorakJ(source));
  assert.equal(faceOf(content, ['f'])?.mode, 'simultaneous');
});

test('順に打鍵するファイルで、キーを2つ以上続けて打つ見出しは、かなの定義では取り込まず注意に入る', () => {
  const source = dvorakJ('順に打鍵する配列', FJ_ALIASES, [
    '[',
    '  |||',
    '  き|く|け|',
    ']',
    '{F}{J}[',
    '  |||',
    '  あ|い|う|',
    ']',
    '{F}{J}[[',
    '  |||',
    '  か|き|く|',
    ']',
  ]);
  const { content, warnings } = kanaOf(importDvorakJ(source));
  assert.deepEqual(
    content.faces.map((face) => face.trigger),
    [[]],
  );
  assert.equal(warnings.filter((warning) => warning.includes('「{F}{J}[」') && warning.includes('表せない')).length, 1);
  assert.equal(warnings.filter((warning) => warning.includes('「{F}{J}[[」') && warning.includes('表せない')).length, 1);
});

test('カンマで分けた見出しは別の面になり、末尾のカンマは切り替えのキーの無い面を足す', () => {
  const source = dvorakJ('同時に打鍵する配列', ['-1E, -1F[', '  |||', '  き|く|け|', ']', '-20,[', '  |||', '  あ|い|う|', ']']);
  const { content } = kanaOf(importDvorakJ(source));
  assert.deepEqual(
    content.faces.map((face) => face.trigger),
    [['a'], ['s'], ['d'], []],
  );
  assert.deepEqual(faceOf(content, ['a'])?.outputs, faceOf(content, ['s'])?.outputs);
  assert.deepEqual(faceOf(content, [])?.outputs, { q: 'あ', w: 'い', e: 'う' });
});

test('+ で続ける見出しも、- と同じ区切りのキーの組として読み、3キーの同時押しの面になる', () => {
  const source = dvorakJ('順に打鍵する配列', ['(+20+21[', '  |||', '  あ|い|う|', ']', '(+23, ({S}+23[', '  |||', '  か|き|く|', ']']);
  const { content } = kanaOf(importDvorakJ(source));
  assert.deepEqual(faceOf(content, ['d', 'f'])?.outputs, { q: 'あ', w: 'い', e: 'う' });
  assert.equal(faceOf(content, ['d', 'f'])?.mode, 'simultaneous');
  // `{S}` の別名が無い見出しの `{S}` は解決できないので、その面だけを注意に入れる
  assert.deepEqual(faceOf(content, ['h'])?.outputs, { q: 'か', w: 'き', e: 'く' });
  assert.ok(content.faces.every((face) => face.trigger.length <= 2));
});

test('別名の値が+の印とshiftの{S}は、センターシフトのキーと同時押しの面になる', () => {
  const source = dvorakJ('順に打鍵する配列', ['-option-input[', '  {S} | +shift', ']', '(+23, ({S}+23[', '  |||', '  か|き|く|', ']']);
  const { content } = kanaOf(importDvorakJ(source));
  assert.deepEqual(
    content.faces.map((face) => face.trigger),
    [['h'], ['thumb-r', 'h']],
  );
});

test('見出しのshiftは、左右のShiftの2面になる', () => {
  const source = dvorakJ('同時に打鍵する配列', ['-shift[', '  |||', '  あ|い|う|', ']']);
  const { content } = kanaOf(importDvorakJ(source));
  assert.deepEqual(
    content.faces.map((face) => face.trigger),
    [['shift-l'], ['shift-r']],
  );
  assert.deepEqual(content.faces[0].outputs, content.faces[1].outputs);
});

test('英字で書いた見出しは、スキャンコードにもキーの名前にも当たらないので面ごと注意に入る', () => {
  const source = dvorakJ('同時に打鍵する配列', ['[', '  |||', '  き|く|け|', ']', '-f-j[', '  |||', '  が|ぎ|ぐ|', ']']);
  const { content, warnings } = kanaOf(importDvorakJ(source));
  assert.deepEqual(
    content.faces.map((face) => face.trigger),
    [[]],
  );
  assert.deepEqual(warnings, ['DvorakJの面ヘッダ「-f-j[」のキー「f」を解決できないため無視しました']);
  const stage = stageOf(importDvorakJ(dvorakJ('同時に打鍵する配列', ['[', '  q|w|e|', ']', '-f-j[', '  |||', '  a|b|c|', ']'])));
  assert.equal(new Map(stage.sequences).has('a'), false);
  assert.ok(stage.warnings.some((warning) => warning.includes('「-f-j[」') && warning.includes('解決できない')));
});

test('見出しの次の行にだけある [ は、切り替えのキーの無い面として読み、前の行は無視する', () => {
  const source = dvorakJ('同時に打鍵する配列', ['-21', '[', '  |||', '  き|く|け|', ']']);
  const { content, warnings } = kanaOf(importDvorakJ(source));
  assert.deepEqual(
    content.faces.map((face) => face.trigger),
    [[]],
  );
  assert.deepEqual(warnings, []);
});

test('以前から読めた面と違う種類の出力を持つ、新しく読めた面は、面ごと取り込まず注意に入れる', () => {
  const source = dvorakJ('同時に打鍵する配列', ['[', '  |||', '  q|w|e|', ']', '-21-24[', '  |||', '  が|ぎ|ぐ|', ']', '-20[', '  |||', '  a|b|c|', ']']);
  const layout = stageOf(importDvorakJ(source));
  assert.equal(new Map(layout.sequences).has('が'), false);
  assert.equal(new Map(layout.sequences).has('a'), true);
  assert.ok(layout.warnings.some((warning) => warning.includes('「-21-24[」') && warning.includes('種類')));
  const kana = kanaOf(importDvorakJ(dvorakJ('同時に打鍵する配列', ['[', '  |||', '  き|く|け|', ']', '-21[', '  |||', '  a|b|c|', ']'])));
  assert.deepEqual(
    kana.content.faces.map((face) => face.trigger),
    [[]],
  );
  // 以前から読めた面に両方の種類があれば、今まで通り取り込まない
  assert.throws(() => importDvorakJ(dvorakJ('同時に打鍵する配列', ['[', '  |||', '  q|あ|', ']'])), /混在/);
});

test('段の形（ローマ字）では、前置は切り替えのキーの後、後置は前にセルのキーを打つ打鍵列になる', () => {
  const prefix = stageOf(
    importDvorakJ(
      dvorakJ('順に打鍵する配列', FJ_ALIASES, [
        '{Y}[',
        '  |||',
        '  ka|ki|ku|',
        ']',
        '(-12[',
        '  |||',
        '  sa|si|su|',
        ']',
        '{F}{J}[',
        '  |||',
        '  ta|ti|tu|',
        ']',
      ]),
    ),
  );
  const sequences = new Map(prefix.sequences);
  assert.deepEqual(sequences.get('ka'), [['t'], ['q']]);
  assert.deepEqual(sequences.get('sa'), [['e', 'q']]);
  assert.deepEqual(sequences.get('ta'), [['f'], ['j'], ['q']]);
  const suffix = stageOf(importDvorakJ(dvorakJ('順に打鍵する配列', FJ_ALIASES, ['{F}[[', '  |||', '  ka|ki|ku|', ']'])));
  assert.deepEqual(new Map(suffix.sequences).get('ka'), [['q'], ['f']]);
  const simultaneous = stageOf(importDvorakJ(dvorakJ('同時に打鍵する配列', FJ_ALIASES, ['-shift[', '  |||', '  ka|ki|ku|', ']'])));
  assert.deepEqual(new Map(simultaneous.sequences).get('ka'), [['shift-l', 'q']]);
});

test('別名は定義の逆順に文字列として置き換え、値にカンマと別の別名を含められる', () => {
  const source = dvorakJ('同時に打鍵する配列', [
    '-option-input[',
    '  左 | -1E',
    '  右 | -1F',
    '  両手 | 左, 右',
    ']',
    '両手[',
    '  |||',
    '  き|く|け|',
    ']',
  ]);
  const { content } = kanaOf(importDvorakJ(source));
  assert.deepEqual(
    content.faces.map((face) => face.trigger),
    [['a'], ['s']],
  );
});

test('数字の段のスキャンコードを物理キーに読む', () => {
  assert.equal(dvorakJScanCode('02'), '1');
  assert.equal(dvorakJScanCode('0D'), '=');
  assert.equal(dvorakJScanCode('10'), 'q');
  assert.equal(dvorakJScanCode('73'), undefined);
});

test('語の登録のセルは、かなの定義では取り込まず注意に入れ、かなの音や記号の出力は取り込む', () => {
  const source = dvorakJ('同時に打鍵する配列', ['[', '  |||', '  あ|ぎゃ|ヴぁ|ー|', '  、。|トシ|水村|ふぁ|', '  「」|()|ヴァ|', ']']);
  const { content, warnings } = kanaOf(importDvorakJ(source));
  const outputs = Object.values(content.faces[0].outputs);
  for (const kept of ['あ', 'ぎゃ', 'ヴぁ', 'ー', '、。', 'ふぁ', '「」', '()', 'ヴァ']) assert.ok(outputs.includes(kept), kept);
  for (const dropped of ['トシ', '水村']) assert.ok(!outputs.includes(dropped), dropped);
  assert.ok(warnings.some((warning) => warning.includes('「トシ」') && warning.includes('語の登録')));
  assert.ok(warnings.some((warning) => warning.includes('「水村」') && warning.includes('語の登録')));
  assert.equal(warnings.length, 2);
  for (const word of ['トシ', 'ヒロシ', '水村', 'ユカ', '[]入左']) assert.equal(isWordRegistration(word), true, word);
  for (const other of ['あ', 'トシ'.slice(0, 1), 'ぎゃ', 'ー', '、。', '「」', '()', "''", 'ヴァ']) assert.equal(isWordRegistration(other), false, other);
});

test('紅皿のかな定義でも、語の登録のセルは取り込まず注意に入れる', () => {
  const source = ['[かなシフト無し]', 'あ,い,う,え,お', 'か,トシ,く,け,こ'].join('\n');
  const { content, warnings } = kanaOf(importBenizara(source, 'テスト'));
  assert.ok(!Object.values(content.faces[0].outputs).includes('トシ'));
  assert.ok(warnings.some((warning) => warning.includes('「トシ」')));
});

test('AutoHotkeyの送信の書式を含むセルは、出力を持たないセルとして読む', () => {
  const source = dvorakJ('同時に打鍵する配列', [
    '[',
    '  |||',
    '  あ|／{改行}|{vkF2}|^i|',
    '  +{End}{BS}|{Home}+{End}^c|い|{!}|',
    '  、{Enter}|{Space 3}|{Del 2}う|',
    ']',
  ]);
  const { content } = kanaOf(importDvorakJ(source));
  assert.deepEqual(content.faces[0].outputs, { q: 'あ', d: 'い', f: '!', z: '、', c: 'う' });
});

test('見出しの読み取りは、長い行や深い別名でも行の長さに対して線形で終わる', () => {
  const started = performance.now();
  for (const header of [
    `-${',-'.repeat(50000)}-`,
    '['.repeat(50000),
    `${'-1E'.repeat(50000)}[`,
    `${'{A}'.repeat(50000)}`,
    `-shift${'-shift'.repeat(30)}`,
    ' '.repeat(50000),
  ]) {
    const source = dvorakJ('同時に打鍵する配列', [
      '-option-input[',
      '  {A} | {A}{A}',
      ']',
      `${header}[`,
      '  |||',
      '  あ|い|う|',
      ']',
      '[',
      '  |||',
      '  き|く|け|',
      ']',
    ]);
    const { content } = kanaOf(importDvorakJ(source));
    assert.ok(content.faces.some((face) => face.trigger.length === 0));
  }
  assert.ok(performance.now() - started < 3000);
});

test('紅皿のかな定義は、面ごとのtriggerと出力を持つ面の形になる', () => {
  const { content, warnings } = kanaOf(importBenizara(BENIZARA_KANA, 'テスト'));
  assert.deepEqual(
    content.faces.map((face) => face.trigger),
    [[], ['thumb-l', 'thumb-r'], ['thumb-r']],
  );
  assert.deepEqual(content.faces[0], {
    trigger: [],
    inputRole: 'layer',
    outputs: {
      '1': 'あ',
      '2': 'い',
      '3': 'う',
      '4': 'え',
      '5': 'お',
      q: 'か',
      w: 'き',
      e: 'く',
      r: 'け',
      t: 'こ',
      a: 'さ',
      s: 'し',
      d: 'す',
      f: 'せ',
      g: 'そ',
      z: 'た',
      x: 'ち',
      c: 'つ',
      v: 'て',
      b: 'と',
    },
  });
  assert.deepEqual(content.faces[1], {
    trigger: ['thumb-l', 'thumb-r'],
    mode: 'simultaneous',
    triggerPersistence: 'single',
    inputRole: 'layer',
    outputs: { '1': 'が', '2': 'ぎ', '3': 'ぐ', '4': 'げ', '5': 'ご', q: 'だ', w: 'ぢ', e: 'づ', r: 'で', t: 'ど' },
  });
  assert.deepEqual(warnings, ['面「かな小指シフト」は対応する親指キーを決められないため無視しました']);
  const layout = buildFaceLayout('imported', content.name, content);
  assert.equal(layout.canonicalInputs.get('が')?.length, 1);
});

test('紅皿でかなとローマ字の面が混ざる定義は、ローマ字の面を選んだ段の形になり、かなの面は無視される', () => {
  const mixed = stageOf(
    importBenizara(
      [
        '[ローマ字シフト無し]',
        'a,b,c,d',
        'e,f,g,h',
        'i,j,k,l',
        'm,n,o,p',
        '[かなシフト無し]',
        'あ,い,う,え',
        'か,き,く,け',
        'さ,し,す,せ',
        'た,ち,つ,て',
        '[かな右親指シフト]',
        'が,ぎ,ぐ,げ',
      ].join('\n'),
    ),
  );
  assert.ok(!new Map(mixed.sequences).has('あ'));
  assert.ok(mixed.warnings.some((warning) => warning.includes('かなシフト無し')));
  assert.ok(mixed.warnings.some((warning) => warning.includes('かな右親指シフト')));
});

test('紅皿のローマ字面とUTF-16LEを読む', () => {
  const source = '[ローマ字シフト無し]\nｋ,ａ,Enter\nｓ,ｉ,ｕ\nｔ,ｅ,ｏ\nｎ,ｍ,ｙ';
  const bytes = Buffer.from(`\ufeff${source}`, 'utf16le');
  const decoded = decodeLayoutFile(bytes, 'benizara');
  const layout = stageOf(importBenizara(decoded));
  assert.equal(layout.rows[0].slice(0, 2), 'ka');
  assert.ok(layout.legends.some(([key, label]) => key === '3' && label === 'Enter'));
});

test('取り込んだ機能キーは凡例だけに残す', () => {
  const imported = stageOf(importBenizara('[ローマ字シフト無し]\na,Enter\nb,c\nd,e\nf,g'));
  const def: UserLayout = {
    id: 'imported',
    name: 'imported',
    rows: imported.rows,
    romaji: 'kunrei',
    sequences: imported.sequences,
    legends: imported.legends,
  };
  const layout = toLayout(def);
  assert.equal(layout.map.has('Enter'), false);
  assert.equal(layout.legends.get('2'), 'Enter');
});

test('拡張子から取り込み形式を選ぶ', () => {
  assert.equal(formatForFileName('layout.TXT'), 'dvorakj');
  assert.equal(formatForFileName('keyboard.vil'), 'vial');
  assert.equal(formatForFileName('NICOLA.bnz'), 'benizara');
  assert.equal(formatForFileName('settings.ini'), 'benizara');
  assert.equal(formatForFileName('layout.csv'), undefined);
});

test('対象の配列表がないファイルはエラーにする', () => {
  assert.throws(() => importDvorakJ('-option-input[\n{x} | -20\n]'), /配列表/);
  assert.throws(() => importBenizara('[かなシフト無し]\n;\n'), /配列表|出力/);
  assert.throws(() => importVial('{}'), /layout/);
});

test('かなの判定は、かなの文字だけを数える。中黒・長音・濁点の記号は数えない', () => {
  for (const kana of ['あ', 'ぁ', 'ゔ', 'ア', 'ァ', 'ヴ', 'ヺ', 'ゝ', 'ヽ', 'ん', 'ン']) assert.equal(hasKanaLetter(kana), true, kana);
  for (const other of ['・', 'ー', '゛', '゜', '゠', 'a', '漢', '、', '。', '1']) assert.equal(hasKanaLetter(other), false, other);
});

test('中黒を出力に含むローマ字の紅皿の定義が、段の形で取り込める', () => {
  const source = ['[ローマ字シフト無し]', 'a,b,・,ー', 'c,d,e,f', 'g,h,i,j', 'k,l,m,n'].join('\n');
  const layout = stageOf(importBenizara(source, 'テスト'));
  const sequences = new Map(layout.sequences);
  assert.deepEqual(sequences.get('・'), [['3']]);
  assert.deepEqual(sequences.get('ー'), [['4']]);
  assert.deepEqual(sequences.get('a'), [['1']]);
});

test('中黒だけでなくかなの文字も出力にある紅皿の定義は、今まで通りかなの定義になる', () => {
  const source = ['[かなシフト無し]', 'あ,い,・,ー', 'う,え,お,か', 'き,く,け,こ', 'さ,し,す,せ'].join('\n');
  const { content } = kanaOf(importBenizara(source, 'テスト'));
  assert.equal(content.faces[0]?.outputs['3'], '・');
});

const encode = (text: string) => new TextEncoder().encode(text);

const ROMAJI_DVORAKJ = [
  '-option-input[',
  '  {S} | +shift',
  ']',
  '[',
  '  |||',
  '  k|a|t|',
  '  s|i|u|',
  '  |||',
  ']',
  '({S}[',
  '  |||',
  '  g|z|d|',
  '  |||',
  '  |||',
  ']',
].join('\n');

const VIAL_ROWS = [
  ['KC_1', 'KC_2', 'KC_3', 'KC_4', 'KC_5', 'KC_6', 'KC_7', 'KC_8', 'KC_9', 'KC_0', 'KC_MINS', 'KC_EQL'],
  ['KC_Q', 'KC_W', 'KC_E', 'KC_R', 'KC_T', 'KC_Y', 'KC_U', 'KC_I', 'KC_O', 'KC_P', 'KC_LBRC', 'KC_RBRC'],
  ['KC_A', 'KC_S', 'KC_D', 'KC_F', 'KC_G', 'KC_H', 'KC_J', 'KC_K', 'KC_L', 'KC_SCLN', 'KC_QUOT'],
  ['KC_Z', 'KC_X', 'KC_C', 'KC_V', 'KC_B', 'KC_N', 'KC_M', 'KC_COMMA', 'KC_DOT', 'KC_SLASH'],
];

test('ローマ字配列の画面の取り込みは、ローマ字の定義を段の形で返す', () => {
  const dvorakj = importRomajiLayoutFile('私の配列.txt', encode(ROMAJI_DVORAKJ));
  assert.ok(dvorakj.ok);
  assert.equal(dvorakj.layout.name, '私の配列');
  assert.deepEqual(new Map(dvorakj.layout.sequences).get('g'), [['space', 'q']]);

  const vial = importRomajiLayoutFile(
    'kbd.vil',
    encode(
      JSON.stringify({
        layout: [VIAL_ROWS],
        macro: [[['text', 'desu']]],
        combo: [
          ['KC_D', 'KC_S', 'KC_NO', 'KC_NO', 'M0'],
          ['MO(1)', 'KC_A', 'KC_NO', 'KC_NO', 'KC_B'],
        ],
      }),
    ),
  );
  assert.ok(vial.ok);
  assert.deepEqual(new Map(vial.layout.sequences).get('desu'), [['d', 's']]);
  assert.ok(vial.layout.warnings.some((warning) => warning.includes('MO(1)')));
});

test('ローマ字配列の画面の取り込みは、かなの定義にかな配列の画面へのリンクを付け、形式が分からないファイルを取り込まない', () => {
  const kana = importRomajiLayoutFile('かな.txt', encode(DVORAKJ_KANA));
  assert.ok(!kana.ok);
  assert.equal(kana.kanaLayout, true);
  const unknown = importRomajiLayoutFile('layout.csv', encode('a,b'));
  assert.ok(!unknown.ok);
  assert.match(unknown.message, /取り込める形式ではありません/);
  assert.equal(unknown.kanaLayout, undefined);
  const broken = importRomajiLayoutFile('x.vil', encode('{}'));
  assert.ok(!broken.ok);
  assert.match(broken.message, /Vial/);
});

test('かなを出力するVialの定義は、どちらの画面でも取り込まない', () => {
  const rows = VIAL_ROWS.map((row) => [...row]);
  const macro = [[['text', 'か']]];
  const source = JSON.stringify({ layout: [rows], macro, combo: [['KC_D', 'KC_S', 'KC_NO', 'KC_NO', 'M0']] });
  const romaji = importRomajiLayoutFile('kbd.vil', encode(source));
  assert.ok(!romaji.ok);
  assert.match(romaji.message, /かなを出力するVial/);
  assert.equal(romaji.kanaLayout, undefined);
  const kana = importKanaLayoutFile('kbd.vil', encode(source));
  assert.ok(!kana.ok);
  assert.equal(kana.romajiLayout, undefined);
});

test('かな配列の画面の取り込みは、かなを含まない定義にローマ字配列の画面へのリンクを付ける', () => {
  const romaji = importKanaLayoutFile('romaji.txt', encode(ROMAJI_DVORAKJ));
  assert.ok(!romaji.ok);
  assert.match(romaji.message, /かな配列ではない/);
  assert.equal(romaji.romajiLayout, true);
  const vial = importKanaLayoutFile('kbd.vil', encode(JSON.stringify({ layout: [VIAL_ROWS] })));
  assert.ok(!vial.ok);
  assert.equal(vial.romajiLayout, true);
  const unknown = importKanaLayoutFile('layout.csv', encode('a,b'));
  assert.ok(!unknown.ok);
  assert.equal(unknown.romajiLayout, undefined);
  assert.ok(importKanaLayoutFile('かな.txt', encode(DVORAKJ_KANA)).ok);
});

test('取り込んだ段の形を自作の配列として保存しても、取り込み直後の配列と打鍵列が一致する', () => {
  const imported = stageOf(importDvorakJ(ROMAJI_DVORAKJ, '取り込み'));
  const created = createUserLayout([], () => 'user-x', contentOfImported(imported, 'kunrei'));
  assert.ok(created.ok);
  const saved = created.layouts[0] as StageUserLayout;
  assert.deepEqual(saved.rows, imported.rows);
  assert.deepEqual(saved.sequences, imported.sequences);
  assert.deepEqual(saved.legends, imported.legends);
  const direct = toLayout({
    id: 'user-x',
    name: '取り込み',
    rows: imported.rows,
    romaji: 'kunrei',
    sequences: imported.sequences,
    legends: imported.legends,
  });
  const stored = toLayout(saved);
  assert.deepEqual([...stored.map], [...direct.map]);
  assert.deepEqual([...stored.canonicalInputs], [...direct.canonicalInputs]);
});
