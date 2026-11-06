import assert from 'node:assert/strict';
import test from 'node:test';
import { scatterContour } from './axes.ts';
import {
  axisRange,
  estimateTextWidth,
  finerStep,
  levelsAtStep,
  MARK_RADIUS,
  niceTicks,
  PLOT_HEIGHT,
  PLOT_MARGIN,
  PLOT_WIDTH,
  scatterPlotModel,
  type PlotName,
  type PlotRect,
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

const NO_LINES = { contour: undefined, legendRows: [], contourName: '', contourSuffix: '' } as const;

function overlapsRect(a: PlotRect, b: PlotRect): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** 名前の長方形どうしの交差の組の数。 */
function nameOverlapCount(names: readonly PlotName[]): number {
  let count = 0;
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (overlapsRect(names[i]!.rect, names[j]!.rect)) count++;
  return count;
}

function markRect(point: { readonly px: number; readonly py: number }, radius = MARK_RADIUS): PlotRect {
  return { x0: point.px - radius, x1: point.px + radius, y0: point.py - radius, y1: point.py + radius };
}

function nameTexts(name: PlotName): string[] {
  return name.lines.map((line) => line.text);
}

/** 例の15配列（既定のテキスト、既定の設定）の、組み合わせごとの値。名前の置き場所の検査に使う。 */
const EXAMPLE_PRESS = [
  { targetKey: 'oonishi', label: '大西配列', x: 1.0, y: 1.777 },
  { targetKey: 'seoto', label: 'せおと配列', x: 1.03, y: 1.719 },
  { targetKey: 'yumi', label: '弓配列', x: 1.0, y: 1.407 },
  { targetKey: 'gekkou', label: '中指シフト月光', x: 1.0, y: 1.346 },
  { targetKey: 'tsuki-ringo', label: '月林檎配列', x: 1.0, y: 1.322 },
  { targetKey: 'tsukimisou-extract', label: '月見草エキス配列', x: 1.0, y: 1.319 },
  { targetKey: 'tsuki-2-263', label: '月配列2-263式', x: 1.0, y: 1.339 },
  { targetKey: 'tk-onchoku', label: 'TK音直入力法', x: 1.187, y: 1.403 },
  { targetKey: 'jis-kana', label: 'JISかな配列', x: 1.075, y: 1.118 },
  { targetKey: 'shingeta', label: '新下駄', x: 1.306, y: 0.982 },
  { targetKey: 'shin-koume', label: 'シン蜂蜜小梅', x: 1.362, y: 0.982 },
  { targetKey: 'naginata-v18', label: '薙刀式v18', x: 1.413, y: 0.982 },
  { targetKey: 'nicola', label: '親指シフト（NICOLA）', x: 1.448, y: 1.0 },
  { targetKey: 'asuka', label: '飛鳥', x: 1.539, y: 1.0 },
  { targetKey: 'kawasemi-plus', label: 'かわせみ配列+', x: 1.586, y: 0.815 },
];

const EXAMPLE_DEFAULT = [
  { targetKey: 'oonishi', label: '大西配列', x: 1.777, y: 0.299 },
  { targetKey: 'seoto', label: 'せおと配列', x: 1.719, y: 0.325 },
  { targetKey: 'yumi', label: '弓配列', x: 1.407, y: 0.458 },
  { targetKey: 'gekkou', label: '中指シフト月光', x: 1.346, y: 0.573 },
  { targetKey: 'tsuki-ringo', label: '月林檎配列', x: 1.322, y: 0.636 },
  { targetKey: 'tsukimisou-extract', label: '月見草エキス配列', x: 1.319, y: 0.617 },
  { targetKey: 'tsuki-2-263', label: '月配列2-263式', x: 1.339, y: 0.518 },
  { targetKey: 'tk-onchoku', label: 'TK音直入力法', x: 1.403, y: 0.389 },
  { targetKey: 'jis-kana', label: 'JISかな配列', x: 1.118, y: 1.108 },
  { targetKey: 'shingeta', label: '新下駄', x: 0.982, y: 0.621 },
  { targetKey: 'shin-koume', label: 'シン蜂蜜小梅', x: 0.982, y: 0.543 },
  { targetKey: 'naginata-v18', label: '薙刀式v18', x: 0.982, y: 0.637 },
  { targetKey: 'nicola', label: '親指シフト（NICOLA）', x: 1.0, y: 0.557 },
  { targetKey: 'asuka', label: '飛鳥', x: 1.0, y: 0.424 },
  { targetKey: 'kawasemi-plus', label: 'かわせみ配列+', x: 0.815, y: 0.836 },
];

test('scatterPlotModel: 印が重なる点の組は名前を1つにまとめ、縦軸の値の大きい順に並べる。点そのものは全部返す', () => {
  // 横軸1.000の4点は縦軸が少しずつ違い、座標は同じでない
  const model = scatterPlotModel({
    points: [
      { targetKey: 'p', label: '月林檎配列', x: 1.0, y: 1.322 },
      { targetKey: 'q', label: '中指シフト月光', x: 1.0, y: 1.346 },
      { targetKey: 'r', label: '月見草エキス配列', x: 1.0, y: 1.319 },
      { targetKey: 's', label: '月配列2-263式', x: 1.0, y: 1.339 },
      { targetKey: 't', label: '新下駄', x: 1.306, y: 0.982 },
      { targetKey: 'u', label: 'シン蜂蜜小梅', x: 1.362, y: 0.982 },
    ],
    ...NO_LINES,
  });
  assert.equal(new Set(model.points.slice(0, 4).map((point) => point.py)).size, 4, '座標は同じでない');
  assert.equal(model.points.length, 6);
  // 縦軸の差が小さい隣どうしの印が重なり、(中指シフト月光, 月配列2-263式)と(月林檎配列, 月見草エキス配列)の2組になる
  assert.equal(model.names.length, 4);
  const groups = model.names.filter((name) => name.lines.length > 1);
  assert.deepEqual(groups.map(nameTexts).sort(), [
    ['中指シフト月光', '月配列2-263式'],
    ['月林檎配列', '月見草エキス配列'],
  ]);
  assert.deepEqual(groups.map((name) => name.lines.map((line) => line.targetKey)).sort(), [
    ['p', 'r'],
    ['q', 's'],
  ]);
});

test('scatterPlotModel: 縦軸の値が同じ点の組は、名前の順に並べる', () => {
  const model = scatterPlotModel({
    points: [
      { targetKey: 'b', label: 'B', x: 5, y: 5 },
      { targetKey: 'a', label: 'A', x: 5, y: 5 },
      { targetKey: 'far', label: 'F', x: 9, y: 9 },
    ],
    ...NO_LINES,
  });
  assert.deepEqual(nameTexts(model.names.find((name) => name.lines.length === 2)!), ['A', 'B']);
});

/** 範囲を固定する2点の間に、描画上の距離`distance`だけ離れた2点を横に置く。 */
function pairAtDistance(distance: number) {
  const base = scatterPlotModel({
    points: [
      { targetKey: 'lo', label: 'L', x: 0, y: 0 },
      { targetKey: 'hi', label: 'H', x: 100, y: 100 },
    ],
    ...NO_LINES,
  });
  const perUnit = (base.points[1]!.px - base.points[0]!.px) / 100;
  return scatterPlotModel({
    points: [
      { targetKey: 'lo', label: 'L', x: 0, y: 0 },
      { targetKey: 'a', label: 'A', x: 50, y: 50 },
      { targetKey: 'b', label: 'B', x: 50 + distance / perUnit, y: 50 },
      { targetKey: 'hi', label: 'H', x: 100, y: 100 },
    ],
    ...NO_LINES,
  });
}

test('scatterPlotModel: 組にまとめる境目は、中心どうしの距離が印の直径より小さいか', () => {
  const diameter = 2 * MARK_RADIUS;
  assert.equal(pairAtDistance(diameter - 0.5).names.filter((name) => name.lines.length === 2).length, 1);
  assert.equal(pairAtDistance(diameter + 0.5).names.filter((name) => name.lines.length === 2).length, 0);
});

test('scatterPlotModel: つながる点は、端どうしが印の直径以上離れていても1つの組にまとめる', () => {
  const model = scatterPlotModel({
    points: [
      { targetKey: 'lo', label: 'L', x: 0, y: 0 },
      { targetKey: 'hi', label: 'H', x: 100, y: 100 },
      ...[0, 1, 2, 3, 4].map((i) => ({ targetKey: `c${i}`, label: `C${i}`, x: 50 + i * 1.2, y: 50 })),
    ],
    ...NO_LINES,
  });
  const chain = model.names.find((name) => name.lines.length > 1)!;
  assert.equal(chain.lines.length, 5);
  const first = model.points.find((point) => point.targetKey === 'c0')!;
  const last = model.points.find((point) => point.targetKey === 'c4')!;
  assert.ok(last.px - first.px >= 2 * MARK_RADIUS);
});

test('scatterPlotModel: 印が重ならない近い点の名前は、互いに重ならない位置に置く', () => {
  // 新下駄とシン蜂蜜小梅は縦軸が同じで印は離れているが、どちらも右に置くと名前どうしが重なる
  const model = scatterPlotModel({
    points: [
      { targetKey: 'a', label: '新下駄', x: 1.306, y: 0.982 },
      { targetKey: 'b', label: 'シン蜂蜜小梅', x: 1.362, y: 0.982 },
      { targetKey: 'c', label: '中指シフト月光', x: 1.0, y: 1.346 },
      { targetKey: 'd', label: '親指シフト（NICOLA）', x: 1.448, y: 1.0 },
      { targetKey: 'e', label: 'かわせみ配列+', x: 1.586, y: 0.815 },
    ],
    ...NO_LINES,
  });
  assert.equal(model.names.length, 5);
  assert.equal(nameOverlapCount(model.names), 0);
  for (const name of model.names) {
    for (const point of model.points) assert.equal(overlapsRect(name.rect, markRect(point)), false, `${name.lines[0]!.text}と${point.label}の印`);
  }
});

test('scatterPlotModel: 近くに置いた名前には引き出し線を付けない', () => {
  const model = scatterPlotModel({ points: POINTS, ...NO_LINES });
  for (const name of model.names) assert.equal(name.leader, undefined);
});

test('scatterPlotModel: 近くの4か所に置けない名前は、点から離して置き、点の印と名前を細い線で結ぶ', () => {
  // 中央の点の右・左・上・下を、少し離れた別の点が1つずつ塞ぐ（4点の印は中央の点と重ならない）
  const model = scatterPlotModel({
    points: [
      { targetKey: 'lo', label: 'LO', x: 0, y: 0 },
      { targetKey: 'hi', label: 'HI', x: 100, y: 100 },
      { targetKey: 'center', label: 'CENTER配列', x: 50, y: 50 },
      { targetKey: 'e', label: 'R1', x: 54, y: 50 },
      { targetKey: 'w', label: 'R2', x: 46, y: 50 },
      { targetKey: 'n', label: 'R3', x: 50, y: 56 },
      { targetKey: 's', label: 'R4', x: 50, y: 44 },
    ],
    ...NO_LINES,
  });
  const center = model.points.find((point) => point.targetKey === 'center')!;
  const name = model.names.find((candidate) => candidate.lines.some((line) => line.targetKey === 'center'))!;
  const leader = name.leader;
  assert.ok(leader !== undefined, '離れた場所の名前には線が付く');
  // 線は、点の印の縁から名前の長方形の縁へ向かう
  assert.ok(Math.abs(Math.hypot(leader.x1 - center.px, leader.y1 - center.py) - (MARK_RADIUS + 1)) < 1e-6);
  const inRect = (x: number, y: number) => x >= name.rect.x0 - 1e-6 && x <= name.rect.x1 + 1e-6 && y >= name.rect.y0 - 1e-6 && y <= name.rect.y1 + 1e-6;
  assert.ok(inRect(leader.x2, leader.y2));
  assert.equal(inRect(leader.x1, leader.y1), false);
});

test('scatterPlotModel: どこにも重ならずに置けない時は、重なりが最も少ない場所に置き、枠の外へは出さない', () => {
  // 点を隙間なく敷き詰めると、名前はどこに置いても点の印と重なる。重なりは右隣りに置く場合より増えず、名前は枠の中に収まる
  const dense = scatterPlotModel({ points: grid(30, 20, () => 'A'), ...NO_LINES });
  const clearance = dense.points.map((point) => markRect(point, 7));
  const width = estimateTextWidth('A');
  let blocked = 0;
  dense.names.forEach((name, index) => {
    // 点の印・先に置いた名前・先に置いた名前の引き出し線との重なりの数
    const hits = (rect: PlotRect) =>
      clearance.filter((mark) => overlapsRect(rect, mark)).length +
      dense.names.slice(0, index).filter((other) => overlapsRect(rect, other.rect) || (other.leader !== undefined && leaderTouches(other.leader, rect)))
        .length;
    const point = dense.points.find((candidate) => candidate.targetKey === name.lines[0]!.targetKey)!;
    const right = { x0: point.px + 8, x1: point.px + 10 + width, y0: point.py - 7.5, y1: point.py + 8.5 };
    if (hits(name.rect) > 0) blocked++;
    assert.ok(hits(name.rect) <= hits(right), `${point.label}は右隣りより重なりが少ない`);
    assert.ok(name.rect.x0 >= PLOT_MARGIN.left && name.rect.x1 <= PLOT_WIDTH - PLOT_MARGIN.right);
    assert.ok(name.rect.y0 >= PLOT_MARGIN.top && name.rect.y1 <= PLOT_HEIGHT - PLOT_MARGIN.bottom);
  });
  assert.ok(blocked > dense.names.length / 2, '多くの名前は、重ならない場所が無い');
});

/** 引き出し線が長方形を通るか（線上を細かく標本にして見る）。 */
function leaderTouches(leader: { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }, rect: PlotRect): boolean {
  for (let i = 0; i <= 200; i++) {
    const x = leader.x1 + ((leader.x2 - leader.x1) * i) / 200;
    const y = leader.y1 + ((leader.y2 - leader.y1) * i) / 200;
    if (x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1) return true;
  }
  return false;
}

/** 点の印の直径より広い間隔の格子状の点。 */
function grid(columns: number, rows: number, label: (column: number, row: number) => string) {
  return Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return { targetKey: `g${index}`, label: label(column, row), x: column, y: row };
  });
}

