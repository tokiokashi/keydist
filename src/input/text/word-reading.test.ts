import assert from 'node:assert/strict';
import test from 'node:test';
import { convertToReading, type ReadingToken } from './reading.ts';
import { anchorTokens, listReadingOccurrences, resolveWordCorrections, withWordReadingCorrection, type WordReadingCorrection } from './word-reading.ts';

const encoder = new TextEncoder();

/** 語の列を、原文の中で最初に現れる位置から作る。解析が返さない文字は語の間に残る。 */
function tokensOf(text: string, words: readonly (readonly [surface: string, reading: string | null])[]): ReadingToken[] {
  const tokens: ReadingToken[] = [];
  let cursor = 0;
  for (const [surface, reading] of words) {
    const index = text.indexOf(surface, cursor);
    assert.ok(index >= 0, `${surface} が原文に無い`);
    const byteStart = encoder.encode(text.slice(0, index)).length;
    tokens.push({ surface, byteStart, byteEnd: byteStart + encoder.encode(surface).length, reading, isUnknown: false });
    cursor = index + surface.length;
  }
  return tokens;
}

const KYOU = ['今日', 'キョウ'] as const;
const WA = ['は', 'ハ'] as const;
const MARU = ['。', '。'] as const;

/** 「今日は晴。今日は雨。今日は雪。」のような、同じ表記が文ごとに現れるテキスト。 */
function days(...weathers: string[]): { text: string; tokens: ReadingToken[] } {
  const text = weathers.map((weather) => `今日は${weather}。`).join('');
  const tokens = tokensOf(
    text,
    weathers.flatMap((weather) => [KYOU, WA, [weather, 'ハレ'] as const, MARU]),
  );
  return { text, tokens };
}

function correction(order: number, before: string, after: string, reading = 'こんにち', surface = '今日'): WordReadingCorrection {
  return { surface, order, before, after, reading };
}

test('語の指定は、同じ表記の語の順番と、原文の前後4文字（原文の端では足りない分だけ）で決まる', () => {
  const { text, tokens } = days('晴', '雨', '雪');
  const anchors = anchorTokens(text, tokens).filter((anchor) => anchor?.surface === '今日');
  assert.deepEqual(anchors, [
    { surface: '今日', order: 0, before: '', after: 'は晴。今' },
    { surface: '今日', order: 1, before: '日は晴。', after: 'は雨。今' },
    { surface: '今日', order: 2, before: '日は雨。', after: 'は雪。' },
  ]);
});

test('前後の文字はコードポイントで数え、サロゲートペアを割らない', () => {
  const text = '𠮷𠮷𠮷𠮷𠮷今日𠮷𠮷𠮷𠮷𠮷';
  const anchors = anchorTokens(text, tokensOf(text, [KYOU]));
  assert.deepEqual(anchors[0], { surface: '今日', order: 0, before: '𠮷𠮷𠮷𠮷', after: '𠮷𠮷𠮷𠮷' });
});

test('漢字を含まない語には指定が無い', () => {
  const { text, tokens } = days('晴');
  assert.deepEqual(
    anchorTokens(text, tokens).map((anchor) => anchor !== undefined),
    [true, false, true, false],
  );
});

test('直しが無い時は何も当てず、語の列も読まない', () => {
  const { text } = days('晴');
  const resolved = resolveWordCorrections(text, [{ surface: '壊れた語', byteStart: 99, byteEnd: 0, reading: null, isUnknown: false }], []);
  assert.equal(resolved.readings.size, 0);
  assert.equal(resolved.applied.length, 0);
  assert.equal(resolved.unfound.length, 0);
});

test('1つの語だけに当たり、同じ表記のほかの語の読みは変わらない', () => {
  const { text, tokens } = days('晴', '雨', '雪');
  const resolved = resolveWordCorrections(text, tokens, [correction(1, '日は晴。', 'は雨。今')]);
  assert.deepEqual([...resolved.readings], [[4, 'こんにち']]);
  assert.deepEqual(resolved.applied, [{ surface: '今日', order: 1, before: '日は晴。', after: 'は雨。今', reading: 'こんにち' }]);
  const converted = convertToReading(text, tokens, {}, resolved.readings);
  assert.equal(converted.text, 'きょうははれ。こんにちははれ。きょうははれ。');
});

