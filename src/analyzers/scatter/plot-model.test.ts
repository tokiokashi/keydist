import assert from 'node:assert/strict';
import test from 'node:test';
import { scatterContour } from './axes.ts';
import {
  axisRange,
  estimateTextWidth,
  finerStep,
  levelsAtStep,
  niceTicks,
  PLOT_HEIGHT,
  PLOT_MARGIN,
  PLOT_WIDTH,
  scatterPlotModel,
} from './plot-model.ts';

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
  assert.ok(model.contours.length >= 4 && model.contours.length <= 6, `${model.contours.length}本`);
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
  assert.ok(model.contours.length >= 4);
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

test('finerStep: 1・2・5の列で刻みを1段ずつ細かくする', () => {
  const steps = [5];
  for (let i = 0; i < 9; i++) steps.push(finerStep(steps[steps.length - 1]!));
  assert.deepEqual(steps, [5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005]);
});

test('levelsAtStep: 値が6つ以内ならそのまま、範囲の端も含める', () => {
  assert.deepEqual(levelsAtStep({ lo: 0.5, hi: 3.5 }, 1), [1, 2, 3]);
  assert.deepEqual(levelsAtStep({ lo: 1, hi: 4 }, 1), [1, 2, 3, 4]);
  assert.deepEqual(levelsAtStep({ lo: 1.2, hi: 1.8 }, 1), []);
});

test('levelsAtStep: 値が6つを超えたら、平均が範囲の中点に最も近い連続する6つを残す', () => {
  // 中点10.5。連続する6つの平均が10.5になるのは8〜13
  assert.deepEqual(levelsAtStep({ lo: 0.5, hi: 20.5 }, 1), [8, 9, 10, 11, 12, 13]);
  // 中点5.5。3〜8
  assert.deepEqual(levelsAtStep({ lo: 0, hi: 11 }, 1), [3, 4, 5, 6, 7, 8]);
  // 刻みが小数でも同じ
  assert.deepEqual(levelsAtStep({ lo: 0.05, hi: 2.05 }, 0.1), [0.8, 0.9, 1, 1.1, 1.2, 1.3]);
});

