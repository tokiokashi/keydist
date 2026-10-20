import assert from 'node:assert/strict';
import test from 'node:test';
import {
  containsKanji,
  convertToReading,
  isCorrectionReading,
  isKanjiChar,
  katakanaToHiragana,
  listReadingWords,
  needsReading,
  withReadingCorrection,
  type ReadingToken,
} from './reading.ts';

const encoder = new TextEncoder();

/** 語の列を、原文の中で最初に現れる位置から作る。解析が返さない文字は語の間に残る。 */
function tokensOf(text: string, words: readonly (readonly [surface: string, reading: string | null, isUnknown?: boolean])[]): ReadingToken[] {
  const tokens: ReadingToken[] = [];
  let cursor = 0;
  for (const [surface, reading, isUnknown = false] of words) {
    const index = text.indexOf(surface, cursor);
    assert.ok(index >= 0, `${surface} が原文に無い`);
    const byteStart = encoder.encode(text.slice(0, index)).length;
    tokens.push({ surface, byteStart, byteEnd: byteStart + encoder.encode(surface).length, reading, isUnknown });
    cursor = index + surface.length;
  }
  return tokens;
}

test('漢字を含む語を、読みのひらがなに置き換える', () => {
  const text = '今日は良い天気です';
  const tokens = tokensOf(text, [
    ['今日', 'キョウ'],
    ['は', 'ハ'],
    ['良い', 'ヨイ'],
    ['天気', 'テンキ'],
    ['です', 'デス'],
  ]);
  const result = convertToReading(text, tokens);
  assert.equal(result.text, 'きょうはよいてんきです');
  assert.equal(result.replacedWords, 3);
});

test('かな・英数字・記号の語は、辞書が読みを返しても置き換えない', () => {
  const text = 'ABC１２３、あ。';
  const tokens = tokensOf(text, [
    ['ABC', 'ABC'],
    ['１２３', 'イチニサン'],
    ['、', '、'],
    ['あ', 'ア'],
    ['。', '。'],
  ]);
  assert.equal(convertToReading(text, tokens).text, text);
});

test('未知語・読みが無い語・読みがカタカナでない語は、表記のまま残す', () => {
  const text = '𠮷野家と謎と々';
  const tokens = tokensOf(text, [
    ['𠮷', 'ヨシ', true],
    ['野家', null],
    ['と', 'ト'],
    ['謎', 'ナゾ-', false],
    ['と', 'ト'],
    ['々', '々'],
  ]);
  const result = convertToReading(text, tokens);
  assert.equal(result.text, text);
  assert.equal(result.replacedWords, 0);
});

test('解析が返さない半角の空白・改行・タブ・制御文字は、語の間にそのまま残る', () => {
  const text = '今日 は\t雨\nです\u0001終わり\u000b明日';
  const tokens = tokensOf(text, [
    ['今日', 'キョウ'],
    ['は', 'ハ'],
    ['雨', 'アメ'],
    ['です', 'デス'],
    ['終わり', 'オワリ'],
    ['明日', 'アシタ'],
  ]);
  assert.equal(convertToReading(text, tokens).text, 'きょう は\tあめ\nです\u0001おわり\u000bあした');
});

test('先頭と末尾の語の外の文字も残す', () => {
  const text = '  漢字  ';
  assert.equal(convertToReading(text, tokensOf(text, [['漢字', 'カンジ']])).text, '  かんじ  ');
  assert.equal(convertToReading('', []).text, '');
  assert.equal(convertToReading('あい', []).text, 'あい');
});

test('絵文字や半角カナを挟んでも、語のバイト位置で原文を切る', () => {
  const text = 'ｱｲ😀今日𠮷野家';
  const tokens = tokensOf(text, [
    ['ｱｲ', null],
    ['😀', null],
    ['今日', 'キョウ'],
    ['𠮷', null, true],
    ['野家', 'ヤケ'],
  ]);
  assert.equal(convertToReading(text, tokens).text, 'ｱｲ😀きょう𠮷やけ');
});

test('先頭のBOMも原文の文字として残す', () => {
  const text = '\ufeff今日';
  assert.equal(
    convertToReading(
      text,
      tokensOf(text, [
        ['\ufeff', null, true],
        ['今日', 'キョウ'],
      ]),
    ).text,
    '\ufeffきょう',
  );
  assert.equal(convertToReading(text, tokensOf(text, [['今日', 'キョウ']])).text, '\ufeffきょう');
});

test('ヴを含む読みは ゔ になる', () => {
  const text = '書房';
  assert.equal(convertToReading(text, tokensOf(text, [['書房', 'ヴァ']])).text, 'ゔぁ');
  assert.equal(katakanaToHiragana('ヴァイオリン'), 'ゔぁいおりん');
  assert.equal(katakanaToHiragana('ニッポン'), 'にっぽん');
  assert.equal(katakanaToHiragana('ショーカイ'), 'しょーかい');
});

