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
  isDashSeparatedHeader,
  type ImportedDefinition,
  type ImportedLayout,
} from './import.ts';
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
  assert.ok(result.warnings.some((warning) => warning.includes('(+23, ({S}+23[')));
  assert.ok(result.warnings.some((warning) => warning.includes('エイリアス「Z」')));
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

const DASH_FACE = ['-f-j', '[', '  |||', '  が|ぎ|ぐ|', ']'];

test('ハイフン区切りの見出しの面は、かなの定義では取り込まずに注意へ入れる', () => {
  const source = [
    '-option-input[',
    '  {F} | +21',
    '  {J} | +24',
    ']',
    '[',
    '  |||',
    '  き|く|け|',
    ']',
    ...DASH_FACE,
    '({F}[',
    '  |||',
    '  ぎ|ぐ|げ|',
    ']',
  ].join('\n');
  const { content, warnings } = kanaOf(importDvorakJ(source));
  assert.deepEqual(
    content.faces.map((face) => face.trigger),
    [[], ['f']],
  );
  assert.ok(warnings.some((warning) => warning.includes('「-f-j」') && warning.includes('取り込みませんでした')));
});

test('ハイフン区切りの見出しの面にだけかながある定義は、かなの定義と判定され、その面は注意に入る', () => {
  const source = ['-option-input[', '  {F} | +21', '  {J} | +24', ']', '[', '  |||', '  q|w|e|', ']', ...DASH_FACE].join('\n');
  assert.throws(() => importDvorakJ(source), /混在/);
  const onlyKana = ['-option-input[', '  {F} | +21', '  {J} | +24', ']', '[', '  |||', '  1|2|3|', ']', ...DASH_FACE].join('\n');
  const { content, warnings } = kanaOf(importDvorakJ(onlyKana));
  assert.deepEqual(
    content.faces.map((face) => face.trigger),
    [[]],
  );
  assert.ok(warnings.some((warning) => warning.includes('「-f-j」')));
});

test('ハイフン区切りの見出しの面は、段の形（ローマ字）でも取り込まずに注意へ入れる', () => {
  const source = [
    '-option-input[',
    '  {F} | +21',
    '  {J} | +24',
    ']',
    '[',
    '  |||',
    '  q|w|e|',
    ']',
    ...DASH_FACE.map((line) => line.replace(/[がぎぐ]/g, 'a')),
  ].join('\n');
  const layout = stageOf(importDvorakJ(source));
  assert.equal(new Map(layout.sequences).has('a'), false);
  assert.equal(new Map(layout.sequences).has('q'), true);
  assert.ok(layout.warnings.some((warning) => warning.includes('「-f-j」') && warning.includes('取り込みませんでした')));
});

test('ハイフン区切りの見出しの面は、かなかローマ字かの判定には含める', () => {
  const source = ['-option-input[', '  {F} | +21', '  {J} | +24', ']', '[', '  |||', '  q|w|e|', ']', ...DASH_FACE].join('\n');
  assert.throws(() => importDvorakJ(source), /混在/);
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

test('見出しの区切り判定は、正規表現を使わない参照の実装と同じ文字列に一致する', () => {
  // 正規表現を使わない参照の実装。先頭が - で、残りを - で分けた区切りのうち、最後以外が空でなく、
  // 区切りが1つだけなら空でないこと
  const reference = (text: string): boolean => {
    if (!text.startsWith('-')) return false;
    const parts = text.slice(1).split('-');
    const last = parts.pop() ?? '';
    return parts.every((part) => part !== '') && (parts.length > 0 || last !== '');
  };
  const samples = ['-', '--', '-a', '-a-', '-a--', '--a', '-a-b', '-f-j', '-f-j-', '-,-,', '-a-b-c', 'a-b', '', '-a b', '-\n', '-a-\n-', '- -'];
  for (const sample of samples) {
    assert.equal(isDashSeparatedHeader(sample), reference(sample), JSON.stringify(sample));
  }
  // 短い文字列を全部試す
  const alphabet = ['-', 'a', ','];
  const walk = (prefix: string, depth: number): void => {
    assert.equal(isDashSeparatedHeader(prefix), reference(prefix), JSON.stringify(prefix));
    if (depth === 0) return;
    for (const c of alphabet) walk(prefix + c, depth - 1);
  };
  walk('', 8);
});

test('見出しの区切り判定は、長い攻撃文字列でもすぐに終わる', () => {
  const started = performance.now();
  assert.equal(isDashSeparatedHeader(`-${',-'.repeat(50000)}-`), false);
  assert.equal(isDashSeparatedHeader(`-${','.repeat(50000)}!-`), true);
  assert.equal(isDashSeparatedHeader(`-${',-'.repeat(50000)}-x--`), false);
  assert.equal(isDashSeparatedHeader(`-${'a-'.repeat(50000)}-`), false);
  assert.ok(performance.now() - started < 1000);
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
