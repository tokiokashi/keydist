import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { generateTrace } from '#trace/generate.ts';
import { CHAIN_SEED_COUNT, compareWithChain, fixedSpans, fullSpanValues, spanQuantities, verdictOf, type ChainSupport } from './chain-comparison.ts';
import { buildMarkovChain } from './markov-text.ts';
import { countNgrams } from './ngram-table.ts';
import { buildSpanIndex, spanTotals, wholeTotals, type SpanIndex } from './span-metrics.ts';
import type { RankAmongRandom } from './segments.ts';

const geometry = buildGeometry('row-staggered');
const evaluate = (text: string): SpanIndex =>
  buildSpanIndex(generateTrace(text, LAYOUT_BY_ID.get('qwerty')!, geometry, { windowSize: 3, sfbHomeCost: true }));

const KANA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん、。';
function pseudoText(length: number): string {
  let state = 12345;
  let out = '';
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    out += KANA[(state >>> 8) % KANA.length];
  }
  return out;
}

test('区間: 末尾の50文字に満たない区間も含めて区切り、満たない区間にだけfullを付けない', () => {
  assert.deepEqual(fixedSpans(120, 50), [
    { from: 0, to: 50, full: true },
    { from: 50, to: 100, full: true },
    { from: 100, to: 120, full: false },
  ]);
  assert.deepEqual(
    fixedSpans(100, 50).map((span) => span.full),
    [true, true],
  );
  assert.deepEqual(fixedSpans(30, 50), [{ from: 0, to: 30, full: false }]);
});

test('区間: 末尾を含めた分割で分子と分母を足すと、テキスト全体の値に戻る', () => {
  const text = pseudoText(233);
  const index = evaluate(text);
  for (const metric of ['perCharUnits', 'meanPerStroke', 'sameFingerRate', 'perCharSteps'] as const) {
    let numerator = 0;
    let denominator = 0;
    for (const span of fixedSpans(index.inputChars, 50)) {
      const totals = spanTotals(index, metric, span.from, span.to);
      numerator += totals.numerator;
      denominator += totals.denominator;
    }
    const whole = wholeTotals(index, metric);
    assert.ok(Math.abs(numerator - whole.numerator) < 1e-9, metric);
    assert.equal(denominator, whole.denominator, metric);
  }
});

test('区間の値: 末尾の50文字に満たない区間を除き、小さい順に返す', () => {
  const index = evaluate(pseudoText(233));
  const values = fullSpanValues(index, 'perCharUnits', 50);
  assert.equal(values.length, 4);
  assert.deepEqual(
    [...values],
    [...values].sort((a, b) => a - b),
  );
  const expected = fixedSpans(233, 50)
    .filter((span) => span.full)
    .map((span) => {
      const totals = spanTotals(index, 'perCharUnits', span.from, span.to);
      return totals.numerator / totals.denominator;
    })
    .sort((a, b) => a - b);
  assert.deepEqual([...values], expected);
});

test('90%点は補間しない最近順位: 10個なら9番目、4個なら4番目', () => {
  const ten = evaluate(pseudoText(500));
  const quantitiesTen = spanQuantities(ten, 'perCharUnits', 50);
  const valuesTen = fullSpanValues(ten, 'perCharUnits', 50);
  assert.equal(valuesTen.length, 10);
  assert.equal(quantitiesTen.p90, valuesTen[8]);
  assert.equal(quantitiesTen.max, valuesTen[9]);
  assert.equal(quantitiesTen.median, (valuesTen[4]! + valuesTen[5]!) / 2);
  const four = evaluate(pseudoText(233));
  assert.equal(spanQuantities(four, 'perCharUnits', 50).p90, fullSpanValues(four, 'perCharUnits', 50)[3]);
});

test('50文字に満たないテキストは区間が無く、量が決まらない', () => {
  const quantities = spanQuantities(evaluate(pseudoText(30)), 'perCharUnits', 50);
  assert.equal(quantities.count, 0);
  assert.equal(quantities.p90, undefined);
});

