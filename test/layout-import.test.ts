import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeLayoutFile,
  formatForFileName,
  importBenizara,
  importDvorakJ,
  importVial,
} from '../src/layout-import.ts';
import { CUSTOM_COMBOS } from '../src/layouts/combos-custom.ts';
import { toLayout, type UserLayout } from '#input/layouts/user-layouts.ts';

const vialKeyCode = (key: string): string => {
  if (key === '-') return 'KC_MINS';
  if (key === ',') return 'KC_COMMA';
  return `KC_${key.toUpperCase()}`;
};

test('Vialの第0層・通常キー出力・マクロ出力のコンボを読む', () => {
  const layout = importVial(JSON.stringify({
    layout: [[
      ['KC_1', 'KC_2', 'KC_3', 'KC_4', 'KC_5', 'KC_6', 'KC_7', 'KC_8', 'KC_9', 'KC_0', 'KC_MINS', 'KC_ENTER'],
      ['KC_Q', 'KC_W', 'KC_E', 'KC_R', 'KC_T', 'KC_Y', 'KC_U', 'KC_I', 'KC_O', 'KC_P', 'KC_LBRC', 'KC_RBRC'],
      ['KC_A', 'KC_S', 'KC_D', 'KC_F', 'KC_G', 'KC_H', 'KC_J', 'KC_K', 'KC_L', 'KC_SCOLON', 'KC_QUOTE'],
      ['KC_Z', 'KC_X', 'KC_C', 'KC_V', 'KC_B', 'KC_N', 'KC_M', 'KC_COMMA', 'KC_DOT', 'KC_SLASH'],
    ]],
    macro: [[['text', 'desu']], [['tap', 'KC_K', 'KC_A']]],
    combo: [
      ['KC_D', 'KC_S', 'KC_NO', 'KC_NO', 'M0'],
      ['KC_K', 'KC_A', 'KC_NO', 'KC_NO', 'KC_DOT'],
      ['KC_K', 'KC_A', 'KC_NO', 'KC_NO', 'M1'],
      ['MO(1)', 'KC_A', 'KC_NO', 'KC_NO', 'KC_B'],
    ],
  }));
  assert.equal(layout.rows[1].slice(0, 2), 'qw');
  assert.deepEqual(layout.sequences.find(([output]) => output === 'desu'), ['desu', [['d', 's']]]);
  assert.deepEqual(layout.sequences.find(([output]) => output === '.'), ['.', [['k', 'a']]]);
  assert.deepEqual(layout.sequences.find(([output]) => output === 'ka'), ['ka', [['k', 'a']]]);
  assert.ok(layout.legends.some(([key, label]) => key === '=' && label === 'KC_ENTER'));
  assert.ok(!layout.sequences.some(([output]) => output === 'KC_ENTER'));
  assert.ok(layout.warnings.some((warning) => warning.includes('MO(1)')));
  assert.equal(layout.direct, false);
});

test('既存のVial由来コンボ73件を全件取り込める', () => {
  const data = {
    layout: [[
      ['KC_1', 'KC_2', 'KC_3', 'KC_4', 'KC_5', 'KC_6', 'KC_7', 'KC_8', 'KC_9', 'KC_0', 'KC_MINS', 'KC_EQL'],
      ['KC_Q', 'KC_W', 'KC_E', 'KC_R', 'KC_T', 'KC_Y', 'KC_U', 'KC_I', 'KC_O', 'KC_P', 'KC_LBRC', 'KC_RBRC'],
      ['KC_A', 'KC_S', 'KC_D', 'KC_F', 'KC_G', 'KC_H', 'KC_J', 'KC_K', 'KC_L', 'KC_SCLN', 'KC_QUOT'],
      ['KC_Z', 'KC_X', 'KC_C', 'KC_V', 'KC_B', 'KC_N', 'KC_M', 'KC_COMMA', 'KC_DOT', 'KC_SLASH'],
    ]],
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

test('DvorakJの基底面と同時打鍵面を読む', () => {
  const source = [
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
  const layout = importDvorakJ(source);
  assert.deepEqual(layout.sequences.find(([output]) => output === 'あ'), ['あ', [['a']]]);
  assert.deepEqual(layout.sequences.find(([output]) => output === 'が'), ['が', [['f', 'j', 'q']]]);
  assert.deepEqual(layout.sequences.find(([output]) => output === '、'), ['、', [['space', 'q']]]);
  assert.ok(!layout.sequences.some(([output]) => output === '←' || output === '→'));
  assert.ok(layout.legends.some(([key, label]) => key === 'w' && label === '{←}'));
  assert.ok(layout.legends.some(([key, label]) => key === 'q' && label === '、{Enter}'));
  assert.ok(layout.warnings.some((warning) => warning.includes('(+23, ({S}+23[')));
  assert.ok(layout.warnings.some((warning) => warning.includes('エイリアス「Z」')));
  assert.ok(layout.warnings.some((warning) => warning.includes('({F}[') && warning.includes('セルがない')));
  assert.equal(layout.direct, true);
});

test('DvorakJと紅皿の面内容からローマ字・かなを判定する', () => {
  const roman = importDvorakJ('[\n  ka|si|tu|ne|\n  q|w|e|r|\n]');
  assert.equal(roman.direct, false);

  const kana = importBenizara([
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
    '[かな小指シフト]',
    'x,x,x,x,x',
  ].join('\n'));
  assert.equal(kana.direct, true);
  assert.deepEqual(kana.sequences.find(([output]) => output === 'が'), ['が', [['thumb-l', 'space', '1']]]);
  assert.deepEqual(kana.warnings, ['面「かな小指シフト」は対応する親指キーを決められないため無視した']);

  const mixed = importBenizara([
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
  ].join('\n'));
  assert.equal(mixed.direct, false);
  assert.ok(!new Map(mixed.sequences).has('あ'));
  assert.ok(mixed.warnings.some((warning) => warning.includes('かなシフト無し')));
  assert.ok(mixed.warnings.some((warning) => warning.includes('かな右親指シフト')));
});

test('紅皿のローマ字面とUTF-16LEを読む', () => {
  const source = '[ローマ字シフト無し]\nｋ,ａ,Enter\nｓ,ｉ,ｕ\nｔ,ｅ,ｏ\nｎ,ｍ,ｙ';
  const bytes = Buffer.from('\ufeff' + source, 'utf16le');
  const decoded = decodeLayoutFile(bytes, 'benizara');
  const layout = importBenizara(decoded);
  assert.equal(layout.direct, false);
  assert.equal(layout.rows[0].slice(0, 2), 'ka');
  assert.ok(layout.legends.some(([key, label]) => key === '3' && label === 'Enter'));
});

test('取り込んだ機能キーは凡例だけに残す', () => {
  const imported = importBenizara('[ローマ字シフト無し]\na,Enter\nb,c\nd,e\nf,g');
  const def: UserLayout = {
    id: 'imported',
    name: 'imported',
    rows: imported.rows,
    romaji: 'kunrei',
    sequences: imported.sequences,
    legends: imported.legends,
    direct: imported.direct,
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
  assert.throws(() => importVial('{}'), /layout/);
});
