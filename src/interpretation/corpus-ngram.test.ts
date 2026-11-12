import assert from 'node:assert/strict';
import test from 'node:test';
import { BUNSETSU_KEY_SEPARATOR, buildCorpusNgramTables, buildCorpusSequences, ngramSufficiency, sufficientOrder } from './corpus-ngram.ts';
import { countNgrams, countNgramsInRuns } from './ngram-table.ts';

const plain = (table: ReadonlyMap<string, number>) => Object.fromEntries([...table].sort());
const S = BUNSETSU_KEY_SEPARATOR;

test('文字列の単位は区切りを鍵に入れて数え、区切りの違う並びを同じ鍵にしない', () => {
  assert.deepEqual(plain(countNgrams(['ab', 'c'], 1, S)[1]!), { [`ab${S}c`]: 1 });
  assert.deepEqual(plain(countNgrams(['a', 'bc'], 1, S)[1]!), { [`a${S}bc`]: 1 });
  assert.throws(() => countNgrams([`a${S}b`], 1, S));
});

test('単位が1コードポイントで区切りが空なら、従来どおり文字を続けた鍵になる', () => {
  assert.deepEqual(plain(countNgrams([...'ありあ'], 1)[1]!), { あり: 1, りあ: 1 });
});

test('走りごとに数え、走りをまたぐ並びを作らない', () => {
  const tables = countNgramsInRuns([['a', 'b'], ['b', 'c'], ['a']], 2);
  assert.deepEqual(plain(tables[0]!), { a: 2, b: 2, c: 1 });
  assert.deepEqual(plain(tables[1]!), { ab: 1, bc: 1 });
  assert.deepEqual(plain(tables[2]!), {});
});

test('系列: 区切りで文節に分け、空白と改行と読みの無い漢字で走りを切る', () => {
  // 読みのテキスト「きょうは　はれ。\nあしたは雨」。区切りは「きょうは」の後・「あ」の前・「雨」の前
  const reading = 'きょうは　はれ。\nあしたは雨ですね';
  const chars = [...reading];
  const boundaryAfterHa = 4;
  const boundaryAfterTen = chars.indexOf('あ');
  const boundaryAfterAshitaWa = chars.indexOf('雨');
  const sequences = buildCorpusSequences(reading, [boundaryAfterHa, boundaryAfterTen, boundaryAfterAshitaWa]);
  assert.deepEqual(sequences.bunsetsu, [['きょうは'], ['はれ。'], ['あしたは'], ['ですね']]);
  assert.deepEqual(
    sequences.kana.map((run) => run.join('')),
    ['きょうは', 'はれ。', 'あしたは', 'ですね'],
  );
  assert.deepEqual(sequences.cuts, { whitespace: 2, unreadableKanji: 1 });
});

test('系列: 句読点は切らずに文節の末尾に残り、取り除く記号の分だけ区切りが詰まる', () => {
  // 「わたしは、「ねこ」だ。」。「」は取り除かれる。区切りは「「」の位置と「だ」の位置
  const reading = 'わたしは、「ねこ」だ。';
  const chars = [...reading];
  const sequences = buildCorpusSequences(reading, [chars.indexOf('「'), chars.indexOf('だ')]);
  assert.deepEqual(sequences.bunsetsu, [['わたしは、', 'ねこ', 'だ。']]);
  assert.deepEqual(sequences.kana[0]!.join(''), 'わたしは、ねこだ。');
});

test('系列: 片仮名は書き換えず、英字と数字は取り除く', () => {
  const sequences = buildCorpusSequences('ニャーabc12ねこ', []);
  assert.deepEqual(sequences.kana[0]!.join(''), 'ニャーねこ');
});

test('文脈が1回だけの割合: 手で数えた値と一致する', () => {
  // 系列はa,b,a,b,cの5単位で、1つの走りに置く。2次の並びはaba・bab・abcが各1回、1次の並びはabが2回・baとbcが各1回
  const tables = countNgramsInRuns([['a', 'b', 'a', 'b', 'c']], 2);
  const rows = ngramSufficiency(tables);
  // 0次: 5回。文脈は空で全体で1つ
  assert.equal(rows[0]!.occurrences, 5);
  assert.equal(rows[0]!.contexts, 1);
  assert.equal(rows[0]!.singletonContexts, 0);
  assert.equal(rows[0]!.contextSingletonRatio, 0);
  // 0次の1回だけの並び: cの1つ
  assert.equal(rows[0]!.singletonGrams, 1);
  assert.equal(rows[0]!.gramSingletonRatio, 1 / 5);
  // 1次: 4組。文脈aは2回、文脈bは2回（baとbc）。1回だけの文脈は無い
  assert.equal(rows[1]!.occurrences, 4);
  assert.equal(rows[1]!.contexts, 2);
  assert.equal(rows[1]!.singletonContexts, 0);
  // 2次: 3組。文脈abは2回（abaとabc）、文脈baは1回（bab）。1回だけの文脈はbaの1つ
  assert.equal(rows[2]!.occurrences, 3);
  assert.equal(rows[2]!.contexts, 2);
  assert.equal(rows[2]!.singletonContexts, 1);
  assert.equal(rows[2]!.contextSingletonRatio, 1 / 3);
  assert.equal(rows[2]!.singletonGrams, 3);
});

test('文脈の切り出しは、文字列の単位でも最後の1単位だけを除く', () => {
  const tables = countNgramsInRuns([['ab', 'c', 'ab', 'c', 'd']], 2, S);
  const rows = ngramSufficiency(tables, S);
  // 2次の並びは(ab,c,ab)・(c,ab,c)・(ab,c,d)。文脈は(ab,c)が2回、(c,ab)が1回
  assert.equal(rows[2]!.occurrences, 3);
  assert.equal(rows[2]!.contexts, 2);
  assert.equal(rows[2]!.singletonContexts, 1);
});

test('足りている最大の次数は、割合が上限以下の間の最後の次数で、超えた次数より上は見ない', () => {
  const row = (order: number, ratio: number | undefined) => ({
    order,
    occurrences: 100,
    grams: 0,
    singletonGrams: 0,
    contexts: 0,
    singletonContexts: 0,
    contextSingletonRatio: ratio,
    gramSingletonRatio: undefined,
  });
  assert.equal(sufficientOrder([row(0, 0), row(1, 0.05), row(2, 0.1), row(3, 0.3), row(4, 0.05)]), 2);
  assert.equal(sufficientOrder([row(0, 0), row(1, 0.11)]), 0);
  assert.equal(sufficientOrder([row(0, undefined)]), undefined);
  assert.equal(sufficientOrder([row(0, 0), row(1, 0.2)], 0.25), 1);
});

test('2つの系列は同じ文字を数え、文節の表の0次の出現数は走りの文節数の合計になる', () => {
  const reading = 'きょうは　はれ。\nあしたは雨ですね';
  const chars = [...reading];
  const result = buildCorpusNgramTables(reading, [4, chars.indexOf('あ'), chars.indexOf('雨')], 2);
  assert.equal(result.kana.sufficiency[0]!.occurrences, [...'きょうははれ。あしたはですね'].length);
  assert.equal(result.bunsetsu.sufficiency[0]!.occurrences, 4);
  assert.equal(result.bunsetsu.sufficiency[1]!.occurrences, 0);
});