test('語の位置が原文と合わなければ例外を投げる', () => {
  const text = '今日は';
  const token = (overrides: Partial<ReadingToken>): ReadingToken => ({
    surface: '今日',
    byteStart: 0,
    byteEnd: 6,
    reading: 'キョウ',
    isUnknown: false,
    ...overrides,
  });
  assert.throws(() => convertToReading(text, [token({ surface: '明日' })]), /表記/);
  assert.throws(() => convertToReading(text, [token({ byteEnd: 100 })]), /位置/);
  assert.throws(() => convertToReading(text, [token({}), token({ byteStart: 3, byteEnd: 9, surface: '日は' })]), /位置/);
  // 文字の途中で切る位置は、UTF-8として読めないので例外になる
  assert.throws(() => convertToReading(text, [token({ byteStart: 1, byteEnd: 6, surface: '今日' })]));
});

test('漢字の判定はCJK統合漢字と々で、かなや記号は漢字でない', () => {
  assert.equal(isKanjiChar('漢'), true);
  assert.equal(isKanjiChar('々'), true);
  assert.equal(isKanjiChar('𠮷'), true);
  for (const char of ['あ', 'ア', 'ー', '〆', 'A', '１', '、', 'ヶ']) assert.equal(isKanjiChar(char), false, char);
  assert.equal(containsKanji('あい漢う'), true);
  assert.equal(containsKanji('あいう'), false);
});

test('読みに直す対象は、漢字を含む日本語のテキストだけ', () => {
  assert.equal(needsReading('今日は', 'ja'), true);
  assert.equal(needsReading('あいう', 'ja'), false);
  assert.equal(needsReading('今日', 'en'), false);
  assert.equal(needsReading('hello', 'en'), false);
});

test('直しは表記が一致する語すべての読みを置き換え、辞書の読みの有無を問わない', () => {
  const text = '今日と今日と謎と々と花';
  const tokens = tokensOf(text, [
    ['今日', 'キョウ'],
    ['と', 'ト'],
    ['今日', 'コンニチ'],
    ['と', 'ト'],
    ['謎', null, true],
    ['と', 'ト'],
    ['々', '々'],
    ['と', 'ト'],
    ['花', 'ハナ'],
  ]);
  const result = convertToReading(text, tokens, { 今日: 'こんにち', 謎: 'なぞ', 々: 'ぞう' });
  assert.equal(result.text, 'こんにちとこんにちとなぞとぞうとはな');
  assert.equal(result.replacedWords, 5);
  assert.deepEqual(result.appliedCorrections, [
    { surface: '々', reading: 'ぞう' },
    { surface: '今日', reading: 'こんにち' },
    { surface: '謎', reading: 'なぞ' },
  ]);
});

test('直しは語の区切りを変えず、直していない表記と漢字を含まない語には当たらない', () => {
  const text = '今日は１２３';
  const tokens = tokensOf(text, [
    ['今日', 'キョウ'],
    ['は', 'ハ'],
    ['１２３', 'イチニサン'],
  ]);
  const result = convertToReading(text, tokens, { は: 'わ', '１２３': 'いちにさん', 明日: 'あす' });
  assert.equal(result.text, 'きょうは１２３');
  assert.deepEqual(result.appliedCorrections, []);
});

test('テキストに現れない表記の直しは、当たった直しに含めない', () => {
  const text = '今日';
  const result = convertToReading(text, tokensOf(text, [['今日', 'キョウ']]), { 明日: 'あす' });
  assert.equal(result.text, 'きょう');
  assert.deepEqual(result.appliedCorrections, []);
});

test('打てる読みはひらがなと長音だけで、1文字以上', () => {
  for (const reading of ['きょう', 'らーめん', 'ゔぁ']) assert.equal(isCorrectionReading(reading), true, reading);
  for (const reading of ['', 'キョウ', 'kyou', '今日', 'きょう ', 'き・ょ']) assert.equal(isCorrectionReading(reading), false, reading);
});

test('listReadingWords: 漢字を含む語を表記ごとにまとめ、辞書の読みを出現の多い順に持つ', () => {
  const text = '日本と日本と日本と何';
  const tokens = tokensOf(text, [
    ['日本', 'ニッポン'],
    ['と', 'ト'],
    ['日本', 'ニホン'],
    ['と', 'ト'],
    ['日本', 'ニホン'],
    ['と', 'ト'],
    ['何', null, true],
  ]);
  assert.deepEqual(listReadingWords(tokens), [
    { surface: '日本', count: 3, dictionaryReadings: ['にほん', 'にっぽん'] },
    { surface: '何', count: 1, dictionaryReadings: [] },
  ]);
});

test('withReadingCorrection: 足す・差し替える・消す。変化が無ければ同じ参照', () => {
  const none = {};
  const one = withReadingCorrection(none, '今日', 'こんにち');
  assert.deepEqual(one, { 今日: 'こんにち' });
  assert.equal(withReadingCorrection(one, '今日', 'こんにち'), one);
  assert.deepEqual(withReadingCorrection(one, '今日', 'きょう'), { 今日: 'きょう' });
  assert.deepEqual(withReadingCorrection(one, '今日', undefined), {});
  assert.equal(withReadingCorrection(none, '今日', undefined), none);
});
