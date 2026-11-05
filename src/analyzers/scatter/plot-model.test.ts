import assert from 'node:assert/strict';
import test from 'node:test';
import { scatterContour } from './axes.ts';
import { axisRange, estimateTextWidth, niceTicks, PLOT_HEIGHT, PLOT_MARGIN, PLOT_WIDTH, scatterPlotModel } from './plot-model.ts';

test('axisRange: 点の値の範囲に余白を足し、0を含めることを強制しない', () => {
  const range = axisRange([100, 200]);
  assert.ok(range.lo > 0 && range.lo < 100);
  assert.ok(range.hi > 200);
  assert.deepEqual(axisRange([]), { lo: 0, hi: 1 });
});

test('axisRange: 値が全部0以上の時は余白で負の側へ出さず、全部同じ値でも幅を持つ', () => {
  assert.equal(axisRange([0, 10]).lo, 0);
  const flat = axisRange([5, 5]);
  assert.ok(flat.lo < 5 && flat.hi > 5);
  const zero = axisRange([0]);
  assert.ok(zero.hi > zero.lo);
});

test('niceTicks: 範囲に収まる切りのよい値を、刻みと一緒に返す', () => {
  const { values, step } = niceTicks({ lo: 0.3, hi: 9.2 }, 5);
  assert.equal(step, 2);
  assert.deepEqual(values, [2, 4, 6, 8]);
  assert.deepEqual(niceTicks({ lo: 1, hi: 1 }, 5).values, []);
  const small = niceTicks({ lo: 0.012, hi: 0.047 }, 4);
  assert.ok(small.values.every((value) => value >= 0.012 && value <= 0.047));
});

const POINTS = [
  { targetKey: 'a', label: 'QWERTY', x: 1000, y: 1.0 },
  { targetKey: 'b', label: 'Dvorak', x: 1500, y: 0.8 },
  { targetKey: 'c', label: 'NICOLA', x: 800, y: 1.4 },
];

test('scatterPlotModel: 点は図の内側に置かれ、値の大小と位置の向きが合う', () => {
  const model = scatterPlotModel({ points: POINTS, contour: undefined, contourName: '', contourSuffix: '' });
  assert.equal(model.points.length, 3);
  for (const point of model.points) {
    assert.ok(point.px >= PLOT_MARGIN.left && point.px <= PLOT_WIDTH - PLOT_MARGIN.right);
    assert.ok(point.py >= PLOT_MARGIN.top && point.py <= PLOT_HEIGHT - PLOT_MARGIN.bottom);
  }
  const [a, b, c] = model.points;
  // 横軸は右ほど大きく、縦軸は上ほど大きい
  assert.ok(b!.px > a!.px && a!.px > c!.px);
  assert.ok(c!.py < a!.py && a!.py < b!.py);
  assert.equal(model.contours.length, 0);
});

test('scatterPlotModel: 点の名前は、他の名前と重ならない場所に置く', () => {
  // 同じ位置にある2点でも、名前は別の置き場所になる
  const model = scatterPlotModel({
    points: [
      { targetKey: 'a', label: 'とても長い名前の配列A', x: 10, y: 10 },
      { targetKey: 'b', label: 'とても長い名前の配列B', x: 10.01, y: 10 },
    ],
    contour: undefined,
    contourName: '',
    contourSuffix: '',
  });
  const [a, b] = model.points;
  assert.notDeepEqual(a!.labelAt, b!.labelAt);
  assert.ok(estimateTextWidth('QWERTY') < estimateTextWidth('かな配列'));
});

test('scatterPlotModel: 等位線は切りのよい値で数本、図の中だけに引き、線の端に名前と値を書く', () => {
  const contour = scatterContour('actions', 'meanPerStroke', 100)!;
  const model = scatterPlotModel({ points: POINTS, contour, contourName: '距離', contourSuffix: '' });
  assert.ok(model.contours.length >= 2 && model.contours.length <= 6, `${model.contours.length}本`);
  for (const line of model.contours) {
    assert.match(line.text, /^距離 \d+$/);
    assert.ok(line.labelAt !== undefined);
    assert.ok(line.labelAt!.x <= PLOT_WIDTH - PLOT_MARGIN.right + 1e-6 && line.labelAt!.x >= PLOT_MARGIN.left);
    // 線の座標は図の中に収まる
    for (const match of line.d.matchAll(/[ML]([\d.]+),([\d.]+)/g)) {
      const [x, y] = [Number(match[1]), Number(match[2])];
      assert.ok(x >= PLOT_MARGIN.left - 0.1 && x <= PLOT_WIDTH - PLOT_MARGIN.right + 0.1);
      assert.ok(y >= PLOT_MARGIN.top - 0.1 && y <= PLOT_HEIGHT - PLOT_MARGIN.bottom + 0.1);
    }
  }
  const levels = model.contours.map((line) => line.level);
  assert.deepEqual(
    levels,
    [...levels].sort((p, q) => p - q),
  );
});

test('scatterPlotModel: 率の等位線は単位を付け、値が決まらない領域には線を引かない', () => {
  const contour = scatterContour('handSwitches', 'handContinuations', 100)!;
  const model = scatterPlotModel({
    points: [
      { targetKey: 'a', label: 'A', x: 100, y: 300 },
      { targetKey: 'b', label: 'B', x: 150, y: 250 },
    ],
    contour,
    contourName: '同じ手の続きの割合',
    contourSuffix: '%',
  });
  assert.ok(model.contours.length > 0);
  assert.ok(model.contours.every((line) => line.text.endsWith('%')));
  // 点が無い時は、軸の目盛りだけを返す
  const empty = scatterPlotModel({ points: [], contour, contourName: 'x', contourSuffix: '' });
  assert.equal(empty.points.length, 0);
  assert.equal(empty.contours.length, 0);
});
