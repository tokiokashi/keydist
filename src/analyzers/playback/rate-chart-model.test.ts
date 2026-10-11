import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlaybackRateChartPoint } from '#interpretation/timing/playback.ts';
import {
  RATE_CHART_DOT_LIMIT,
  RATE_CHART_MARGIN,
  RATE_CHART_WIDTH,
  rateChartModel,
  rateChartPositionAt,
  rateChartReadout,
  rateChartX,
} from './rate-chart-model.ts';

/** 抽出が出す点の形を、座標の検査に使う小さな値で組む。 */
function points(entries: readonly Partial<PlaybackRateChartPoint>[]): PlaybackRateChartPoint[] {
  return [{ cursor: 0, inputText: '' }, ...entries.map((entry, index) => ({ cursor: index + 1, inputText: '', ...entry }))];
}

const BOTH = { chain: true, arpeggio: true };
const NONE = { chain: false, arpeggio: false };

test('打鍵が無い時はモデルを作らない', () => {
  assert.equal(rateChartModel([{ cursor: 0, inputText: '' }], BOTH), undefined);
});

test('座標: 位置0は左端、最後の位置は右端で、位置から座標へ往復できる', () => {
  assert.equal(rateChartX(0, 4), RATE_CHART_MARGIN.left);
  assert.equal(rateChartX(4, 4), RATE_CHART_WIDTH - RATE_CHART_MARGIN.right);
  for (const position of [0, 1, 2, 3, 4]) assert.equal(rateChartPositionAt(rateChartX(position, 4), 4), position);
  // 範囲の外は端に丸める
  assert.equal(rateChartPositionAt(-50, 4), 0);
  assert.equal(rateChartPositionAt(RATE_CHART_WIDTH + 50, 4), 4);
});

test('縦軸は最大値の1.1倍（下限は1.1）で、値の無い点は線に含めない', () => {
  const model = rateChartModel(points([{ actionsPerSecond: 2 }, { kanaPerSecond: 1, actionsPerSecond: 3 }]), NONE)!;
  assert.equal(model.yMax, 3 * 1.1);
  assert.deepEqual(model.yTicks.map((tick) => tick.value), [0, 3 * 1.1 * 0.5, 3 * 1.1]);
  // かな/秒は位置2の1点だけ、アクション/秒は位置1・2の2点
  assert.equal(model.kanaDots.length, 1);
  assert.equal(model.actionDots.length, 2);
  assert.match(model.kanaPath, /^M[\d.]+,[\d.]+$/);
  assert.match(model.actionPath, /^M[\d.]+,[\d.]+ L[\d.]+,[\d.]+$/);
  const low = rateChartModel(points([{ actionsPerSecond: 0.2 }]), NONE)!;
  assert.equal(low.yMax, 1.1);
});

test('帯: 連続する区間を1本にまとめ、表示を選んだ種類だけを作る', () => {
  // 位置1・2がChain、位置4がArpeggio、位置5・6がChain。位置Nの点はステップN（位置N-1からNの間）を表す
  const data = points([{ chain: true }, { chain: true }, {}, { arpeggio: true }, { chain: true }, { chain: true }]);
  const both = rateChartModel(data, BOTH)!;
  const span = (from: number, to: number) => ({ x: rateChartX(from, 6), width: rateChartX(to, 6) - rateChartX(from, 6) });
  assert.deepEqual(both.bands, [
    { kind: 'chain', ...span(0, 2) },
    { kind: 'chain', ...span(4, 6) },
    { kind: 'arpeggio', ...span(3, 4) },
  ]);
  assert.deepEqual(rateChartModel(data, { chain: true, arpeggio: false })!.bands.map((band) => band.kind), ['chain', 'chain']);
  assert.deepEqual(rateChartModel(data, { chain: false, arpeggio: true })!.bands.map((band) => band.kind), ['arpeggio']);
  assert.deepEqual(rateChartModel(data, NONE)!.bands, []);
});

test('点の丸は、点が多い時は描かない', () => {
  const few = rateChartModel(points(Array.from({ length: RATE_CHART_DOT_LIMIT - 1 }, () => ({ actionsPerSecond: 1 }))), NONE)!;
  assert.equal(few.actionDots.length, RATE_CHART_DOT_LIMIT - 1);
  const many = rateChartModel(points(Array.from({ length: RATE_CHART_DOT_LIMIT }, () => ({ actionsPerSecond: 1 }))), NONE)!;
  assert.equal(many.actionDots.length, 0);
  assert.notEqual(many.actionPath, '');
});

test('横軸の目盛りは先頭・中央・末尾で、打鍵が1つなら重ならない', () => {
  assert.deepEqual(rateChartModel(points([{}, {}, {}, {}]), NONE)!.xTicks.map((tick) => tick.value), [0, 2, 4]);
  assert.deepEqual(rateChartModel(points([{}]), NONE)!.xTicks.map((tick) => tick.value), [0, 1]);
});

test('読み上げ: 値の無い項目は「—」、あれば小数2桁', () => {
  assert.equal(
    rateChartReadout({ cursor: 2, inputText: 'かあ', kanaPerSecond: 1 / 1.2, actionsPerSecond: 1.25 }),
    '2ステップ目、集計入力「かあ」、かな/秒は0.83、アクション/秒は1.25',
  );
  assert.equal(
    rateChartReadout({ cursor: 0, inputText: '' }),
    '0ステップ目、集計入力「—」、かな/秒は—、アクション/秒は—',
  );
});
