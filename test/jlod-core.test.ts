import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTable, parseSource } from '../scripts/jlod-core.ts';

// 定義ファイルと同じ書式で書いた小さな入力。キー名はQWERTYの物理キー名
const SOURCE = [
  "'記号",
  '=',
  '[\t「',
  ']\t」',
  'r\t、',
  ':\tー',
  't\t。',
  '@\t・',
  '',
  "'促音",
  '=',
  'q\tっ',
  'w\t、',
  'r\tー',
  't\t未',
  '{ll}\tん',
  '',
  "'基本",
  '=',
  'asd\tあ$お$え',
  '=i',
  'asd{ta}\tか$こ$け$かん',
  '=,',
  'a\tわ',
  '',
  "'頻出語省略入力",
  '=y',
  'hj\tお願い$未',
  '',
].join('\r\n');

const build = () => buildTable(parseSource(SOURCE));

test('前置キー列は次の見出しまで続き、{xy} は1つの位置になる', () => {
  const { table } = build();
  // QWERTYのasdはDvorakのaoe、iはc、{ta}はya
  assert.equal(table.あ, 'a');
  assert.equal(table.お, 'o');
  assert.equal(table.か, 'ca');
  assert.equal(table.こ, 'co');
  assert.equal(table.け, 'ce');
  assert.equal(table.かん, 'cya');
  // , → Dvorakのw
  assert.equal(table.わ, 'wa');
});

test('同じ打鍵列は後の行を採る。未も後の行として採り、そのうえで落とす', () => {
  const { table, report } = build();
  // rは 、 のあと ー に上書きされる。tは 。 のあと 未 に上書きされて割り当てなしになる
  assert.equal(table['、'], ',');
  assert.equal(table['。'], undefined);
  assert.equal(table.ー, '-');
  assert.ok(report.some((line) => line.includes('r: 、') && line.includes('ー')));
  assert.ok(report.some((line) => line.includes('t: 。') && line.includes('未')));
});

test('記号の節のJISのキー名をUS配列の物理位置へ読み替えてからDvorakの文字にする', () => {
  const { table, report } = build();
  // JISの : はUSの ' の位置、Dvorakの -
  assert.equal(table.ー, '-');
  // JISの @ はUSの [ の位置、Dvorakの /
  assert.equal(table['・'], '/');
  // 「」はDvorakの配列にあるかにかかわらず、ほかの規則と同じ綴りを足す。JISの ] はUSの \ の位置でDvorakに無い
  assert.equal(table['「'], '[');
  assert.equal(table['」'], ']');
  assert.ok(report.some((line) => line.includes('Dvorakの配列に対応するキーが無く落とした行') && line.includes('」')));
});

test('促音は単打だけを持ち、{ll} は2打の位置になる', () => {
  const { table } = build();
  assert.equal(table.っ, "'");
  assert.equal(table.ん, 'nn');
});

test('頻出語の節は入れない', () => {
  const { table } = build();
  assert.equal(table.お願い, undefined);
  const { sections } = parseSource(SOURCE);
  assert.deepEqual(
    sections.filter((s) => s.excluded).map((s) => s.name),
    ['頻出語省略入力'],
  );
});

test('出力の数とキーの位置の数が合わない行は止める', () => {
  assert.throws(() => parseSource("'基本\n=\nasd\tあ$お"), /数が合わない/);
});

test('1つの出力に複数の綴りがある時は、打鍵数最小、同数なら出典で先を採る', () => {
  const source = ["'基本", '=', 'ab\tあ$い', '=i', 'a\tあ', '=', 'sd\tう$う', 'f\tう'].join('\n');
  const { table } = buildTable(parseSource(source));
  // あ はa（1打）とca（2打）なのでa。う はoとeとuが同じ1打で、出典で先のo
  assert.equal(table.あ, 'a');
  assert.equal(table.う, 'o');
});
