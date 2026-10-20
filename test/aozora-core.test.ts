import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertNoMarkup, convertAozora, decodeAccentSeparation, extractBody, openingOf } from '../scripts/aozora-core.ts';

test('ルビ《》とルビの始まり｜を取り除き、ルビの付く本文の字は残す', () => {
  assert.equal(convertAozora('吾輩《わがはい》は一番｜獰悪《どうあく》な種族').text, '吾輩は一番獰悪な種族');
});

test('外字は面区点番号の表で字に直し、小書き片仮名ヒも直す', () => {
  const converted = convertAozora('※［＃「火＋（麈－鹿）」、第3水準1-87-40］と※［＃小書き片仮名ヒ、1-6-84］と※［＃「言＋墟のつくり」、第4水準2-88-74］');
  assert.equal(converted.text, '炷とㇶと譃');
  assert.equal(converted.gaijiConverted, 3);
  assert.equal(converted.gaijiRemoved, 0);
});

test('表に無い外字は、※と注ごと取り除いて数える', () => {
  const converted = convertAozora('あ※［＃「謎」、第3水準1-1-1］い');
  assert.equal(converted.text, 'あい');
  assert.equal(converted.gaijiRemoved, 1);
});

test('傍点・字下げ・下付き文字などの入力者注は、注だけを取り除く', () => {
  assert.equal(convertAozora('「［＃傍点］香一［＃傍点終わり］」と［＃ここから２字下げ］言う［＃ここで字下げ終わり］').text, '「香一」と言う');
  assert.equal(convertAozora('α１［＃「１」は下付き小文字］＝Ｔ').text, 'α１＝Ｔ');
  assert.equal(convertAozora('曾呂崎［＃「曾呂崎」は底本では「曾兄崎」］より').text, '曾呂崎より');
});

test('注の中で行が折れていても取り除く', () => {
  assert.equal(convertAozora('Ｔ［＃「\n２」は下付き小文字］で').text, 'Ｔで');
});

test('章見出しの行は行ごと取り除く', () => {
  const converted = convertAozora('［＃８字下げ］一［＃「一」は中見出し］\n\n　吾輩は猫である。\n［＃８字下げ］十一［＃「十一」は中見出し］\n　本文\n');
  assert.equal(converted.text, '\n　吾輩は猫である。\n　本文\n');
  assert.equal(converted.headingLinesRemoved, 2);
});

test('アクセント分解は、入れ子の注を先に取り除いてから元の字に直し、括弧を取り除く', () => {
  assert.equal(
    convertAozora('〔Quid aliud est mulier nisi amicitiae&［＃「〔amicitiae&〕」は底本では「amiticiae」］ inimica〕').text,
    'Quid aliud est mulier nisi amicitiæ inimica',
  );
  assert.equal(decodeAccentSeparation("e' a` u: c, n~ o^ A& s&"), 'é à ü ç ñ ô Å ß');
});

test('全角英字はそのまま残す', () => {
  assert.equal(convertAozora('Ｗは勿論').text, 'Ｗは勿論');
});

test('記法が残っていたら例外を投げる', () => {
  for (const text of ['あ［＃未知の注', 'あ※［い', 'あ《い', 'あ｜い', 'あ〔い']) {
    assert.throws(() => assertNoMarkup(text), /残っている/, text);
  }
  assert.throws(() => convertAozora('あ［＃注'), /残っている/);
});

test('先頭の説明と末尾の底本の情報を除いた本文を取る', () => {
  const raw = `題\r\n作者\r\n\r\n${'-'.repeat(20)}\r\n説明\r\n${'-'.repeat(20)}\r\n\r\n本文1\r\n本文2\r\n\r\n\r\n底本：「全集」\r\n入力：誰か\r\n`;
  assert.equal(extractBody(raw), '本文1\n本文2\n');
  assert.throws(() => extractBody('線が無い'), /区切る線/);
});

test('冒頭の範囲は、最初の「あったばかりである。」までで、その先を含まない', () => {
  const text = '吾輩は猫である。\n　感じがあったばかりである。掌の上で';
  assert.equal(openingOf(text), '吾輩は猫である。\n　感じがあったばかりである。');
  assert.throws(() => openingOf('無い'), /見つからない/);
});