test('語を足したり消したりして順番がずれても、前後の文字で同じ語を見つけ直す', () => {
  // 前の文を足す。後ろの語の前後の文字は、足した所から4文字より離れていれば変わらない
  const before = days('晴', '雨', '雪');
  const stored = correction(2, '日は雨。', 'は雪。');
  assert.equal(resolveWordCorrections(before.text, before.tokens, [stored]).applied[0]?.order, 2);
  const added = days('曇', '晴', '雨', '雪');
  const resolvedAdded = resolveWordCorrections(added.text, added.tokens, [stored]);
  assert.equal(resolvedAdded.unfound.length, 0);
  assert.equal(resolvedAdded.applied[0]?.order, 3);
  const removed = days('雨', '雪');
  const resolvedRemoved = resolveWordCorrections(removed.text, removed.tokens, [stored]);
  assert.equal(resolvedRemoved.unfound.length, 0);
  assert.equal(resolvedRemoved.applied[0]?.order, 1);
});

test('直した語の前後の文字を編集した時は、別の語に当てず、見つからない直しにする', () => {
  const stored = correction(1, '日は晴。', 'は雨。今');
  for (const weathers of [
    ['晴れ', '雨', '雪'],
    ['晴', '雷雨', '雪'],
  ]) {
    const { text, tokens } = days(...weathers);
    const resolved = resolveWordCorrections(text, tokens, [stored]);
    assert.equal(resolved.applied.length, 0, weathers.join());
    assert.deepEqual(resolved.unfound, [stored]);
    assert.equal(resolved.readings.size, 0);
  }
});

test('直した語そのものを削除した時と、語の区切りが変わった時は、見つからない直しにする', () => {
  const stored = correction(0, '', 'は晴。今');
  const deleted = '晴。今日は雨。';
  const deletedTokens = tokensOf(deleted, [['晴', 'ハレ'], KYOU, WA, ['雨', 'アメ'], MARU]);
  assert.deepEqual(resolveWordCorrections(deleted, deletedTokens, [stored]).unfound, [stored]);
  // 「今日」の後ろに字を足して「今日中」が1語になった
  const merged = '今日中は晴。今日は雨。';
  const mergedTokens = tokensOf(merged, [['今日中', 'キョウジュウ'], WA, ['晴', 'ハレ'], MARU, KYOU, WA, ['雨', 'アメ'], MARU]);
  assert.deepEqual(resolveWordCorrections(merged, mergedTokens, [stored]).unfound, [stored]);
});

test('同じ表記・同じ前後の文字の語が複数ある時は、順番が近い語に当て、差が同じなら順番が小さい方に当てる', () => {
  // 前後の文字までそろった語が3つ並ぶ
  const text = 'ああああ今日ああああ今日ああああ今日ああああ';
  const tokens = tokensOf(text, [KYOU, KYOU, KYOU]);
  const near = (order: number) => resolveWordCorrections(text, tokens, [correction(order, 'ああああ', 'ああああ')]).applied[0]?.order;
  assert.equal(near(0), 0);
  assert.equal(near(2), 2);
  // 順番9は、候補（0・1・2）のうち順番が最も近い2に当たる
  assert.equal(near(9), 2);
  // 前後の文字が同じなのは順番0と2で、順番1の語だけ前後の文字が違う。順番1の直しは、差が同じ0と2のうち順番が小さい0に当たる
  const gap = 'ああああ今日いうえおかかかか今日ききききああああ今日いうえお';
  const gapTokens = tokensOf(gap, [KYOU, KYOU, KYOU]);
  const tie = resolveWordCorrections(gap, gapTokens, [correction(1, 'ああああ', 'いうえお')]);
  assert.equal(tie.applied[0]?.order, 0);
});

test('2つの直しが同じ語を指す時は、先に処理した直しがその語に当たり、もう1つは別の候補に当たるか、見つからない', () => {
  const text = 'ああああ今日ああああ今日ああああ';
  const tokens = tokensOf(text, [KYOU, KYOU]);
  const first = correction(0, 'ああああ', 'ああああ', 'こんにち');
  const second = correction(1, 'ああああ', 'ああああ', 'きょう');
  const resolved = resolveWordCorrections(text, tokens, [second, first]);
  assert.deepEqual(
    resolved.applied.map((entry) => [entry.order, entry.reading]),
    [
      [0, 'こんにち'],
      [1, 'きょう'],
    ],
  );
  // 当てられる語が1つだけなら、後に処理した直しは見つからない
  const onlyOne = resolveWordCorrections(text, tokens.slice(0, 1), [first, second]);
  assert.deepEqual(onlyOne.unfound, [second]);
  assert.equal(onlyOne.applied.length, 1);
});

