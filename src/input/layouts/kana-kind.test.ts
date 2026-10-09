import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyKanaOutput, kanaKindName } from './kana-kind.ts';

test('かな1つ分の出力を、濁音・半濁音の有無と小書きの種類で分類する', () => {
  const name = (output: string) => classifyKanaOutput(output)?.name;
  assert.equal(name('きゃ'), '拗音');
  assert.equal(name('ぎゃ'), '濁音の拗音');
  assert.equal(name('ぴゅ'), '半濁音の拗音');
  assert.equal(name('ふぁ'), '外来音');
  assert.equal(name('ぐぇ'), '濁音の外来音');
  assert.equal(name('くゎ'), '合拗音');
  assert.equal(name('ぐゎ'), '濁音の合拗音');
  assert.equal(name('ゃ'), '小書き');
  assert.equal(name('が'), '濁音');
  assert.equal(name('ぱ'), '半濁音');
  // カタカナも同じ種類になる
  assert.equal(name('キャ'), '拗音');
  assert.equal(name('ヴ'), '濁音');
});

test('分類できない出力は種類を持たない', () => {
  for (const output of ['か', 'あ', 'ー', 'A', '゛', 'きっ', 'ゃゃ', 'きゃく', '']) {
    assert.equal(classifyKanaOutput(output), undefined, output);
  }
});

test('レイヤーが出す文字の種類の名前は、共通する小書きを添え、混ざる時は呼べない', () => {
  assert.equal(kanaKindName(['きゃ', 'しゃ']), '拗音（ゃ）');
  // 濁音・半濁音・清音が混ざっても、拗音どうしなら拗音で呼ぶ
  assert.equal(kanaKindName(['てゅ', 'ぴゅ']), '拗音（ゅ）');
  assert.equal(kanaKindName(['ぎゃ', 'でゅ']), '濁音の拗音');
  // 小書きの母音が揃わない時は、種類の名前だけ
  assert.equal(kanaKindName(['ょ', 'ぇ', 'ゅ']), '小書き');
  assert.equal(kanaKindName(['ぁ']), '小書き（ぁ）');
  // 種類が混ざる、分類できない出力を含む、出力が無い時は呼べない
  assert.equal(kanaKindName(['きゃ', 'くぁ']), undefined);
  assert.equal(kanaKindName(['が', 'ぱ']), undefined);
  assert.equal(kanaKindName(['きゃ', 'か']), undefined);
  assert.equal(kanaKindName([]), undefined);
});
