import assert from 'node:assert/strict';
import test from 'node:test';
import { scatterContour } from './axes.ts';
import { axisRange, estimateTextWidth, niceTicks, PLOT_HEIGHT, PLOT_MARGIN, PLOT_WIDTH, reciprocalLevels, scatterPlotModel } from './plot-model.ts';

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
  const model = scatterPlotModel({ points: POINTS, contour: undefined, legendRows: [], contourName: '', contourSuffix: '' });
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
    legendRows: [],
    contourName: '',
    contourSuffix: '',
  });
  const [a, b] = model.points;
  assert.notDeepEqual(a!.labelAt, b!.labelAt);
  assert.ok(estimateTextWidth('QWERTY') < estimateTextWidth('QWERTY最適化'));
});

test('scatterPlotModel: 細い線は切りのよい値で数本、図の中だけに引き、線の上に値だけを書く', () => {
  const contour = scatterContour('actions', 'meanPerStroke', 100, 'ja')!;
  const model = scatterPlotModel({ points: POINTS, contour, legendRows: [], contourName: '', contourSuffix: '' });
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
  const contour = scatterContour('handSwitches', 'handContinuations', 100, 'ja')!;
  const model = scatterPlotModel({
    points: [
      { targetKey: 'a', label: 'A', x: 100, y: 300 },
      { targetKey: 'b', label: 'B', x: 150, y: 250 },
    ],
    contour,
    legendRows: [],
    contourName: '',
    contourSuffix: '%',
  });
  assert.ok(model.contours.length > 0);
  assert.ok(model.contours.every((line) => /^\d+(\.\d+)?%$/.test(line.text)));
  // 点が無い時は、軸の目盛りだけを返す
  const empty = scatterPlotModel({ points: [], contour, legendRows: [], contourName: '', contourSuffix: '' });
  assert.equal(empty.points.length, 0);
  assert.equal(empty.contours.length, 0);
});

test('scatterPlotModel: 細い線の値の桁は、同じ図の線で揃える', () => {
  const contour = scatterContour('actions', 'meanPerStroke', 100, 'ja')!;
  const model = scatterPlotModel({
    points: [
      { targetKey: 'a', label: 'A', x: 1.0, y: 1.0 },
      { targetKey: 'b', label: 'B', x: 1.2, y: 1.3 },
    ],
    contour,
    legendRows: [],
    contourName: '',
    contourSuffix: '',
  });
  assert.ok(model.contours.length >= 2);
  const decimals = new Set(model.contours.map((line) => (line.text.split('.')[1] ?? '').length));
  assert.equal(decimals.size, 1, model.contours.map((line) => line.text).join(' '));
});

test('scatterPlotModel: 細い線の値は、点と点の名前の上に重ねない', () => {
  const contour = scatterContour('actions', 'meanPerStroke', 100, 'ja')!;
  const model = scatterPlotModel({ points: POINTS, contour, legendRows: [], contourName: '', contourSuffix: '' });
  for (const line of model.contours) {
    const at = line.labelAt!;
    const width = estimateTextWidth(line.text);
    const rect = { x0: at.x - width, x1: at.x, y0: at.y - 10, y1: at.y + 3 };
    for (const point of model.points) {
      const overlapsMark = rect.x0 < point.px + 7 && point.px - 7 < rect.x1 && rect.y0 < point.py + 7 && point.py - 7 < rect.y1;
      assert.equal(overlapsMark, false, `${line.text}と${point.label}の点`);
    }
  }
});

// 右端と下に点が集まる多数の配列。点の名前どうしの重なりは検査しない
const CROWD = Array.from({ length: 40 }, (_, i) => ({
  targetKey: `k${i}`,
  label: i % 3 === 0 ? 'Semimak JQ' : `配列${i}`,
  x: i < 14 ? 1.78 + (i % 2) * 0.01 : 1.2 + ((i * 37) % 60) / 100,
  y: i < 14 ? 0.25 + i * 0.01 : 0.3 + ((i * 53) % 70) / 100,
}));

test('scatterPlotModel: 点の名前は、置ける場所があれば描画領域の枠の外に出さない', () => {
  const model = scatterPlotModel({ points: CROWD, contour: undefined, legendRows: [], contourName: '', contourSuffix: '' });
  for (const point of model.points) {
    const width = estimateTextWidth(point.label);
    const { x, y, anchor } = point.labelAt;
    const x0 = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
    assert.ok(x0 >= PLOT_MARGIN.left + 2 && x0 + width <= PLOT_WIDTH - PLOT_MARGIN.right - 2, `${point.label} x=${point.px.toFixed(0)}`);
    assert.ok(y - 10.5 >= PLOT_MARGIN.top + 2 && y + 3.5 <= PLOT_HEIGHT - PLOT_MARGIN.bottom - 2, `${point.label} y=${point.py.toFixed(0)}`);
  }
});