test('当てた語の指定は、保存した直しではなく当たった語のものになり、同じ表記・同じ読みでも当たった語が違えば変わる', () => {
  const { text, tokens } = days('晴', '雨', '雪');
  const first = resolveWordCorrections(text, tokens, [correction(0, '', 'は晴。今')]).applied;
  const third = resolveWordCorrections(text, tokens, [correction(2, '日は雨。', 'は雪。')]).applied;
  assert.notDeepEqual(first, third);
  assert.equal(first[0]?.reading, third[0]?.reading);
  // 順番の保存値がずれていても、当たった語の順番で持つ
  const shifted = resolveWordCorrections(text, tokens, [correction(5, '日は雨。', 'は雪。')]).applied;
  assert.deepEqual(shifted, third);
});

test('語ごとの直しは表記ごとの直しより優先され、語ごとの直しに取られた語だけの表記は表記ごとの直しの当たりに数えない', () => {
  const { text, tokens } = days('晴', '雨');
  const wordReadings = new Map([[0, 'こんにち']]);
  const both = convertToReading(text, tokens, { 今日: 'ほんじつ' }, wordReadings);
  assert.equal(both.text, 'こんにちははれ。ほんじつははれ。');
  assert.deepEqual(both.appliedCorrections, [{ surface: '今日', reading: 'ほんじつ' }]);
  const wordOnly = convertToReading(text, tokens, { 今日: 'ほんじつ' }, new Map([0, 4].map((index) => [index, 'こんにち'] as const)));
  assert.deepEqual(wordOnly.appliedCorrections, []);
  // 語ごとの直しを消すと表記ごとの直しに戻り、それも消すと辞書の読みに戻る
  assert.equal(convertToReading(text, tokens, { 今日: 'ほんじつ' }).text.startsWith('ほんじつは'), true);
  assert.equal(convertToReading(text, tokens).text.startsWith('きょうは'), true);
});

test('場所の一覧は、漢字を含む語の出現を出現の順に並べ、当たっている直しを添える', () => {
  const { text, tokens } = days('晴', '雨');
  const stored = correction(1, '日は晴。', 'は雨。');
  const occurrences = listReadingOccurrences(text, tokens, resolveWordCorrections(text, tokens, [stored]));
  const kyou = occurrences.filter((entry) => entry.surface === '今日');
  assert.deepEqual(
    kyou.map((entry) => [entry.order, entry.dictionaryReading, entry.stored?.reading]),
    [
      [0, 'きょう', undefined],
      [1, 'きょう', 'こんにち'],
    ],
  );
});

test('直しの差し替え: 同じ語の指定は置き換え、指定した直しは消し、変化が無ければ同じ参照を返す', () => {
  const a = correction(0, '', 'は晴。今');
  const b = correction(1, '日は晴。', 'は雨。');
  const list = withWordReadingCorrection([], [], a);
  assert.deepEqual(list, [a]);
  assert.equal(withWordReadingCorrection(list, [], a), list);
  assert.deepEqual(withWordReadingCorrection(list, [], { ...a, reading: 'ほんじつ' }), [{ ...a, reading: 'ほんじつ' }]);
  assert.deepEqual(withWordReadingCorrection(list, [], b), [a, b]);
  assert.deepEqual(withWordReadingCorrection([a, b], [a], undefined), [b]);
  // 見つからない直しを付け直す: 古い指定を消して、新しい指定を足す
  assert.deepEqual(withWordReadingCorrection([a], [a], { ...b }), [b]);
  assert.equal(withWordReadingCorrection([], [a], undefined).length, 0);
});

test('原文の端で前後の文字が4文字に満たない直しは、同じ文脈になった別の語に当たりうる（仕様で許容した場合）', () => {
  const stored = correction(1, '日は雨。', 'は雪。');
  const once = days('雨', '雪');
  assert.equal(resolveWordCorrections(once.text, once.tokens, [stored]).applied[0]?.order, 1);
  // 同じ文を後ろに書き足すと、書き足した4つ目が同じ前後の文字になる
  const twice = days('雨', '雪', '雨', '雪');
  assert.equal(resolveWordCorrections(twice.text, twice.tokens, [stored]).applied[0]?.order, 3);
});
