import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMarkovChain, generateMarkovText } from './markov-text.ts';
import { countNgrams } from './ngram-table.ts';

const chainOf = (text: string) => buildMarkovChain(countNgrams([...text], 2));

test('同じ表・始まり・文字数・種からは同じ生成文が出る', () => {
  const chain = chainOf('あいうえおあいうかきくあいうえおけこさしすせそたちつてと'.repeat(3));
  const a = generateMarkovText(chain, 'あい', 80, 7);
  const b = generateMarkovText(chain, 'あい', 80, 7);
  assert.deepEqual(a, b);
  assert.notEqual(generateMarkovText(chain, 'あい', 80, 8).text, a.text);
});

test('生成文の文字数は指定と一致し、最初の2文字は始まりと同じ', () => {
  const chain = chainOf('あいうえおあいうかきくあいうえおけこ'.repeat(2));
  for (const length of [2, 3, 10, 57]) {
    const result = generateMarkovText(chain, 'あい', length, 1);
    assert.equal([...result.text].length, length);
    assert.equal(result.text.slice(0, 2), 'あい');
  }
});

test('文字数が2未満なら、始まりの先頭から指定の文字数だけ返す', () => {
  const chain = chainOf('あいうあいう');
  assert.equal(generateMarkovText(chain, 'あい', 1, 1).text, 'あ');
  assert.equal(generateMarkovText(chain, 'あい', 0, 1).text, '');
});

test('候補が1つの文脈では、その文字を続け、候補が1つの段として数える', () => {
  // 「あい」の次は必ず「う」、「いう」の次は必ず「え」…と1通りに決まる列
  const chain = chainOf('あいうえお');
  const result = generateMarkovText(chain, 'あい', 5, 1);
  assert.equal(result.text, 'あいうえお');
  assert.equal(result.steps, 3);
  assert.equal(result.singleCandidateSteps, 3);
  assert.equal(result.continuedByLastChar, 0);
  assert.equal(result.continuedFromWhole, 0);
});

test('候補が複数ある文脈は、候補が1つの段に数えない', () => {
  const chain = chainOf('あいうあいえ');
  const result = generateMarkovText(chain, 'あい', 3, 1);
  assert.equal(result.steps, 1);
  assert.equal(result.singleCandidateSteps, 0);
  assert.ok(['あいう', 'あいえ'].includes(result.text));
});

test('候補が無い文脈では、直前の1文字から始まる文脈を引いて、その2文字目を続ける', () => {
  // 文脈「いえ」は表に無い。直前の文字「え」から始まる文脈は「えお」だけ
  const chain = chainOf('あいうえおか');
  const result = generateMarkovText(chain, 'いえ', 3, 1);
  assert.equal(result.text, 'いえお');
  assert.equal(result.steps, 1);
  assert.equal(result.continuedByLastChar, 1);
  assert.equal(result.continuedFromWhole, 0);
  assert.equal(result.singleCandidateSteps, 0);
});

test('直前の1文字から始まる文脈の引き方は、文脈の出現回数の重みによる', () => {
  // 文脈「えお」は3回、「えか」は1回出る。文脈「いえ」には続きが無いので、直前の「え」から始まる文脈を引く
  const chain = chainOf('えおあ えおあ えおあ えかあ'.replaceAll(' ', ''));
  const counts = new Map<string, number>();
  for (let seed = 0; seed < 400; seed++) {
    const text = generateMarkovText(chain, 'いえ', 3, seed).text;
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  const お = counts.get('いえお') ?? 0;
  const か = counts.get('いえか') ?? 0;
  assert.equal(お + か, 400);
  assert.ok(お > か * 2 && か > 0, `いえお ${お}、いえか ${か}`);
});

test('直前の1文字から始まる文脈も無い時は、文脈を全体から引いて2文字続ける', () => {
  // 「か」は表の最後の文字で、「か」から始まる文脈は無い
  const chain = chainOf('あいうえおか');
  const result = generateMarkovText(chain, 'えか', 4, 1);
  assert.equal(result.steps, 1);
  assert.equal(result.continuedFromWhole, 1);
  assert.equal(result.continuedByLastChar, 0);
  const rest = [...result.text].slice(2).join('');
  assert.ok(['あい', 'いう', 'うえ', 'えお'].includes(rest), rest);
});

test('全体から引いて続ける時、文字数を超える分は切る', () => {
  const chain = chainOf('あいうえおか');
  const result = generateMarkovText(chain, 'えか', 3, 1);
  assert.equal([...result.text].length, 3);
  assert.equal(result.continuedFromWhole, 1);
});

test('2次の表が空なら連鎖を作れない', () => {
  assert.throws(() => buildMarkovChain(countNgrams([...'あい'], 2)));
});
