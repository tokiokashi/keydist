import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { LAYOUT_BY_ID, withRomaji } from '#input/layouts/index.ts';
import { kunrei } from '#input/romaji/kunrei.ts';
import { BUNSETSU_KEY_SEPARATOR, type OrderSufficiency } from './corpus-ngram.ts';
import {
  analyzeNgramTable,
  analyzeTableEntry,
  BUNSETSU_LOOKAHEAD,
  defaultTableOrder,
  selectableOrders,
  weightedDistribution,
  type TableAnalysisSetup,
  type TableSource,
} from './ngram-table-analysis.ts';

const geometry = buildGeometry('row-staggered');
const layout = withRomaji(LAYOUT_BY_ID.get('qwerty')!, kunrei());
const setup: TableAnalysisSetup = { layout, geometry, tracePolicy: { windowSize: 3, sfbHomeCost: true }, romajiRuleId: 'kunrei' };
const source: TableSource = {
  kind: 'user-text',
  name: 'テスト',
  segmentation: { origin: 'user' },
  reading: null,
};

const near = (actual: number, expected: number, message?: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ''} expected ${expected}, got ${actual}`);
const key = (...units: string[]): string => units.join(BUNSETSU_KEY_SEPARATOR);
const dist = (a: string, b: string): number => {
  const from = geometry.keys.get(a)!;
  const to = geometry.keys.get(b)!;
  return Math.hypot(from.x - to.x, from.y - to.y);
};

test('0次の項目は、すべての指をホームに置いた状態から打つ', () => {
  // は = ha。右人差し指のホームjからhまで1u、左小指はホームのaを打つ
  near(analyzeTableEntry(['は'], setup, 1).distance, 1);
  // か = ka。右中指のホームkと左小指のホームaを打つ
  near(analyzeTableEntry(['か'], setup, 1).distance, 0);
});

test('文脈の文節の距離は数えず、最後の文節の距離だけを数える', () => {
  // 文脈の は は1u動くが、最後の か は0
  near(analyzeTableEntry(['は', 'か'], setup, 2).distance, 0);
  // 文脈の か は0で、最後の は は1u
  near(analyzeTableEntry(['か', 'は'], setup, 2).distance, 1);
});

test('文節の先読みNで、文脈より前の文節の指の位置を残す候補が決まる', () => {
  // は(h,a) の後の ひ(h,i)。ひ のhは、文脈の は のhと同じ右人差し指で、間に1打鍵（a）を挟む。
  // ひ のiを打つ右中指は、文脈で使っていないのでホームkから打つ
  const hi = dist('k', 'i');
  // N=1は今の文節だけを見るので、文脈のhに残らず、ホームjからhまで1u。N=2は次の文節まで見るので、hに残って0
  near(analyzeTableEntry(['は', 'ひ'], setup, 1).distance, 1 + hi, 'N=1');
  near(analyzeTableEntry(['は', 'ひ'], setup, 2).distance, 0 + hi, 'N=2');
  // 文脈の文節が2かななら、hのかなの位置の差は2だが、文節の番号の差は1。N=2は文節の差で測るので、hに残る
  near(analyzeTableEntry(['はか', 'ひ'], setup, 1).distance, 1 + hi, '2かなの文脈N=1');
  near(analyzeTableEntry(['はか', 'ひ'], setup, 2).distance, 0 + hi, '2かなの文脈N=2');
});

test('Nを次数k+1より大きくしても、結果はk+1と同じになる', () => {
  const entries = [['は', 'ひ'], ['は', 'か', 'ひ'], ['か', 'は', 'は', 'ひ'], ['は']];
  for (const units of entries) {
    const base = analyzeTableEntry(units, setup, units.length).distance;
    for (let lookahead = units.length; lookahead <= BUNSETSU_LOOKAHEAD.max; lookahead++) {
      near(analyzeTableEntry(units, setup, lookahead).distance, base, `${units.join('/')} N=${lookahead}`);
    }
  }
  // k+1より小さいNでは変わりうる
  assert.notEqual(analyzeTableEntry(['は', 'ひ'], setup, 1).distance, analyzeTableEntry(['は', 'ひ'], setup, 2).distance);
});

test('文節の境をまたぐ入力の距離は、入力の終わりが属する文節に入れる', () => {
  // っ|は は1つの綴りhhaで打つ。hhaの打鍵は、終わりが最後の文節にあるので、最後の文節に入る。
  // h（ホームjから1u）、h（同指連続で0）、a（ホームから0）
  near(analyzeTableEntry(['っ', 'は'], setup, 2).distance, 1);
});

test('片仮名は、その配列の見出しに入らなければひらがなに書き換えて打つ', () => {
  near(analyzeTableEntry(['ハ'], setup, 1).distance, analyzeTableEntry(['は'], setup, 1).distance);
});

test('打てない文字は距離0で、打てなかった文字として数える', () => {
  const result = analyzeTableEntry(['は', 'ヷ'], setup, 2);
  assert.equal(result.skipped, 1);
  assert.equal(result.length, 1);
  near(result.distance, 0);
});

test('項目は出現回数で重み付けして足し、入力1かなあたりは最後の文節のかな数で割る', () => {
  const table = new Map<string, number>([
    [key('は'), 3],
    [key('か'), 1],
    [key('ひ'), 2],
  ]);
  const result = analyzeNgramTable(table, 0, setup, 1, source);
  const hi = 1 + dist('k', 'i');
  near(result.totalDistance, 3 * 1 + 1 * 0 + 2 * hi);
  assert.equal(result.occurrences, 6);
  assert.equal(result.entries, 3);
  assert.equal(result.chars, 6);
  near(result.perChar!, (3 + 2 * hi) / 6);
  assert.equal(result.skipped, 0);
  assert.deepEqual(result.conditions, {
    order: 0,
    lookahead: { unit: 'bunsetsu', value: 1 },
    source,
    layoutId: 'qwerty',
    romajiRuleId: 'kunrei',
    shapeId: 'row-staggered',
    fingerAssignmentId: geometry.assignment.id,
    sfbHomeCost: true,
    centerShiftThumb: 'right',
    spaceThumb: 'right',
  });
});

test('1次の表は、2文節の項目の最後の文節の距離を重み付けして足す', () => {
  const table = new Map<string, number>([
    [key('は', 'ひ'), 2],
    [key('か', 'は'), 1],
  ]);
  const hi = dist('k', 'i');
  const n1 = analyzeNgramTable(table, 1, setup, 1, source);
  near(n1.totalDistance, 2 * (1 + hi) + 1 * 1);
  // N=2では、は|ひ のhが文脈のhに残る
  const n2 = analyzeNgramTable(table, 1, setup, 2, source);
  near(n2.totalDistance, 2 * hi + 1 * 1);
  // N=3はN=2と同じ。条件には選んだNを残す
  const n3 = analyzeNgramTable(table, 1, setup, 3, source);
  near(n3.totalDistance, n2.totalDistance);
  assert.equal(n3.conditions.lookahead.value, 3);
});

test('0次の表では、Nを変えても結果は変わらない', () => {
  const table = new Map<string, number>([[key('ひ'), 1]]);
  const base = analyzeNgramTable(table, 0, setup, 1, source).totalDistance;
  for (let lookahead = 2; lookahead <= BUNSETSU_LOOKAHEAD.max; lookahead++) {
    near(analyzeNgramTable(table, 0, setup, lookahead, source).totalDistance, base);
  }
});

test('次数と合わない鍵と、範囲外のNは例外を投げる', () => {
  assert.throws(() => analyzeNgramTable(new Map([[key('は', 'ひ'), 1]]), 0, setup, 1, source), /次数0/);
  assert.throws(() => analyzeNgramTable(new Map([[key('は'), 1]]), 0, setup, 0, source), /文節の先読み/);
  assert.throws(() => analyzeNgramTable(new Map([[key('は'), 1]]), 0, setup, BUNSETSU_LOOKAHEAD.max + 1, source), /文節の先読み/);
  assert.throws(() => analyzeNgramTable(new Map([[key('は'), 1]]), 0, setup, 1.5, source), /文節の先読み/);
});

test('空の表は、値が決まらない量をundefinedにする', () => {
  const result = analyzeNgramTable(new Map(), 0, setup, 1, source);
  assert.equal(result.totalDistance, 0);
  assert.equal(result.perChar, undefined);
  assert.equal(result.distanceDistribution, undefined);
  assert.equal(result.perCharDistribution, undefined);
});

test('分布: 重みの累積が⌈q·W⌉に達する最初の値を分位点にする', () => {
  // 値0が重み1、値1が重み3。W=4。0.1は⌈0.4⌉=1、0.25は⌈1⌉=1、0.5は⌈2⌉=2、0.75は⌈3⌉=3、0.9は⌈3.6⌉=4
  const result = weightedDistribution([1, 0], [3, 1])!;
  assert.deepEqual(
    result.quantiles.map((quantile) => [quantile.level, quantile.value]),
    [
      [0.1, 0],
      [0.25, 0],
      [0.5, 1],
      [0.75, 1],
      [0.9, 1],
    ],
  );
  assert.equal(result.min, 0);
  assert.equal(result.max, 1);
  near(result.mean, 0.75);
  assert.equal(weightedDistribution([], []), undefined);
});

test('分布: 文節の移動距離と、文節の長さで割った値の2通りを出す', () => {
  const oneKana = analyzeNgramTable(new Map([[key('は'), 1]]), 0, setup, 1, source);
  const twoKana = analyzeNgramTable(new Map([[key('はか'), 1]]), 0, setup, 1, source);
  near(oneKana.distanceDistribution!.mean, 1);
  near(oneKana.perCharDistribution!.mean, 1);
  // はか = ha,ka。距離は1、かなは2
  near(twoKana.distanceDistribution!.mean, 1);
  near(twoKana.perCharDistribution!.mean, 0.5);
});

const row = (order: number, ratio: number | undefined): OrderSufficiency => ({
  order,
  occurrences: 100,
  grams: 50,
  singletonGrams: 10,
  contexts: 20,
  singletonContexts: 5,
  singleContinuationOccurrences: 0,
  contextSingletonRatio: undefined,
  singleContinuationRatio: ratio,
  gramSingletonRatio: 0.1,
});

test('選べる次数: 0次から足りている最大の次数まで。足りている次数が無ければ0次だけ', () => {
  assert.deepEqual(selectableOrders([row(0, undefined), row(1, 0.05), row(2, 0.09), row(3, 0.2)]), [0, 1, 2]);
  assert.deepEqual(selectableOrders([row(0, undefined), row(1, 0.1), row(2, 0.2)]), [0, 1]);
  assert.deepEqual(selectableOrders([row(0, undefined), row(1, 0.3), row(2, 0.4)]), [0]);
  assert.deepEqual(selectableOrders([row(0, undefined)]), [0]);
  // 途中で上限を超えた次数より上は、また下がっても選べない
  assert.deepEqual(selectableOrders([row(0, undefined), row(1, 0.05), row(2, 0.2), row(3, 0.05)]), [0, 1]);
});

test('表の次数の既定は、選べる次数の最大', () => {
  assert.equal(defaultTableOrder([row(0, undefined), row(1, 0.05), row(2, 0.09), row(3, 0.2)]), 2);
  assert.equal(defaultTableOrder([row(0, undefined), row(1, 0.3)]), 0);
});

test('入力が文節の境界をまたぐ時、先読みの終わりは終わりの文節、始まりは始まりの文節で測る', () => {
  // っは は、っ（文節0）と は（文節1）をまたぐ入力を含む。終わりの文節は1なので、N=2で次の文節まで見て指を残す
  near(analyzeTableEntry(['っ', 'は', 'ひ'], setup, 2).distance, 1.0307764064044151, '終わりの文節');
  // ひ の入力は文節2から始まる。始まりの文節で測るので、N=2では文節1より前の指は残らない
  near(analyzeTableEntry(['ひ', 'っ', 'は'], setup, 2).distance, 0, '始まりの文節');
});
