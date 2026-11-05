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
  const model = scatterPlotModel({ points: POINTS, contour: undefined, contourSuffix: '' });
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
    contourSuffix: '',
  });
  const [a, b] = model.points;
  assert.notDeepEqual(a!.labelAt, b!.labelAt);
  assert.ok(estimateTextWidth('QWERTY') < estimateTextWidth('かな配列'));
});

test('scatterPlotModel: 細い線は切りのよい値で数本、図の中だけに引き、線の上に値だけを書く', () => {
  const contour = scatterContour('actions', 'meanPerStroke', 100)!;
  const model = scatterPlotModel({ points: POINTS, contour, contourSuffix: '' });
  assert.ok(model.contours.length >= 2 && model.contours.length <= 6, `${model.contours.length}本`);
  for (const line of model.contours) {
    // 量の名前は書かず、値だけ
    assert.match(line.text, /^\d+$/);
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

test('scatterPlotModel: 率の細い線は値に単位を付け、値が決まらない領域には線を引かない', () => {
  const contour = scatterContour('handSwitches', 'handContinuations', 100)!;
  const model = scatterPlotModel({
    points: [
      { targetKey: 'a', label: 'A', x: 100, y: 300 },
      { targetKey: 'b', label: 'B', x: 150, y: 250 },
    ],
    contour,
    contourSuffix: '%',
  });
  assert.ok(model.contours.length > 0);
  assert.ok(model.contours.every((line) => /^\d+(\.\d+)?%$/.test(line.text)));
  // 点が無い時は、軸の目盛りだけを返す
  const empty = scatterPlotModel({ points: [], contour, contourSuffix: '' });
  assert.equal(empty.points.length, 0);
  assert.equal(empty.contours.length, 0);
});

test('scatterPlotModel: 細い線の値の桁は、同じ図の線で揃える', () => {
  const contour = scatterContour('actions', 'meanPerStroke', 100)!;
  const model = scatterPlotModel({
    points: [
      { targetKey: 'a', label: 'A', x: 1.0, y: 1.0 },
      { targetKey: 'b', label: 'B', x: 1.2, y: 1.3 },
    ],
    contour,
    contourSuffix: '',
  });
  assert.ok(model.contours.length >= 2);
  const decimals = new Set(model.contours.map((line) => (line.text.split('.')[1] ?? '').length));
  assert.equal(decimals.size, 1, model.contours.map((line) => line.text).join(' '));
});

test('scatterPlotModel: 細い線の値は、点と点の名前の上に重ねない', () => {
  const contour = scatterContour('actions', 'meanPerStroke', 100)!;
  const model = scatterPlotModel({ points: POINTS, contour, contourSuffix: '' });
  for (const line of model.contours) {
    const at = line.labelAt!;
    const width = estimateTextWidth(line.text);
    const rect = { x0: at.x - 4 - width, x1: at.x - 4, y0: at.y - 14, y1: at.y - 2 };
    for (const point of model.points) {
      const overlapsMark = rect.x0 < point.px + 7 && point.px - 7 < rect.x1 && rect.y0 < point.py + 7 && point.py - 7 < rect.y1;
      assert.equal(overlapsMark, false, `${line.text}と${point.label}の点`);
    }
  }
});
