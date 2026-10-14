import assert from 'node:assert/strict';
import test from 'node:test';
import { gridDeviations } from './grid-deviation.ts';

const pair = (id: string) => `same-hand-pair:${id}`;
const LEFT_IDS = ['LP:LR', 'LP:LM', 'LP:LI', 'LR:LM', 'LR:LI', 'LM:LI'];
/** 左手の組を並びの順に、与えた保存値で埋める。 */
const leftPairs = (values: readonly string[]) =>
  Object.fromEntries(LEFT_IDS.slice(0, values.length).map((id, i) => [pair(id), values[i]!]));

test('中央値より遅いマスと速いマスは別の向きになる', () => {
  const result = gridDeviations('same-hand-pair', leftPairs(['1.00', '3.00', '3.00', '3.00', '3.00', '9.00']));
  assert.equal(result.get(pair('LP:LR'))?.direction, 'slow');
  assert.equal(result.get(pair('LM:LI'))?.direction, 'fast');
  assert.equal(result.has(pair('LP:LM')), false);
});

test('中央値からのずれが大きいほど濃い', () => {
  const slow = gridDeviations('same-hand-pair', leftPairs(['2.40', '2.00', '3.00', '3.00', '3.00', '3.00']));
  assert.ok(slow.get(pair('LP:LM'))!.intensity > slow.get(pair('LP:LR'))!.intensity);
  const fast = gridDeviations('same-hand-pair', leftPairs(['3.00', '3.00', '3.00', '3.00', '3.60', '3.90']));
  assert.ok(fast.get(pair('LM:LI'))!.intensity > fast.get(pair('LR:LI'))!.intensity);
});

test('遅い側と速い側は、同じ比なら同じ濃さになる', () => {
  const slow = gridDeviations('same-hand-pair', leftPairs(['2.00', '3.00', '3.00']));
  const fast = gridDeviations('same-hand-pair', leftPairs(['4.50', '3.00', '3.00']));
  assert.ok(Math.abs(slow.get(pair('LP:LR'))!.intensity - fast.get(pair('LP:LR'))!.intensity) < 1e-12);
});

test('最も濃くなる比で濃さは1になり、それを超えても1のまま', () => {
  assert.equal(gridDeviations('same-hand-pair', leftPairs(['1.50', '3.00', '3.00'])).get(pair('LP:LR'))?.intensity, 1);
  assert.equal(gridDeviations('same-hand-pair', leftPairs(['0.30', '3.00', '3.00'])).get(pair('LP:LR'))?.intensity, 1);
  assert.equal(gridDeviations('same-hand-pair', leftPairs(['6.00', '3.00', '3.00'])).get(pair('LP:LR'))?.intensity, 1);
});

test('中央値にちょうど等しいマスと、ずれがごく小さいマスには色を付けない', () => {
  const result = gridDeviations('same-hand-pair', leftPairs(['3.00', '3.05', '2.90', '3.00', '3.00']));
  assert.equal(result.size, 0);
});

test('保存値を持つマスが3つ未満の表には色を付けない', () => {
  assert.equal(gridDeviations('same-hand-pair', leftPairs(['1.00', '9.00'])).size, 0);
  assert.equal(gridDeviations('same-hand-pair', leftPairs(['1.00', '9.00', '3.00'])).size, 2);
});

test('中央値は保存値を持つマスだけから求める', () => {
  // 保存値を持つ3マスの中央値は3.00。保存値の無い欄や空の欄を混ぜると中央値が動き、色が変わる
  const saved = { [pair('LP:LR')]: '1.00', [pair('LM:LI')]: '3.00', [pair('LR:LM')]: '3.00', [pair('LP:LM')]: '' };
  const result = gridDeviations('same-hand-pair', saved);
  assert.equal(result.get(pair('LP:LR'))?.direction, 'slow');
  assert.equal(result.has(pair('LM:LI')), false);
  assert.equal(result.has(pair('LP:LM')), false);
});

test('偶数個の表の中央値は、中央の2つの平均', () => {
  // 中央値3.00。2.00は比2/3で遅い側、4.00は比4/3で速い側、3.00は無色
  const result = gridDeviations('same-hand-pair', leftPairs(['2.00', '3.00', '3.00', '4.00']));
  assert.equal(result.get(pair('LP:LR'))?.direction, 'slow');
  assert.equal(result.has(pair('LP:LM')), false);
  assert.equal(result.get(pair('LR:LM'))?.direction, 'fast');
});

test('左手の値で右手の表の色は変わらない', () => {
  const right = { [pair('RI:RM')]: '3.00', [pair('RI:RR')]: '3.00', [pair('RM:RR')]: '4.50', [pair('RI:RP')]: '3.00' };
  const alone = gridDeviations('same-hand-pair', right);
  const withLeft = gridDeviations('same-hand-pair', { ...right, ...leftPairs(['0.50', '0.50', '0.50', '9.00', '9.00', '9.00']) });
  assert.equal(alone.get(pair('RM:RR'))?.direction, 'fast');
  for (const id of Object.keys(right)) assert.deepEqual(withLeft.get(id), alone.get(id));
});

test('組ごとの表の値で方向別の表の色は変わらない', () => {
  const directed = { 'directed-pair:LM>LI': '3.00', 'directed-pair:LI>LM': '3.00', 'directed-pair:LR>LM': '3.00', 'directed-pair:LM>LR': '1.00' };
  const alone = gridDeviations('directed-pair', directed);
  const withPairs = gridDeviations('directed-pair', { ...directed, ...leftPairs(['9.00', '9.00', '9.00', '9.00']) });
  assert.deepEqual([...withPairs], [...alone]);
  assert.equal(alone.get('directed-pair:LM>LR')?.direction, 'slow');
  assert.equal(gridDeviations('same-hand-pair', directed).size, 0);
});