test('scatterPlotModel: 細い線の値は、枠の線・点・点の名前に重ねず、置ける場所が無い線では省く', () => {
  const contour = scatterContour('perCharPresses', 'perPressUnits', 100, 'ja')!;
  const model = scatterPlotModel({ points: CROWD, contour, legendRows: [], contourName: '', contourSuffix: '' });
  assert.ok(model.contours.length > 0);
  for (const line of model.contours) {
    if (line.labelAt === undefined) continue;
    const width = estimateTextWidth(line.text);
    const rect = { x0: line.labelAt.x - width, x1: line.labelAt.x, y0: line.labelAt.y - 10.5, y1: line.labelAt.y + 3.5 };
    assert.ok(rect.x0 > PLOT_MARGIN.left && rect.x1 < PLOT_WIDTH - PLOT_MARGIN.right, `${line.text}の左右`);
    assert.ok(rect.y0 > PLOT_MARGIN.top && rect.y1 < PLOT_HEIGHT - PLOT_MARGIN.bottom, `${line.text}の上下`);
    const hits = (r: { x0: number; x1: number; y0: number; y1: number }) => rect.x0 < r.x1 && r.x0 < rect.x1 && rect.y0 < r.y1 && r.y0 < rect.y1;
    for (const point of model.points) {
      assert.equal(hits({ x0: point.px - 7, x1: point.px + 7, y0: point.py - 7, y1: point.py + 7 }), false, `${line.text}と${point.label}の点`);
      const w = estimateTextWidth(point.label);
      const { x, y, anchor } = point.labelAt;
      const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
      assert.equal(hits({ x0, x1: x0 + w, y0: y - 10.5, y1: y + 3.5 }), false, `${line.text}と${point.label}の名前`);
    }
  }
});

test('scatterPlotModel: 凡例は枠の中の隅に置き、点と重ならない隅を選ぶ。細い線の行は線がある時だけ付く', () => {
  const contour = scatterContour('actions', 'meanPerStroke', 100, 'ja')!;
  const withLine = scatterPlotModel({ points: POINTS, contour, legendRows: ['かな配列', '英字の配列'], contourName: '距離', contourSuffix: '' });
  assert.equal(withLine.legend!.rows.length, 3);
  assert.equal(withLine.legend!.rows[2]!.text, '距離');
  const without = scatterPlotModel({ points: POINTS, contour: undefined, legendRows: ['かな配列'], contourName: '距離', contourSuffix: '' });
  assert.equal(without.legend!.rows.length, 1);
  assert.equal(scatterPlotModel({ points: [], contour: undefined, legendRows: [], contourName: '', contourSuffix: '' }).legend, undefined);
  for (const model of [
    withLine,
    without,
    scatterPlotModel({ points: CROWD, contour: undefined, legendRows: ['かな配列', '英字の配列'], contourName: '', contourSuffix: '' }),
  ]) {
    const box = model.legend!;
    assert.ok(
      box.x0 >= PLOT_MARGIN.left && box.x1 <= PLOT_WIDTH - PLOT_MARGIN.right && box.y0 >= PLOT_MARGIN.top && box.y1 <= PLOT_HEIGHT - PLOT_MARGIN.bottom,
    );
    for (const point of model.points) {
      const hit = box.x0 < point.px + 7 && point.px - 7 < box.x1 && box.y0 < point.py + 7 && point.py - 7 < box.y1;
      assert.equal(hit, false, `凡例と${point.label}の点`);
    }
  }
  // 右上に点がある時は、右上を避けて別の隅に置く
  const crowded = scatterPlotModel({
    points: [
      { targetKey: 'a', label: 'A', x: 0, y: 0 },
      { targetKey: 'b', label: 'B', x: 10, y: 10 },
    ],
    contour: undefined,
    legendRows: ['かな配列'],
    contourName: '',
    contourSuffix: '',
  });
  assert.ok(crowded.legend!.x0 < PLOT_WIDTH / 2, '右上に点があるので左側の隅');
});

test('scatterPlotModel: 細い線の値は凡例に重ねない', () => {
  const contour = scatterContour('actions', 'meanPerStroke', 100, 'ja')!;
  const model = scatterPlotModel({ points: CROWD, contour, legendRows: ['かな配列', '英字の配列'], contourName: '距離', contourSuffix: '' });
  const box = model.legend!;
  for (const line of model.contours) {
    if (line.labelAt === undefined) continue;
    const width = estimateTextWidth(line.text);
    const hit = box.x0 < line.labelAt.x && line.labelAt.x - width < box.x1 && box.y0 < line.labelAt.y + 3 && line.labelAt.y - 10 < box.y1;
    assert.equal(hit, false, line.text);
  }
});

