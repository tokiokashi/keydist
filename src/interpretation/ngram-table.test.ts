import assert from 'node:assert/strict';
import test from 'node:test';
import { addNgramTables, countNgrams, countNgramsOverlapping, ngramTablesWithoutRange, subtractNgramTables } from './ngram-table.ts';

const plain = (tables: readonly ReadonlyMap<string, number>[]) => tables.map((table) => Object.fromEntries([...table].sort()));

test('0次から2次までの出現回数を数える', () => {
  const tables = countNgrams([...'ありあり'], 2);
  assert.deepEqual(plain(tables), [
    { あ: 2, り: 2 },
    { あり: 2, りあ: 1 },
    { ありあ: 1, りあり: 1 },
  ]);
});

test('文字列の長さが次数より短い時は、その次数の表が空になる', () => {
  assert.deepEqual(plain(countNgrams([...'あい'], 2)), [{ あ: 1, い: 1 }, { あい: 1 }, {}]);
  assert.deepEqual(plain(countNgrams([], 2)), [{}, {}, {}]);
});

test('サロゲートペアの文字も1文字に数える', () => {
  assert.deepEqual(plain(countNgrams([...'𠮷あ𠮷'], 2))[2], { 𠮷あ𠮷: 1 });
});

test('範囲と重なる並びだけを数える: 2次は範囲の2文字前から2文字後までの3文字組', () => {
  const chars = [...'abcdefghij'];
  // 範囲[4, 6)はef。重なる3文字組は、開始位置が[2, 6)のcde, def, efg, fgh
  assert.deepEqual(plain(countNgramsOverlapping(chars, 4, 6, 2))[2], { cde: 1, def: 1, efg: 1, fgh: 1 });
  assert.deepEqual(plain(countNgramsOverlapping(chars, 4, 6, 2))[1], { de: 1, ef: 1, fg: 1 });
  assert.deepEqual(plain(countNgramsOverlapping(chars, 4, 6, 2))[0], { e: 1, f: 1 });
});

test('範囲が端にある時は、端で切る', () => {
  const chars = [...'abcdef'];
  assert.deepEqual(plain(countNgramsOverlapping(chars, 0, 2, 2))[2], { abc: 1, bcd: 1 });
  assert.deepEqual(plain(countNgramsOverlapping(chars, 4, 6, 2))[2], { cde: 1, def: 1 });
});

test('連鎖に使う表は、範囲の前の表と範囲の後の表の和に一致する（範囲の文字を含む並びは残らない）', () => {
  const text = 'あいうえおあいうかきくあいうえおけこ、さしすあいう';
  const chars = [...text];
  const whole = countNgrams(chars, 2);
  for (const [from, to] of [
    [5, 11],
    [0, 4],
    [chars.length - 5, chars.length],
    [3, 4],
    [0, chars.length],
  ] as const) {
    const without = ngramTablesWithoutRange(whole, chars, from, to);
    const sum = addNgramTables(countNgrams(chars.slice(0, from), 2), countNgrams(chars.slice(to), 2));
    assert.deepEqual(plain(without), plain(sum), `範囲 [${from}, ${to})`);
  }
});

test('範囲の前と後をつないだ所に、新しい並びは作らない', () => {
  const chars = [...'abcdefgh'];
  const without = ngramTablesWithoutRange(countNgrams(chars, 2), chars, 3, 5);
  // 範囲deを除くと、前はabc、後はfgh。cfやbcfのような、つないだ並びは無い
  assert.deepEqual(plain(without)[2], { abc: 1, fgh: 1 });
  assert.deepEqual(plain(without)[1], { ab: 1, bc: 1, fg: 1, gh: 1 });
});

test('引く表の出現回数が足りない時は例外を投げる', () => {
  assert.throws(() => subtractNgramTables(countNgrams([...'ab'], 1), countNgrams([...'abab'], 1)));
});

test('引いて0になった並びは表から外す', () => {
  const result = subtractNgramTables(countNgrams([...'abab'], 1), countNgrams([...'ab'], 1));
  assert.deepEqual(plain(result), [
    { a: 1, b: 1 },
    { ab: 1, ba: 1 },
  ]);
  assert.equal(result[0]!.has('c'), false);
});