test('scatterPlotModel: 行の多い名前は列に分け、値の大きい順に左の列の上から下、続けて右の列へ並べる', () => {
  const model = scatterPlotModel({
    points: [
      { targetKey: 'far', label: 'F', x: 100, y: 100 },
      ...Array.from({ length: 22 }, (_, i) => ({ targetKey: `k${i}`, label: `配列${String(i).padStart(2, '0')}`, x: 0, y: i * 0.001 })),
      { targetKey: 'lo', label: 'L', x: 0, y: -100 },
    ],
    ...NO_LINES,
  });
  const big = model.names.find((name) => name.lines.length === 22)!;
  const columns = [...new Set(big.lines.map((line) => line.x))].sort((a, b) => a - b);
  assert.equal(columns.length, 2);
  assert.deepEqual(
    big.lines.map((line) => line.text),
    Array.from({ length: 22 }, (_, i) => `配列${String(21 - i).padStart(2, '0')}`),
  );
  assert.equal(big.lines.filter((line) => line.x === columns[0]).length, 11);
});

test('scatterPlotModel: 例の15配列で、名前どうしが重ならない。月系の4点は1つの名前になる', () => {
  for (const points of [EXAMPLE_DEFAULT, EXAMPLE_PRESS]) {
    const model = scatterPlotModel({ points, ...NO_LINES });
    assert.equal(model.points.length, 15);
    assert.equal(nameOverlapCount(model.names), 0);
  }
  const press = scatterPlotModel({ points: EXAMPLE_PRESS, ...NO_LINES });
  assert.deepEqual(press.names.filter((name) => name.lines.length > 1).map(nameTexts), [
    ['中指シフト月光', '月配列2-263式', '月林檎配列', '月見草エキス配列'],
  ]);
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
  for (const name of model.names) {
    const { rect } = name;
    const text = name.lines[0]!.text;
    assert.ok(rect.x0 >= PLOT_MARGIN.left + 2 && rect.x1 <= PLOT_WIDTH - PLOT_MARGIN.right - 2, `${text}の左右`);
    assert.ok(rect.y0 >= PLOT_MARGIN.top + 2 && rect.y1 <= PLOT_HEIGHT - PLOT_MARGIN.bottom - 2, `${text}の上下`);
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
    }
    for (const name of model.names) assert.equal(hits(name.rect), false, `${line.text}と${name.lines[0]!.text}の名前`);
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
  const { rect } = model.names.find((name) => name.lines[0]!.targetKey === 'a')!;
  assert.ok(rect.x0 >= PLOT_MARGIN.left + 2 && rect.x1 <= PLOT_WIDTH - PLOT_MARGIN.right - 2);
  assert.ok(rect.y0 >= PLOT_MARGIN.top + 2 && rect.y1 <= PLOT_HEIGHT - PLOT_MARGIN.bottom - 2);
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