test('estimateTextWidth: ブラウザで描いた点の名前の幅（11px、実測）以上になる', () => {
  // 全43配列の名前をブラウザで描いて測ったbboxの幅。見積もりが狭いと、名前が枠の外へ出たり線の値に重なったりする
  const measured: ReadonlyArray<readonly [string, number]> = [
    ['QWERTY', 47.8],
    ['QWERTY最適化', 80.5],
    ['Dvorak', 36.8],
    ['Colemak', 45.5],
    ['Colemak-DH', 66.2],
    ['Workman', 49.5],
    ['Eucalyn配列', 62.9],
    ['Astarte', 37.4],
    ['Tomisuke配列', 71.5],
    ['Semimak JQ', 65.3],
    ['APTv3', 34],
    ['Colemak-DH（ANSI）', 113.9],
    ['Canary（ANSI）', 85.1],
    ['Sturdy（ANSI）', 81.8],
    ['Graphite', 44.3],
    ['MTGAP', 39.2],
    ['Norman', 41.5],
    ['QGMLWY', 51.1],
    ['TK音直入力法', 69.2],
    ['親指シフト（NICOLA）', 118.1],
    ['新JIS（逐次シフト）', 103.9],
    ['月配列2-263式', 75.5],
    ['月配列U9', 47.8],
    ['月配列E-X', 51.7],
    ['かわせみ配列+', 73],
    ['JISかな配列', 60.1],
  ];
  for (const [text, width] of measured) assert.ok(estimateTextWidth(text) >= width, `${text}: 見積もり${estimateTextWidth(text)} < 実測${width}`);
});

test('scatterPlotModel: 値が0の点が枠の下の端にあっても、幅の広い名前は枠の中へ寄せて置く', () => {
  const model = scatterPlotModel({
    points: [
      { targetKey: 'a', label: 'QWERTY最適化', x: 10, y: 0 },
      { targetKey: 'b', label: 'B', x: 0, y: 5 },
    ],
    contour: undefined,
    legendRows: [],
    contourName: '',
    contourSuffix: '',
  });
  const a = model.points[0]!;
  assert.ok(a.py >= PLOT_HEIGHT - PLOT_MARGIN.bottom - 1e-6, '点は下の端');
  const width = estimateTextWidth(a.label);
  const { x, y, anchor } = a.labelAt;
  const x0 = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
  assert.ok(x0 >= PLOT_MARGIN.left + 2 && x0 + width <= PLOT_WIDTH - PLOT_MARGIN.right - 2);
  assert.ok(y - 10.5 >= PLOT_MARGIN.top + 2 && y + 3.5 <= PLOT_HEIGHT - PLOT_MARGIN.bottom - 2);
});

test('reciprocalLevels: 比の線は、1と、比とその逆数の組から範囲に入る値を選び、丸めずに書ける刻みを返す', () => {
  assert.deepEqual(reciprocalLevels({ lo: 0.4, hi: 3 }), { levels: [0.5, 0.8, 1, 1.25, 2], step: 0.01 });
  // 範囲が1の片側だけでも、範囲に入る値を引く
  assert.deepEqual(reciprocalLevels({ lo: 1.1, hi: 2.5 }).levels, [1.25, 2]);
  assert.deepEqual(reciprocalLevels({ lo: 0.6, hi: 1.1 }), { levels: [0.8, 1], step: 0.1 });
  // 範囲が広い時も6本までで、どの値も逆数が一緒に選ばれる
  const { levels } = reciprocalLevels({ lo: 0.01, hi: 100 });
  assert.ok(levels.length <= 6);
  for (const level of levels)
    assert.ok(
      levels.some((other) => Math.abs(other * level - 1) < 1e-12),
      `${level}`,
    );
});

test('scatterPlotModel: 左右の押下と距離の割合の図は、比とその逆数の組で線を引き、値の桁をそろえる', () => {
  const contour = scatterContour('rightHandPressShare', 'rightHandDistanceShare', 100, 'ja')!;
  assert.equal(contour.levels, 'reciprocal');
  const points = [
    { targetKey: 'a', label: 'A', x: 40, y: 60 },
    { targetKey: 'b', label: 'B', x: 65, y: 45 },
    { targetKey: 'c', label: 'C', x: 50, y: 52 },
  ];
  const model = scatterPlotModel({ points, contour, legendRows: [], contourName: '', contourSuffix: '' });
  assert.deepEqual(
    model.contours.map((line) => line.level),
    [0.5, 0.8, 1, 1.25, 2],
  );
  assert.deepEqual(
    model.contours.map((line) => line.text),
    ['0.50', '0.80', '1.00', '1.25', '2.00'],
  );
  // 他の恒等式は、切りのよい値を等間隔に選ぶ
  assert.equal(scatterContour('actions', 'meanPerStroke', 100, 'ja')!.levels, 'linear');
});