const rank = (extreme: RankAmongRandom['extreme']): RankAmongRandom => ({ low: 1, high: 1, of: 21, extreme });
const support = (singleRatio: number | undefined): ChainSupport => ({
  steps: 100,
  singleCandidateSteps: singleRatio === undefined ? 0 : singleRatio * 100,
  singleRatio,
  continuedByLastChar: 0,
  continuedFromWhole: 0,
});

test('判定: 端に来たら説明できなかった、端でなければ説明できなかったとは言えない', () => {
  assert.deepEqual(verdictOf(rank('highest'), support(0.05), true, 0.1), { kind: 'unexplained', side: 'highest' });
  assert.deepEqual(verdictOf(rank('lowest'), support(0.05), true, 0.1), { kind: 'unexplained', side: 'lowest' });
  assert.deepEqual(verdictOf(rank(null), support(0.05), true, 0.1), { kind: 'not-ruled-out' });
});

test('判定: 候補が1つしか無かった段の割合が上限を超えたら出さない。上限ちょうどは出す', () => {
  assert.deepEqual(verdictOf(rank('highest'), support(0.1001), true, 0.1), { kind: 'withheld', reason: 'single-ratio' });
  assert.deepEqual(verdictOf(rank('highest'), support(0.1), true, 0.1), { kind: 'unexplained', side: 'highest' });
  assert.deepEqual(verdictOf(rank('highest'), support(undefined), true, 0.1), { kind: 'withheld', reason: 'single-ratio' });
});

test('判定: 順位が付かなければ出さない。判定の対象でないテキストには出さない', () => {
  assert.deepEqual(verdictOf(undefined, support(0.05), true, 0.1), { kind: 'withheld', reason: 'no-span' });
  assert.deepEqual(verdictOf(rank('highest'), support(0.05), false, 0.1), { kind: 'not-judged' });
});

test('順位: 同点は幅になり、同点があれば端に数えない', async () => {
  const { rankAmong } = await import('./segments.ts');
  const equal = Array.from({ length: 20 }, () => 1);
  const tied = rankAmong(1, equal);
  assert.deepEqual([tied.low, tied.high, tied.of, tied.extreme], [1, 21, 21, null]);
  const high = rankAmong(2, equal);
  assert.deepEqual([high.low, high.high, high.extreme], [21, 21, 'highest']);
});

test('比べ方: 元のテキスト・生成文・対照テキストを20個ずつ評価し、同じ入力と種から同じ結果になる', () => {
  const text = pseudoText(400);
  const chain = buildMarkovChain(countNgrams([...pseudoText(6000)], 2));
  const input = { text, chain, evaluate, seedStart: 5, judge: true } as const;
  const first = compareWithChain(input);
  assert.deepEqual(first, compareWithChain(input));
  assert.equal(first.generated.length, CHAIN_SEED_COUNT);
  assert.equal(first.shuffled.length, CHAIN_SEED_COUNT);
  assert.equal(first.uniform.length, CHAIN_SEED_COUNT);
  assert.deepEqual(
    first.seeds,
    Array.from({ length: CHAIN_SEED_COUNT }, (_, i) => 5 + i),
  );
  assert.equal(first.original.count, 8);
  assert.ok(first.generated.every((quantities) => quantities.count === 8));
  assert.equal(first.support.steps, 398 * CHAIN_SEED_COUNT);
  assert.ok(first.rank !== undefined && first.rank.of === 21);
  assert.notEqual(first.verdict.kind, 'not-judged');
});

test('比べ方: 種の始まりを変えると生成文が変わる。judgeを切ると判定を出さない', () => {
  const text = pseudoText(400);
  const chain = buildMarkovChain(countNgrams([...pseudoText(6000)], 2));
  const a = compareWithChain({ text, chain, evaluate, seedStart: 1, judge: false });
  const b = compareWithChain({ text, chain, evaluate, seedStart: 2, judge: false });
  assert.notDeepEqual(a.generated, b.generated);
  assert.deepEqual(a.verdict, { kind: 'not-judged' });
});
