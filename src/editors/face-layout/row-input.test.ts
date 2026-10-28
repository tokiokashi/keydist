import assert from 'node:assert/strict';
import test from 'node:test';
import type { DraftFace } from '#input/layouts/face-layout-edit.ts';
import { buildGeometry, DEFAULT_FINGER_ASSIGNMENT, JIS_FINGER_ASSIGNMENT } from '#input/shapes/geometry.ts';
import { nextOutputKey } from './face-editing.ts';
import { applyRowOutputs, figureRowKeys, formatRowText, hasQuoteOutput, parseRowText, rowOutputs } from './row-input.ts';

const ansiKeys = [...buildGeometry('row-staggered', DEFAULT_FINGER_ASSIGNMENT).keys.keys()];
const jisKeys = [...buildGeometry('jis-row-staggered', JIS_FINGER_ASSIGNMENT).keys.keys()];

const parsed = (text: string) => {
  const result = parseRowText(text);
  assert.ok(result.ok, `${text} を読めること`);
  return result.outputs;
};

test('段のキーは、図にあり面の上の位置を持つキーを行ごとに列の小さい順に並べる', () => {
  const rows = figureRowKeys(ansiKeys, 4);
  assert.deepEqual(rows[0], ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=']);
  assert.deepEqual(rows[2]?.slice(0, 3), ['a', 's', 'd']);
  assert.equal(rows[3]?.at(-1), '/');
});

for (const [name, keys] of [
  ['ANSI', ansiKeys],
  ['JIS', jisKeys],
] as const) {
  test(`${name}の図で、段のキーの並びは出力欄のEnterが進む順と同じ`, () => {
    const order = figureRowKeys(keys, 4).flat();
    const walked: string[] = [order[0]!];
    for (;;) {
      const next = nextOutputKey(keys, walked.at(-1)!, []);
      if (next === undefined) break;
      walked.push(next);
    }
    assert.deepEqual(walked, order);
  });
}

test('1文字ずつ並べた欄は、キーごとの出力に読む。半角スペースは空きキー', () => {
  assert.deepEqual(parsed('あ い'), ['あ', '', 'い']);
});

test('末尾の半角スペースは空きキーとして扱い、出力には残さない', () => {
  assert.deepEqual(parsed('あい  '), ['あ', 'い']);
  assert.deepEqual(parsed('   '), []);
  assert.deepEqual(parsed(''), []);
});

test('二重引用符で囲んだ文字列は、2文字以上でも1キーの出力になる', () => {
  assert.deepEqual(parsed('あ"きゃ"い'), ['あ', 'きゃ', 'い']);
  assert.deepEqual(parsed('"a b"'), ['a b']);
});

test('囲みが隣り合っても、それぞれ別の出力に読む', () => {
  assert.deepEqual(parsed('"きゃ""きゅ"'), ['きゃ', 'きゅ']);
  assert.deepEqual(parsed('"きゃ"い"きゅ"'), ['きゃ', 'い', 'きゅ']);
});

test('囲んだ1文字は読み取りでは受け付ける', () => {
  assert.deepEqual(parsed('"あ"い'), ['あ', 'い']);
});

test('閉じていない囲みは誤り', () => {
  assert.deepEqual(parseRowText('"あ'), { ok: false, reason: 'unclosed' });
  assert.deepEqual(parseRowText('あ"'), { ok: false, reason: 'unclosed' });
  assert.deepEqual(parseRowText('"あ"い"'), { ok: false, reason: 'unclosed' });
});

test('囲みの外の空の囲みは誤り', () => {
  assert.deepEqual(parseRowText('あ""い'), {
    ok: false,
    reason: 'empty-quote',
  });
});

test('コードポイントで1文字として数える', () => {
  assert.deepEqual(parsed('𠮷あ'), ['𠮷', 'あ']);
});

test('出力を欄に書き戻す時、2文字以上の出力だけを囲む', () => {
  assert.equal(formatRowText(['あ', '', 'きゃ', 'きゅ', 'う']), 'あ "きゃ""きゅ"う');
  assert.equal(formatRowText(['あ', '']), 'あ');
  assert.equal(formatRowText([]), '');
});

test('二重引用符を含む出力は、囲んでそのまま並べて表示し、欄からは直せない扱いにする', () => {
  assert.equal(formatRowText(['あ', '"', 'a"b']), 'あ""""a"b"');
  assert.equal(hasQuoteOutput(['あ', '"']), true);
  assert.equal(hasQuoteOutput(['あ', 'きゃ', '']), false);
});

test('二重引用符を含まない出力は、欄と出力を行き来しても変わらない', () => {
  const samples = [
    ['あ', '', 'い'],
    ['きゃ', 'きゅ', 'しゅ', 'え'],
    ['𠮷', '', '', 'お'],
    ['あ', 'a b'],
  ];
  for (const outputs of samples) assert.deepEqual(parsed(formatRowText(outputs)), outputs);
  for (const text of ['あ "きゃ""きゅ"い', 'あ"a b"']) assert.equal(formatRowText(parsed(text)), text.trimEnd());
});

test('段の出力を置き換える時、欄の末尾より右のキーの出力を消し、段に属さないキーには触れない', () => {
  const face: DraftFace = {
    trigger: [],
    inputRole: 'layer',
    outputs: { q: 'あ', w: 'い', e: 'う', backquote: 'ー' },
  };
  const keys = ['q', 'w', 'e', 'r'];
  assert.deepEqual(rowOutputs(face, keys), ['あ', 'い', 'う', '']);
  const next = applyRowOutputs(face, keys, ['お', '', 'きゃ']);
  assert.deepEqual(next.outputs, { q: 'お', e: 'きゃ', backquote: 'ー' });
  assert.deepEqual(applyRowOutputs(face, keys, []).outputs, {
    backquote: 'ー',
  });
});

test('上限を超えた分は置かない', () => {
  const face: DraftFace = { trigger: [], inputRole: 'layer', outputs: {} };
  assert.deepEqual(applyRowOutputs(face, ['q', 'w'], ['あ', 'い', 'う']).outputs, { q: 'あ', w: 'い' });
});
