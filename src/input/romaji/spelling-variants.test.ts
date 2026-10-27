import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRomajiTable, tableForRule } from './rules.ts';
import { hasMultiKanaHeading, romajiSpellingUnits } from './spelling-variants.ts';

const spellingsOf = (text: string, rule = 'kunrei') => romajiSpellingUnits(text, tableForRule(rule))?.map((unit) => [unit.kana, ...unit.spellings]);

test('組み込みの規則で、まとめた綴りを持つのはAZIKとJLODだけ', () => {
  assert.deepEqual(
    ['kunrei', 'qwerty', 'oonishi', 'tomisuke', 'azik', 'jlod'].filter((rule) => hasMultiKanaHeading(tableForRule(rule))),
    ['azik', 'jlod'],
  );
  assert.equal(romajiSpellingUnits('かんた', tableForRule('azik')), undefined);
  assert.equal(romajiSpellingUnits('かんた', tableForRule('jlod')), undefined);
});

test('2文字以上のかなをまとめる見出しを書いた自作の規則は、表を使わない。拗音の形の見出しは使える', () => {
  const grouped = buildRomajiTable({ id: 'c', name: 'c', base: 'kunrei', overrides: { ありがとう: 'ar' }, generateSokuon: true });
  assert.equal(hasMultiKanaHeading(grouped), true);
  const youon = buildRomajiTable({ id: 'c', name: 'c', base: 'kunrei', overrides: { てぃ: 'ti', ふぁ: 'fa' }, generateSokuon: true });
  assert.equal(hasMultiKanaHeading(youon), false);
});

test('表にあるかなは、規則の綴りを先頭に、表の綴りを足す', () => {
  assert.deepEqual(spellingsOf('しちつふじ'), [
    ['し', 'si', 'shi'],
    ['ち', 'ti', 'chi'],
    ['つ', 'tu', 'tsu'],
    ['ふ', 'hu', 'fu'],
    ['じ', 'zi', 'ji'],
  ]);
  // 規則が表の片方を使っていれば、それが先頭になる。
  assert.deepEqual(spellingsOf('しじ', 'qwerty'), [
    ['し', 'si', 'shi'],
    ['じ', 'ji', 'zi'],
  ]);
  assert.deepEqual(spellingsOf('しゃ', 'oonishi'), [['しゃ', 'sha', 'sya']]);
});

test('拗音は、sy・shとty・chとzy・jの両方を受け付ける', () => {
  assert.deepEqual(spellingsOf('しゃしゅしょしぇ'), [
    ['しゃ', 'sya', 'sha'],
    ['しゅ', 'syu', 'shu'],
    ['しょ', 'syo', 'sho'],
    ['しぇ', 'sye', 'she'],
  ]);
  assert.deepEqual(spellingsOf('ちゃちゅちょちぇ', 'qwerty'), [
    ['ちゃ', 'cha', 'tya'],
    ['ちゅ', 'chu', 'tyu'],
    ['ちょ', 'cho', 'tyo'],
    ['ちぇ', 'che', 'tye'],
  ]);
  assert.deepEqual(spellingsOf('じゃじゅじょじぇ'), [
    ['じゃ', 'zya', 'ja'],
    ['じゅ', 'zyu', 'ju'],
    ['じょ', 'zyo', 'jo'],
    ['じぇ', 'zye', 'je'],
  ]);
});

test('表に無いかなは、規則の綴りだけを受け付ける', () => {
  assert.deepEqual(spellingsOf('かをりゃぢ'), [
    ['か', 'ka'],
    ['を', 'wo'],
    ['りゃ', 'rya'],
    ['ぢ', 'di'],
  ]);
  assert.deepEqual(spellingsOf('ー、。'), [
    ['ー', '-'],
    ['、', ','],
    ['。', '.'],
  ]);
});

test('促音は、次のかなの受け付ける綴りの最初の文字を重ねた形と、規則の綴りを受け付ける', () => {
  assert.deepEqual(spellingsOf('っしっちっつ'), [
    ['っし', 'ssi', 'sshi'],
    ['っち', 'tti', 'cchi'],
    ['っつ', 'ttu', 'ttsu'],
  ]);
  assert.deepEqual(spellingsOf('っしゃ', 'qwerty'), [['っしゃ', 'ssha', 'ssya']]);
  assert.deepEqual(spellingsOf('っか'), [['っか', 'kka']]);
});

test('「ん」は、次のかなの綴りがどれも母音・y・n以外の英字で始まる時だけn1打を受け付ける', () => {
  assert.deepEqual(spellingsOf('んか'), [
    ['ん', 'nn', 'n'],
    ['か', 'ka'],
  ]);
  assert.deepEqual(spellingsOf('んし'), [
    ['ん', 'nn', 'n'],
    ['し', 'si', 'shi'],
  ]);
  assert.deepEqual(spellingsOf('んっか'), [
    ['ん', 'nn', 'n'],
    ['っか', 'kka'],
  ]);
  for (const next of ['あ', 'や', 'な', 'ん', 'にゃ']) {
    assert.deepEqual(spellingsOf(`ん${next}`)?.[0], ['ん', 'nn'], next);
  }
  // 記号・表の外の文字の前と、文の最後。
  for (const next of ['、', '。', 'ー', 'a']) {
    assert.deepEqual(spellingsOf(`ん${next}`)?.[0], ['ん', 'nn'], next);
  }
  assert.deepEqual(spellingsOf('かん')?.[1], ['ん', 'nn']);
});
