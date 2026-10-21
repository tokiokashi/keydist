import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHART_DOT_LIMIT, CHART_MARGIN, CHART_PLOT_HEIGHT, chartX } from '../chart-frame.ts';
import { adjacentRunChartTarget, linePathOf, nearestRunChartTarget, runChartModel, runChartReadout } from './chart-model.ts';
import type { RunChartSeriesOk } from './extract.ts';

function seriesOf(partial: Partial<RunChartSeriesOk> & Pick<RunChartSeriesOk, 'targetKey'>): RunChartSeriesOk {
  const positions = partial.positions ?? [0, 1, 2, 3];
  return {
    kind: 'ok',
    inputChars: 4,
    positions,
    values: positions.map(() => 1),
    denominators: positions.map(() => 50),
    center: 1,
    guideScale: 0.3,
    ...partial,
  };
}

test('描く系列が無い、またはテキストが空ならモデルは作らない', () => {
  assert.equal(runChartModel([], 'perCharUnits'), undefined);
  assert.equal(runChartModel([{ targetKey: 'a', data: seriesOf({ targetKey: 'a', inputChars: 0, positions: [] }) }], 'perCharUnits'), undefined);
});

test('点の横位置は、文字位置eの文字の右端（e + 1）に置く', () => {
  const model = runChartModel([{ targetKey: 'a', data: seriesOf({ targetKey: 'a' }) }], 'perCharUnits')!;
  assert.deepEqual(
    model.series[0]!.hits.map((hit) => hit.x),
    [1, 2, 3, 4].map((at) => chartX(at, 4)),
  );
  assert.deepEqual(
    model.series[0]!.hits.map((hit) => hit.position),
    [0, 1, 2, 3],
  );
});

test('欠け（null）の点で線を切り、押せる点にも数えない', () => {
  const data = seriesOf({ targetKey: 'a', values: [1, null, 1, 1] });
  const model = runChartModel([{ targetKey: 'a', data }], 'perCharUnits')!;
  assert.equal(model.series[0]!.linePath.match(/M/g)?.length, 2);
  assert.deepEqual(
    model.series[0]!.hits.map((hit) => hit.position),
    [0, 2, 3],
  );
});

test('割合の指標は、縦軸を%で描く（抽出の値を100倍する）', () => {
  const data = seriesOf({ targetKey: 'a', values: [0.1, 0.2, 0.3, 0.4], center: 0.25, guideScale: 0 });
  const model = runChartModel([{ targetKey: 'a', data }], 'sameFingerRate')!;
  assert.ok(Math.abs(model.yMax - 40 * 1.1) < 1e-9);
  assert.ok(Math.abs(model.yTicks[2]!.value - model.yMax) < 1e-9);
});