test('levelsAtStep: 中点からの距離が同じ候補が2つある時は、小さい側を残す', () => {
  // 中点5。2〜7（平均4.5）と3〜8（平均5.5）が同じ距離なので、小さい側の2〜7
  assert.deepEqual(levelsAtStep({ lo: 0, hi: 10 }, 1), [2, 3, 4, 5, 6, 7]);
  assert.deepEqual(levelsAtStep({ lo: 0, hi: 1 }, 0.1), [0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);
  // 中点が範囲の端に近い側へ偏っていても、範囲に入る6つに収まる
  assert.deepEqual(levelsAtStep({ lo: 0, hi: 7 }, 1), [1, 2, 3, 4, 5, 6]);
});

test('scatterPlotModel: 細い線は、刻みを細かくして4本以上6本以下にする', () => {
  // 線の量（距離 = アクション数 × u/アクション の距離）が、図の中で狭い範囲に収まる点
  const contour = scatterContour('actions', 'meanPerStroke', 100, 'ja')!;
  const narrowPoints = () => [
    { targetKey: 'a', label: 'A', x: 100, y: 1.0 },
    { targetKey: 'b', label: 'B', x: 101, y: 1.02 },
  ];
  const narrow = scatterPlotModel({
    points: narrowPoints(),
    contour,
    legendRows: [],
    contourName: '',
    contourSuffix: '',
  });
  assert.ok(narrow.contours.length >= 4 && narrow.contours.length <= 6, `${narrow.contours.length}本`);
  const decimals = new Set(narrow.contours.map((line) => (line.text.split('.')[1] ?? '').length));
  assert.equal(decimals.size, 1, narrow.contours.map((line) => line.text).join(' '));
  // 線の量が図の中で一定（値の幅が0）の組は、線を引かない
  const flat = { ...contour, valueAt: () => 5 };
  const none = scatterPlotModel({ points: narrowPoints(), contour: flat, legendRows: [], contourName: '', contourSuffix: '' });
  assert.equal(none.contours.length, 0);
});

test('scatterPlotModel: 線を引かない組（線を引かない量）は、細い線も凡例の線の行も出さない', () => {
  const contour = scatterContour('perActionPresses', 'perPressUnits', 100, 'ja')!;
  assert.equal(contour.drawsLines, false);
  const model = scatterPlotModel({
    points: [
      { targetKey: 'a', label: 'A', x: 1.0, y: 1.0 },
      { targetKey: 'b', label: 'B', x: 1.5, y: 2.0 },
    ],
    contour,
    legendRows: ['かな配列'],
    contourName: 'u/アクション',
    contourSuffix: '',
  });
  assert.equal(model.contours.length, 0);
  assert.equal(model.legend!.rows.length, 1);
});

test('scatterPlotModel: 50%の線は、対象の軸の50%の位置に、範囲に入る時だけ引く', () => {
  const points = [
    { targetKey: 'a', label: 'A', x: 40, y: 60 },
    { targetKey: 'b', label: 'B', x: 65, y: 45 },
  ];
  const base = { points, contour: undefined, legendRows: ['かな配列'], contourName: '', contourSuffix: '' };
  const both = scatterPlotModel({ ...base, centerAxes: { x: true, y: true } });
  assert.deepEqual(
    both.centerLines.map((line) => line.axis),
    ['x', 'y'],
  );
  const x = both.centerLines.find((line) => line.axis === 'x')!;
  const y = both.centerLines.find((line) => line.axis === 'y')!;
  // 横軸の範囲は40〜65に余白を足した範囲なので、50%は枠の左右の間、縦軸も枠の上下の間
  assert.ok(x.position > PLOT_MARGIN.left && x.position < PLOT_WIDTH - PLOT_MARGIN.right);
  assert.ok(y.position > PLOT_MARGIN.top && y.position < PLOT_HEIGHT - PLOT_MARGIN.bottom);
  // 50%は点aとbの間: 横軸ではaが左、bが右
  const [a, b] = both.points;
  assert.ok(a!.px < x.position && x.position < b!.px);
  assert.ok(b!.py > y.position && y.position > a!.py);
  // 軸ごとに選べる。対象でない軸と、指定が無い時は引かない
  assert.deepEqual(
    scatterPlotModel({ ...base, centerAxes: { x: true, y: false } }).centerLines.map((line) => line.axis),
    ['x'],
  );
  assert.deepEqual(
    scatterPlotModel({ ...base, centerAxes: { x: false, y: true } }).centerLines.map((line) => line.axis),
    ['y'],
  );
  assert.equal(scatterPlotModel(base).centerLines.length, 0);
  // 50%が軸の範囲の外なら引かない
  const outside = scatterPlotModel({
    ...base,
    points: [
      { targetKey: 'a', label: 'A', x: 60, y: 20 },
      { targetKey: 'b', label: 'B', x: 80, y: 30 },
    ],
    centerAxes: { x: true, y: true },
  });
  assert.equal(outside.centerLines.length, 0);
  // 凡例の行は増えない
  assert.equal(both.legend!.rows.length, 1);
});

test('scatterPlotModel: 縦軸の名前は、一番広い目盛りの数字の左に、数字の幅によらず一定の間隔で置く', () => {
  const gaps = [
    [
      { x: 1, y: 0 },
      { x: 2, y: 1 },
    ],
    [
      { x: 1, y: 0 },
      { x: 2, y: 100 },
    ],
    [
      { x: 1, y: 10000 },
      { x: 2, y: 20000 },
    ],
    [
      { x: 1, y: 0.001 },
      { x: 2, y: 0.002 },
    ],
  ].map((values) => {
    const model = scatterPlotModel({
      points: values.map((value, index) => ({ targetKey: `k${index}`, label: `P${index}`, ...value })),
      contour: undefined,
      legendRows: [],
      contourName: '',
      contourSuffix: '',
    });
    const widest = Math.max(...model.yTicks.map((tick) => estimateTextWidth(tick.text)));
    // 目盛りの数字は枠の左から8px左に右端を揃えて置く
    return { gap: PLOT_MARGIN.left - 8 - widest - model.yTitleX, widest };
  });
  assert.ok(new Set(gaps.map((item) => item.widest)).size > 1, '数字の幅が違う組を試している');
  for (const item of gaps) assert.ok(Math.abs(item.gap - gaps[0]!.gap) < 1e-9, JSON.stringify(gaps));
});

function modelWithYValues(y0: number, y1: number) {
  return scatterPlotModel({
    points: [
      { targetKey: 'a', label: 'A', x: 1, y: y0 },
      { targetKey: 'b', label: 'B', x: 2, y: y1 },
    ],
    contour: undefined,
    legendRows: [],
    contourName: '',
    contourSuffix: '',
  });
}

function widestYTick(model: ReturnType<typeof modelWithYValues>): number {
  return Math.max(...model.yTicks.map((tick) => estimateTextWidth(tick.text)));
}

test('scatterPlotModel: 目盛りの数字が広くても、縦軸の名前は数字と重ならず、図の座標系の中に収まる', () => {
  // 回転した名前は、基準線から左へ10px、右へ3px張り出す。目盛りの数字は枠の左から8px左に右端を揃えて置く
  const narrow = modelWithYValues(0, 1);
  const narrowGap = PLOT_MARGIN.left - 8 - widestYTick(narrow) - narrow.yTitleX;
  for (const [y0, y1] of [
    [1e9, 2e9],
    [123456789, 987654321],
    [0.000001, 0.000002],
  ] as const) {
    const model = modelWithYValues(y0, y1);
    const widest = widestYTick(model);
    assert.ok(widest > 50, `幅${widest}`);
    const tickLeft = PLOT_MARGIN.left - 8 - widest;
    assert.ok(model.yTitleX + 3 < tickLeft, `名前の右端${model.yTitleX + 3}、数字の左端${tickLeft}`);
    assert.ok(model.yTitleX - 10 >= model.viewBoxX, `名前の左端${model.yTitleX - 10}、座標系の左端${model.viewBoxX}`);
    assert.ok(model.viewBoxX < 0);
    // 名前と数字の間隔は、狭い数字の時と同じ
    assert.ok(Math.abs(tickLeft - model.yTitleX - narrowGap) < 1e-9);
  }
});

test('scatterPlotModel: 名前の位置の下限に届かない目盛りの数字では、座標系を広げず、名前の位置は数字の幅だけで決まる', () => {
  for (const [y0, y1] of [
    [0, 1],
    [0, 100],
    [10000, 20000],
  ] as const) {
    const model = modelWithYValues(y0, y1);
    assert.equal(model.viewBoxX, 0);
    assert.equal(model.yTitleX, PLOT_MARGIN.left - 8 - widestYTick(model) - 11);
  }
});
