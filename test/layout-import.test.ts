import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importDvorakJ, importVial } from '../src/layout-import.ts';

test('Vial の第0層・通常キー出力・マクロ出力のコンボを読む', () => {
  const layout = importVial(JSON.stringify({
    layout: [[
      ['KC_1', 'KC_2'],
      ['KC_Q', 'KC_W'],
      ['KC_A', 'KC_S'],
      ['KC_Z', 'KC_X'],
    ]],
    macro: [[['text', 'desu']], [['tap', 'KC_K', 'KC_A']]],
    combo: [
      ['KC_D', 'KC_S', 'KC_NO', 'KC_NO', 'M0'],
      ['KC_K', 'KC_A', 'KC_NO', 'KC_NO', 'KC_DOT'],
      ['KC_K', 'KC_A', 'KC_NO', 'KC_NO', 'M1'],
    ],
  }));
  assert.equal(layout.rows[1].slice(0, 2), 'qw');
  assert.deepEqual(layout.sequences, [
    ['desu', [['d', 's']]],
    ['.', [['k', 'a']]],
    ['ka', [['k', 'a']]],
  ]);
  assert.equal(layout.direct, false);
});

test('DvorakJ の基底面と同時打鍵面を読む', () => {
  const layout = importDvorakJ(`
    /* コメント */
    [
      1|2|3|
      q|w|e|
      あ|い|う|
      z|x|c|
    ]
    -f-j
    [
      |||
      が|ぎ|ぐ|
      |||
      |||
    ]
  `);
  assert.deepEqual(layout.sequences.find(([output]) => output === 'あ'), ['あ', [['a']]]);
  assert.deepEqual(layout.sequences.find(([output]) => output === 'が'), ['が', [['f', 'j', 'q']]]);
  assert.equal(layout.direct, true);
});

test('対象の配列表がないファイルはエラーにする', () => {
  assert.throws(() => importDvorakJ('-option-input[\n{x} | -20\n]'), /配列表/);
  assert.throws(() => importVial('{}'), /layout/);
});