test('目安線は中心線の上と下に引き、下側は0より下に引かない', () => {
  const wide = seriesOf({ targetKey: 'a', center: 1, guideScale: 100, denominators: [1, 1, 1, 1] });
  const model = runChartModel([{ targetKey: 'a', data: wide }], 'perCharUnits')!;
  const lowerYs = [...model.series[0]!.lowerPath.matchAll(/,([\d.]+)/g)].map((m) => Number(m[1]));
  const zeroY = CHART_MARGIN.top + CHART_PLOT_HEIGHT;
  assert.ok(lowerYs.every((y) => Math.abs(y - zeroY) < 0.01));
  const upperYs = [...model.series[0]!.upperPath.matchAll(/,(-?[\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(upperYs.every((y) => y < model.series[0]!.centerY!));
});

test('目安線の幅は範囲の分母が大きいほど狭い', () => {
  const data = seriesOf({ targetKey: 'a', guideScale: 3, denominators: [1, 4, 16, 64] });
  const model = runChartModel([{ targetKey: 'a', data }], 'perCharUnits')!;
  const ys = [...model.series[0]!.upperPath.matchAll(/,(-?[\d.]+)/g)].map((m) => Number(m[1]));
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i]! > ys[i - 1]!, '分母が大きい点ほど中心線に近い（yが大きい）');
});

test('点が上限を超える長い列では丸を描かず、線だけにする', () => {
  const positions = Array.from({ length: CHART_DOT_LIMIT + 1 }, (_, i) => i);
  const model = runChartModel(
    [
      {
        targetKey: 'a',
        data: seriesOf({ targetKey: 'a', inputChars: positions.length, positions, values: positions.map(() => 1), denominators: positions.map(() => 5) }),
      },
    ],
    'perCharUnits',
  )!;
  assert.equal(model.series[0]!.dots.length, 0);
  const few = runChartModel([{ targetKey: 'a', data: seriesOf({ targetKey: 'a' }) }], 'perCharUnits')!;
  assert.equal(few.series[0]!.dots.length, 4);
});

test('点が多い列は、画素ごとに最初・最後・最小・最大だけを残してパスを短くし、極値は失わない', () => {
  const points = Array.from({ length: 30000 }, (_, i) => ({ x: 54 + (i / 30000) * 688, y: i === 12345 ? 5 : 100 + (i % 7) }));
  const path = linePathOf(points);
  assert.ok(path.split(' ').length < 6000);
  assert.ok(path.includes(',5'), '極値を残す');
});

test('押した位置に最も近い点を選ぶ。点の丸を描かない長い列でも同じ', () => {
  const positions = Array.from({ length: 1000 }, (_, i) => i);
  const data = seriesOf({
    targetKey: 'a',
    inputChars: 1000,
    positions,
    values: positions.map((i) => 1 + (i % 10) / 100),
    denominators: positions.map(() => 50),
  });
  const model = runChartModel([{ targetKey: 'a', data }], 'perCharUnits')!;
  assert.equal(model.series[0]!.dots.length, 0);
  const target = model.series[0]!.hits[500]!;
  const found = nearestRunChartTarget(model, target.x + 0.1, target.y)!;
  assert.equal(found.hit.position, 500);
  // 端の外を押しても端の点が選ばれる
  assert.equal(nearestRunChartTarget(model, 0, 0)!.hit.position, 0);
  assert.equal(nearestRunChartTarget(model, 10000, 0)!.hit.position, 999);
});

test('複数の系列では、横位置が近い点のうち図の上の距離が最も近い系列を選ぶ', () => {
  const low = seriesOf({ targetKey: 'low', values: [1, 1, 1, 1], center: 1 });
  const high = seriesOf({ targetKey: 'high', values: [3, 3, 3, 3], center: 3 });
  const model = runChartModel(
    [
      { targetKey: 'low', data: low },
      { targetKey: 'high', data: high },
    ],
    'perCharUnits',
  )!;
  const lowHit = model.series[0]!.hits[2]!;
  const highHit = model.series[1]!.hits[2]!;
  assert.equal(nearestRunChartTarget(model, lowHit.x, lowHit.y + 1)!.seriesIndex, 0);
  assert.equal(nearestRunChartTarget(model, highHit.x, highHit.y - 1)!.seriesIndex, 1);
});

test('キーボードでは選んだ系列の隣の点へ動き、端で止まる', () => {
  const model = runChartModel([{ targetKey: 'a', data: seriesOf({ targetKey: 'a', values: [1, null, 1, 1] }) }], 'perCharUnits')!;
  const first = model.series[0]!.hits[0]!;
  const start = { seriesIndex: 0, hit: first };
  // 欠けの点は飛ばして次の値のある点へ
  assert.equal(adjacentRunChartTarget(model, start, 1).hit.position, 2);
  assert.equal(adjacentRunChartTarget(model, start, -1).hit.position, 0);
  assert.equal(adjacentRunChartTarget(model, start, 99).hit.position, 3);
});

test('読み上げは文字位置を先頭が1の「何文字目」で書き、中心線と目安線の幅を添える', () => {
  const data = seriesOf({ targetKey: 'a', values: [1.2, 1, 1, 1], center: 1, guideScale: 0.4, denominators: [4, 50, 50, 50] });
  const text = runChartReadout('QWERTY', 'perCharUnits', data, 0);
  assert.match(text, /^QWERTY、1文字目、1\.200 u\/文字（直近4文字）、中心線1\.000 u\/文字、目安線0\.800 u\/文字から1\.200 u\/文字$/);
  const rate = runChartReadout(
    'X',
    'sameFingerRate',
    seriesOf({ targetKey: 'a', values: [0.1], positions: [0], denominators: [20], center: 0.2, guideScale: 0 }),
    0,
  );
  assert.match(rate, /10\.0%（直近20打鍵）/);
});
