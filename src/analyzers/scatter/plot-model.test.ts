import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { scatterContour } from './axes.ts';
import { axisUnit } from './axis-names.ts';
import type { ComparisonColumnId } from '../comparison-column-text.ts';
import {
  axisRange,
  estimateTextWidth,
  finerStep,
  levelsAtStep,
  logAxis,
  logAxisRange,
  logScaleBlockers,
  MARK_RADIUS,
  niceTicks,
  PLOT_HEIGHT,
  PLOT_MARGIN,
  PLOT_WIDTH,
  resolveLogScale,
  type Range,
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
  { targetKey: 'nicola', label: '親指シフト', x: 1.448, y: 1.0 },
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
  { targetKey: 'nicola', label: '親指シフト', x: 1.0, y: 0.557 },
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

/** 点の中心から横の名前までの間隔。 */
const NAME_GAP_FOR_TEST = 9;

/** 図の中央（データの50,50）を基準に、画面上のずれ（右・下が正）で点を置く。範囲は左下と右上の2点で固定する。 */
function sceneAt(offsets: readonly { readonly key: string; readonly label: string; readonly dx: number; readonly dy: number }[]) {
  const input = [
    { targetKey: 'lo', label: 'LO', x: 0, y: 0 },
    { targetKey: 'hi', label: 'HI', x: 100, y: 100 },
  ];
  const base = scatterPlotModel({ points: input, ...NO_LINES });
  const perX = (base.points[1]!.px - base.points[0]!.px) / 100;
  const perY = (base.points[0]!.py - base.points[1]!.py) / 100;
  return scatterPlotModel({
    points: [...input, ...offsets.map((o) => ({ targetKey: o.key, label: o.label, x: 50 + o.dx / perX, y: 50 - o.dy / perY }))],
    ...NO_LINES,
  });
}

/** 2点の組（A=左、B=右）。まとめた名前の近くの4か所（右・左・上・下）を、別の点の印が1つずつ塞ぐ。点の横の位置は2点の中央からdx、縦は同じ。 */
function blockedPair(half: number, extra: readonly { readonly key: string; readonly label: string; readonly dx: number; readonly dy: number }[] = []) {
  return sceneAt([
    { key: 'a', label: 'AAAA', dx: -half, dy: 0 },
    { key: 'b', label: 'BBBB', dx: half, dy: 0 },
    { key: 'up', label: 'U', dx: 0, dy: -20 },
    { key: 'down', label: 'D', dx: 0, dy: 20 },
    { key: 'r', label: 'R', dx: 20, dy: 21 },
    { key: 'l', label: 'L', dx: -20, dy: 21 },
    ...extra,
  ]);
}

test('scatterPlotModel: 印が重なる2点の名前が近くに置けず左右が空いている時は、左の点の左と右の点の右に1行ずつ、引き出し線無しで置く', () => {
  const model = blockedPair(4);
  const a = model.points.find((point) => point.targetKey === 'a')!;
  const b = model.points.find((point) => point.targetKey === 'b')!;
  const nameA = model.names.find((name) => name.lines.some((line) => line.targetKey === 'a'))!;
  const nameB = model.names.find((name) => name.lines.some((line) => line.targetKey === 'b'))!;
  assert.notEqual(nameA, nameB);
  for (const name of [nameA, nameB]) {
    assert.equal(name.lines.length, 1);
    assert.equal(name.leader, undefined);
  }
  assert.ok(nameA.rect.x1 <= a.px - 8 + 1e-6 && nameA.rect.x1 >= a.px - 10, '左の点の名前は、その点の左');
  assert.ok(nameB.rect.x0 >= b.px + 8 - 1e-6 && nameB.rect.x0 <= b.px + 10, '右の点の名前は、その点の右');
  assert.equal(nameA.lines[0]!.y, a.py + 4);
  assert.equal(nameB.lines[0]!.y, b.py + 4);
  assert.equal(nameOverlapCount(model.names), 0);
  for (const name of model.names) for (const point of model.points) assert.equal(overlapsRect(name.rect, markRect(point)), false);
});

test('scatterPlotModel: 印が重なる2点の名前が近くに置ける時は、今のまま1つにまとめて積む', () => {
  const model = sceneAt([
    { key: 'a', label: 'AAAA', dx: -4, dy: 0 },
    { key: 'b', label: 'BBBB', dx: 4, dy: 0 },
  ]);
  const pair = model.names.filter((name) => name.lines.length === 2);
  assert.equal(pair.length, 1);
  assert.equal(pair[0]!.leader, undefined);
});

test('scatterPlotModel: 分けた片方の側が別の点の印と重なる時は、1つにまとめて積む', () => {
  // 左の点の左に別の点の印がある
  const model = blockedPair(4, [{ key: 'w', label: 'W', dx: -24, dy: 0 }]);
  const pair = model.names.filter((name) => name.lines.length === 2);
  assert.equal(pair.length, 1);
  assert.deepEqual(nameTexts(pair[0]!).sort(), ['AAAA', 'BBBB']);
});

test('scatterPlotModel: 分けた片方の側が図の外に出る時は、1つにまとめて積む', () => {
  // 描画領域の右端に寄せた2点。右の点の右には名前が収まらず、上と下は別の点の印が塞ぐ
  const shift = 215;
  const model = sceneAt([
    { key: 'a', label: 'AAAA', dx: shift - 4, dy: 0 },
    { key: 'b', label: 'BBBBBBBBBB', dx: shift + 4, dy: 0 },
    { key: 'up', label: 'U', dx: shift, dy: -20 },
    { key: 'down', label: 'D', dx: shift, dy: 20 },
    { key: 'l', label: 'L', dx: shift - 20, dy: 21 },
  ]);
  const b = model.points.find((point) => point.targetKey === 'b')!;
  assert.ok(b.px + NAME_GAP_FOR_TEST + estimateTextWidth('BBBBBBBBBB') > PLOT_WIDTH - PLOT_MARGIN.right);
  const pair = model.names.filter((name) => name.lines.length === 2);
  assert.equal(pair.length, 1);
  assert.deepEqual(nameTexts(pair[0]!), ['AAAA', 'BBBBBBBBBB']);
});

test('scatterPlotModel: 横の位置が同じ（差が0.5px未満）2点は、近くに置けなくても分けずに1つにまとめる', () => {
  const model = sceneAt([
    { key: 'a', label: 'AAAA', dx: -0.2, dy: -3 },
    { key: 'b', label: 'BBBB', dx: 0.2, dy: 3 },
    { key: 'up', label: 'U', dx: 0, dy: -26 },
    { key: 'down', label: 'D', dx: 0, dy: 26 },
    { key: 'r', label: 'R', dx: 20, dy: 24 },
    { key: 'l', label: 'L', dx: -20, dy: 24 },
  ]);
  const pair = model.names.filter((name) => name.lines.length === 2);
  assert.equal(pair.length, 1);
  assert.deepEqual(nameTexts(pair[0]!), ['AAAA', 'BBBB']);
});

test('scatterPlotModel: 3点の組は、近くに置けなくても分けない', () => {
  const model = blockedPair(4, [{ key: 'c', label: 'CCCC', dx: 0, dy: 5 }]);
  const triple = model.names.filter((name) => name.lines.length === 3);
  assert.equal(triple.length, 1);
});

test('scatterPlotModel: 例の15配列で、親指シフトとシン蜂蜜小梅の名前は分けて置き、ほかの2組はまとめたまま', () => {
  const model = scatterPlotModel({ points: EXAMPLE_DEFAULT, ...NO_LINES });
  const nameOf = (key: string) => model.names.find((name) => name.lines.some((line) => line.targetKey === key))!;
  const nicola = nameOf('nicola');
  const koume = nameOf('shin-koume');
  assert.notEqual(nicola, koume);
  for (const name of [nicola, koume]) {
    assert.equal(name.lines.length, 1);
    assert.equal(name.leader, undefined);
  }
  const nicolaPoint = model.points.find((point) => point.targetKey === 'nicola')!;
  const koumePoint = model.points.find((point) => point.targetKey === 'shin-koume')!;
  assert.ok(koumePoint.px < nicolaPoint.px);
  assert.ok(koume.rect.x1 < koumePoint.px, 'シン蜂蜜小梅は点の左');
  assert.ok(nicola.rect.x0 > nicolaPoint.px, '親指シフトは点の右');
  assert.equal(nameOf('tsuki-ringo'), nameOf('tsukimisou-extract'));
  assert.equal(nameOf('tsuki-ringo').lines.length, 2);
  assert.equal(nameOf('naginata-v18'), nameOf('shingeta'));
  assert.equal(nameOf('naginata-v18').lines.length, 2);
  assert.equal(nameOverlapCount(model.names), 0);
  for (const name of model.names) for (const point of model.points) assert.equal(overlapsRect(name.rect, markRect(point)), false);
});

test('scatterPlotModel: 印が重ならない近い点の名前は、互いに重ならない位置に置く', () => {
  // 新下駄とシン蜂蜜小梅は縦軸が同じで印は離れているが、どちらも右に置くと名前どうしが重なる
  const model = scatterPlotModel({
    points: [
      { targetKey: 'a', label: '新下駄', x: 1.306, y: 0.982 },
      { targetKey: 'b', label: 'シン蜂蜜小梅', x: 1.362, y: 0.982 },
      { targetKey: 'c', label: '中指シフト月光', x: 1.0, y: 1.346 },
      { targetKey: 'd', label: '親指シフト', x: 1.448, y: 1.0 },
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
    ['親指シフト', 54.8],
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

test('logAxisRange: 余白は対数の上で両側に同じだけ足し、値が全部同じでも幅を持つ', () => {
  const range = logAxisRange([10, 1000]);
  assert.ok(range.lo > 0 && range.lo < 10 && range.hi > 1000);
  // 対数の上で左右対称（10と1000の対数は1と3、余白は0.2）
  assert.ok(Math.abs(Math.log10(range.lo) - 0.8) < 1e-9 && Math.abs(Math.log10(range.hi) - 3.2) < 1e-9);
  const flat = logAxisRange([5, 5]);
  assert.ok(flat.lo < 5 && flat.hi > 5 && Math.abs(Math.log(flat.hi / 5) - Math.log(5 / flat.lo)) < 1e-9);
  assert.deepEqual(logAxisRange([]), { lo: 1, hi: 10 });
});

/** 4つの段の目盛りの値になれる値か。1つ目は1の冪、2つ目は1・2・5の冪、3つ目は1〜9の冪。4つ目は一定の刻みなので別に確かめる。 */
function isLeadTick(value: number, leads: readonly number[]): boolean {
  const power = Math.floor(Math.log10(value) + 1e-9);
  return leads.some((lead) => Math.abs(value / 10 ** power - lead) < 1e-9);
}

/** `padded`を含む最も狭い目盛りの区間に入る、`leads`×10の冪の値の数。 */
function leadCount(padded: Range, leads: readonly number[]): number {
  const all = [...Array(60).keys()].flatMap((i) => leads.map((lead) => Number((lead * 10 ** (i - 30)).toPrecision(12)))).sort((a, b) => a - b);
  const lo = all.filter((v) => v <= padded.lo * (1 + 1e-9)).at(-1)!;
  const hi = all.find((v) => v >= padded.hi * (1 - 1e-9))!;
  return all.filter((v) => v >= lo && v <= hi).length;
}

function assertEnclosing(values: readonly number[], target: number, horizontal: boolean) {
  const axis = logAxis(values, target, horizontal);
  const padded = logAxisRange(values);
  const min = Math.log10(Math.min(...values));
  const max = Math.log10(Math.max(...values));
  const margin = max > min ? (max - min) * 0.1 : Math.log10(1.1);
  // 軸の両端は目盛りの値
  assert.equal(axis.range.lo, axis.values[0]);
  assert.equal(axis.range.hi, axis.values.at(-1));
  // 余白を足した範囲を含む。点は両端の目盛りより内側にあり、点と端の間に、点の範囲の幅の1割以上の余白がある（対数の上）
  assert.ok(axis.range.lo <= padded.lo * (1 + 1e-9) && axis.range.hi >= padded.hi * (1 - 1e-9));
  assert.ok(Math.log10(axis.range.lo) <= min - margin + 1e-9);
  assert.ok(Math.log10(axis.range.hi) >= max + margin - 1e-9);
  // 軸の範囲は、余白を足した範囲を含む最も狭い目盛りの区間（外側の目盛りは1つ余計に付かない）
  assert.ok(axis.values.length >= 2);
  assert.ok(axis.values[1]! > padded.lo * (1 - 1e-9) && axis.values.at(-2)! < padded.hi * (1 + 1e-9));
  // 目盛りは昇順で、数字は互いに違う
  for (let i = 1; i < axis.values.length; i++) assert.ok(axis.values[i]! > axis.values[i - 1]!);
  assert.equal(new Set(axis.texts).size, axis.texts.length);
  for (const [i, text] of axis.texts.entries()) assert.equal(Number(text), axis.values[i]);
  return axis;
}

test('logAxis: 点の範囲が10倍に近い時も、軸の両端が目盛りで、全ての点が両側を目盛りで挟まれる', () => {
  // 縦軸の点が0.3〜2.9。1・2・5の段で、小さい側は0.2、大きい側は5まで目盛りが付く
  const axis = assertEnclosing([0.3, 2.9], 5, false);
  assert.equal(axis.tier, 2);
  assert.deepEqual(axis.values, [0.2, 0.5, 1, 2, 5]);
  assert.deepEqual(axis.texts, ['0.2', '0.5', '1', '2', '5']);
});

test('logAxis: 点の範囲が10倍以上の時と4桁以上にまたがる時は、粗い段の目盛りになる', () => {
  const wide = assertEnclosing([0.07, 30], 5, false);
  assert.equal(wide.tier, 1);
  assert.deepEqual(wide.values, [0.01, 0.1, 1, 10, 100]);
  const decades = assertEnclosing([0.002, 90000], 6, true);
  assert.equal(decades.tier, 1);
  assert.deepEqual(decades.values, [0.0001, 0.001, 0.01, 0.1, 1, 10, 100, 1000, 10000, 100000, 1000000]);
  assert.deepEqual(decades.texts.slice(0, 3), ['0.0001', '0.001', '0.01']);
});

test('logAxis: 3つの段で目標の本数に届かない狭い範囲は、一定の刻みの段になる', () => {
  const narrow = assertEnclosing([1.0, 1.3], 5, false);
  assert.equal(narrow.tier, 4);
  assert.deepEqual(narrow.values, [0.9, 1, 1.1, 1.2, 1.3, 1.4]);
  assert.deepEqual(narrow.texts, ['0.9', '1', '1.1', '1.2', '1.3', '1.4']);
  // 刻みは1・2・5の冪のうち、目標の本数に届く最も粗いもの。小数2桁の値は桁を落とさずに書く
  const finer = assertEnclosing([1.01, 1.04], 6, true);
  assert.equal(finer.tier, 4);
  assert.deepEqual(finer.texts, ['1', '1.01', '1.02', '1.03', '1.04', '1.05']);
  // 1つ粗い刻み（0.2）では、同じ点の軸の範囲（0.8〜1.4）に入る目盛りが4つで、目標の5本に届かない
  const padded = logAxisRange([1.0, 1.3]);
  assert.equal(Math.round(Math.ceil(padded.hi / 0.2 - 1e-9) - Math.floor(padded.lo / 0.2 + 1e-9) + 1), 4);
});

test('logAxis: 点の値が全部同じ時は、比1.1倍の余白を残した範囲を囲む', () => {
  const flat = assertEnclosing([5, 5], 5, false);
  assert.equal(flat.tier, 4);
  assert.deepEqual(flat.values, [4.4, 4.6, 4.8, 5, 5.2, 5.4, 5.6]);
  assert.deepEqual(assertEnclosing([10, 10], 5, false).values, [9, 9.5, 10, 10.5, 11]);
});

test('logAxis: 点が目盛りの値ちょうどにあっても、点と軸の端の間に余白が残る', () => {
  const exact = assertEnclosing([1, 100], 5, false);
  assert.deepEqual(exact.values, [0.1, 1, 10, 100, 1000]);
  const twoFive = assertEnclosing([2, 50], 5, false);
  assert.ok(twoFive.range.lo < 2 && twoFive.range.hi > 50);
});

test('logAxis: 余白を足した範囲が10倍に満たない軸は、一定の刻みだけを使い、10倍以上の軸は1〜3つ目の段から選ぶ', () => {
  const tierLeads = { 1: [1], 2: [1, 2, 5], 3: [1, 2, 3, 4, 5, 6, 7, 8, 9] } as const;
  for (const horizontal of [true, false]) {
    const target = horizontal ? 6 : 5;
    for (const base of [1e-5, 0.01, 1, 70, 3e4]) {
      for (const ratio of [1, 1.05, 1.3, 2, 3, 7, 20, 400, 1e5]) {
        const values = [base, base * ratio];
        const axis = assertEnclosing(values, target, horizontal);
        const padded = logAxisRange(values);
        const narrow = padded.hi < padded.lo * 10;
        if (narrow && axis.tier === 4) {
          // 一定の刻み: 隣の目盛りとの差が全部同じ
          const step = axis.values[1]! - axis.values[0]!;
          for (let i = 1; i < axis.values.length; i++) assert.ok(Math.abs(axis.values[i]! - axis.values[i - 1]! - step) < step * 1e-6, `${values}`);
        }
        if (axis.tier !== 4) {
          const leads = tierLeads[axis.tier];
          assert.ok(
            axis.values.every((v) => isLeadTick(v, leads)),
            `${values}`,
          );
        }
        if (narrow) continue;
        // 10倍以上の軸: 数字が重ならず戻らなかった時は目標の本数に届く。戻った時はより粗い段。目標に届く最も粗い段を選ぶ
        if (axis.wantedTier === 4) continue;
        assert.ok(axis.tier <= axis.wantedTier, `${values}`);
        if (axis.tier === axis.wantedTier) assert.ok(axis.values.length >= target, `${values}`);
        for (let coarser = 1; coarser < axis.wantedTier; coarser++) {
          assert.ok(leadCount(padded, tierLeads[coarser as 1 | 2]) < target, `${values}: 段${coarser}`);
        }
      }
    }
  }
});

test('logAxis: 10倍に満たない軸は、1〜9の段にせず一定の刻みにする', () => {
  // 点が0.7〜1.7の縦軸。1〜9の段だと0.7・0.8・0.9・1・2で、1と2の間に目盛りが無い
  const axis = assertEnclosing([0.7, 1.7], 5, false);
  assert.equal(axis.tier, 4);
  assert.deepEqual(axis.texts, ['0.6', '0.8', '1', '1.2', '1.4', '1.6', '1.8', '2']);
  const flat = assertEnclosing([1.2, 1.8], 5, false);
  assert.equal(flat.tier, 4);
  assert.deepEqual(flat.texts, ['1', '1.2', '1.4', '1.6', '1.8', '2']);
});

test('logAxis: 隣の数字が重なる時は、重ならない段まで1つずつ粗くする', () => {
  // 横軸が0.3〜2.9（10倍以上）。1〜9の段は目標に届くが0.8と0.9の数字が重なるので、1・2・5の段に戻る
  const back = assertEnclosing([0.3, 2.9], 6, true);
  assert.equal(back.wantedTier, 3);
  assert.equal(back.tier, 2);
  assert.deepEqual(back.texts, ['0.2', '0.5', '1', '2', '5']);
  // 縦軸は数字の高さで判定する。同じ範囲でも、1〜9の段の0.8と0.9が近すぎる
  const narrowY = logAxis([0.3, 2.9], 10, false);
  assert.ok(narrowY.tier < narrowY.wantedTier);
  // 10倍に満たない軸は刻みを粗くする。0.000001のような長い数字は、刻み1e-7（9本）だと重なるので、刻み2e-7（5本）になる
  const long = assertEnclosing([1e-6, 1.5e-6], 6, true);
  assert.equal(long.tier, 4);
  assert.deepEqual(long.texts, ['0.0000008', '0.000001', '0.0000012', '0.0000014', '0.0000016']);
  // 下端を0より大きくできる刻みが細かい刻みしか無く、その刻みで重なる時は、1〜3つ目の段から選ぶ
  const fallback = assertEnclosing([30, 200], 5, false);
  assert.equal(fallback.tier, 2);
  assert.deepEqual(fallback.texts, ['20', '50', '100', '200', '500']);
});

test('logAxis: 1つ目の段でも数字が重なる時は、1つ目の段を使う', () => {
  const axis = assertEnclosing([1e-6, 1e6], 6, true);
  assert.equal(axis.tier, 1);
  assert.equal(axis.wantedTier, 1);
  assert.equal(axis.values.length, 17);
  assert.equal(axis.texts[0], '0.00000001');
  assert.equal(axis.texts.at(-1), '100000000');
});

test('logAxis: 点が無い時は1から10までの範囲を囲む', () => {
  const empty = logAxis([], 5, false);
  assert.deepEqual(empty.range, { lo: 1, hi: 10 });
});

test('scatterPlotModel(対数): 軸の範囲は目盛りの値で、目盛りの数字は軸ごとに決まる', () => {
  const points = [
    { targetKey: 'a', label: 'A', x: 0.3, y: 0.3 },
    { targetKey: 'b', label: 'B', x: 2.9, y: 2.9 },
  ];
  const model = scatterPlotModel({ points, contour: undefined, legendRows: [], contourName: '', contourSuffix: '', logScale: true });
  const first = model.yTicks[0]!;
  const last = model.yTicks.at(-1)!;
  // 縦軸の端の目盛りは描画領域の下端と上端
  assert.equal(first.position, PLOT_HEIGHT - PLOT_MARGIN.bottom);
  assert.equal(last.position, PLOT_MARGIN.top);
  assert.deepEqual(
    model.yTicks.map((tick) => tick.text),
    ['0.2', '0.5', '1', '2', '5'],
  );
  assert.equal(model.xTicks[0]!.position, PLOT_MARGIN.left);
  assert.equal(model.xTicks.at(-1)!.position, PLOT_WIDTH - PLOT_MARGIN.right);
  for (const point of model.points) {
    assert.ok(point.px > PLOT_MARGIN.left && point.px < PLOT_WIDTH - PLOT_MARGIN.right);
    assert.ok(point.py > PLOT_MARGIN.top && point.py < PLOT_HEIGHT - PLOT_MARGIN.bottom);
  }
});

test('scatterPlotModel: 通常の目盛りの描画（点・線・名前・目盛りの座標）は、固定した値と同じ', () => {
  // 描画をJSONにしてSHA-256の先頭16桁で固定している。対数の目盛りの規則を変えても通常の目盛りの描画が動かないことを確かめる
  const contour = scatterContour('actions', 'meanPerStroke', 100, 'ja')!;
  const digest = (input: Parameters<typeof scatterPlotModel>[0]) =>
    createHash('sha256')
      .update(JSON.stringify(scatterPlotModel(input)))
      .digest('hex')
      .slice(0, 16);
  assert.equal(digest({ points: POINTS, contour, legendRows: ['かな配列'], contourName: '総移動距離', contourSuffix: '' }), '4079cc7f881cfe12');
  assert.equal(
    digest({ points: LOG_POINTS, contour: undefined, legendRows: [], contourName: '', contourSuffix: '', logScale: false }),
    '9ef3cb2ab47a5a34',
  );
  const shares = [
    { targetKey: 'a', label: 'QWERTY', x: 48, y: 52 },
    { targetKey: 'b', label: 'Dvorak', x: 55, y: 47 },
  ];
  assert.equal(
    digest({ points: shares, contour: undefined, legendRows: ['かな配列'], contourName: '', contourSuffix: '', centerAxes: { x: true, y: true } }),
    'b241a3140e936522',
  );
});

const PRODUCT_CONTOUR = scatterContour('actions', 'meanPerStroke', 100, 'ja')!;

test('logScaleBlockers: 線が直線になる図で、描く点の値が全部0より大きい時は理由が無く、対数にできる', () => {
  const points = [
    { x: 100, y: 1.2 },
    { x: 300, y: 0.9 },
  ];
  assert.deepEqual(logScaleBlockers(PRODUCT_CONTOUR, points), { noStraightLines: false, nonPositive: false });
});

test('logScaleBlockers: 線を引かない図・線の量が積でも比でもない図・線の無い図は、直線にならない図として理由に挙がる', () => {
  const points = [{ x: 100, y: 1.2 }];
  // 線の量がu/アクションの組（線を引かない）
  const noLines = scatterContour('perActionPresses', 'perPressUnits', 100, 'ja')!;
  assert.equal(noLines.drawsLines, false);
  assert.equal(logScaleBlockers(noLines, points).noStraightLines, true);
  // 同じ手の続きの割合を軸の一方に選んだ図（線の量は回数）
  const notProduct = scatterContour('handSwitches', 'sameHandContinuationRate', 100, 'ja')!;
  assert.equal(notProduct.drawsLines, true);
  assert.equal(logScaleBlockers(notProduct, points).noStraightLines, true);
  // 恒等式が無い図
  assert.equal(logScaleBlockers(undefined, points).noStraightLines, true);
  // 手の切り替えの回数と同じ手の続きの回数の図は直線になる
  assert.equal(logScaleBlockers(scatterContour('handSwitches', 'handContinuations', 100, 'ja'), points).noStraightLines, false);
});

test('logScaleBlockers: 0以下の値がある点があれば理由に挙がる。理由は互いに独立で、両方に当たる図は両方が真になる', () => {
  assert.deepEqual(logScaleBlockers(PRODUCT_CONTOUR, [{ x: 0, y: 1 }]), { noStraightLines: false, nonPositive: true });
  assert.deepEqual(logScaleBlockers(PRODUCT_CONTOUR, [{ x: 5, y: -1 }]), { noStraightLines: false, nonPositive: true });
  assert.deepEqual(logScaleBlockers(undefined, [{ x: 5, y: 0 }]), { noStraightLines: true, nonPositive: true });
  // 渡した点だけを見る。値が無くて描かない点は呼び出し側が渡さないので、判定に入らない
  assert.equal(logScaleBlockers(PRODUCT_CONTOUR, []).nonPositive, false);
});

test('resolveLogScale: 対数を選んでいて理由が無い時だけ対数で描き、できない時は理由ごとに返す。通常を選んでいる時は理由を返さない', () => {
  const none = { noStraightLines: false, nonPositive: false };
  assert.deepEqual(resolveLogScale('log', none), { logScale: true, reasons: [] });
  assert.deepEqual(resolveLogScale('linear', none), { logScale: false, reasons: [] });
  assert.deepEqual(resolveLogScale('log', { noStraightLines: true, nonPositive: false }), { logScale: false, reasons: ['noStraightLines'] });
  assert.deepEqual(resolveLogScale('log', { noStraightLines: false, nonPositive: true }), { logScale: false, reasons: ['nonPositive'] });
  assert.deepEqual(resolveLogScale('log', { noStraightLines: true, nonPositive: true }), {
    logScale: false,
    reasons: ['noStraightLines', 'nonPositive'],
  });
  assert.deepEqual(resolveLogScale('linear', { noStraightLines: true, nonPositive: true }), { logScale: false, reasons: [] });
});

test('対数を選んだまま組み合わせを変える: 対数にできる図は対数のまま、できない図は通常の目盛りと理由になる', () => {
  const rows = [
    { actions: 120, perCharSteps: 1.2, meanPerStroke: 0.9, sameFingerRate: 3 },
    { actions: 150, perCharSteps: 1.5, meanPerStroke: 1.1, sameFingerRate: 0 },
  ];
  const resolve = (x: 'actions' | 'perCharSteps' | 'sameFingerRate', y: 'meanPerStroke' | 'sameFingerRate' | 'perCharSteps') => {
    const contour = scatterContour(x, y, 100, 'ja');
    const lineContour = contour?.drawsLines === true ? contour : undefined;
    return resolveLogScale(
      'log',
      logScaleBlockers(
        lineContour,
        rows.map((row) => ({ x: row[x], y: row[y] })),
      ),
    );
  };
  assert.deepEqual(resolve('actions', 'meanPerStroke'), { logScale: true, reasons: [] });
  // 同指率が0%の配列がある図
  assert.deepEqual(resolve('actions', 'sameFingerRate'), { logScale: false, reasons: ['nonPositive'] });
  // 線の無い図（同じ手の続きの割合と同指率）に0以下の値が重なる
  assert.deepEqual(resolve('sameFingerRate', 'perCharSteps'), { logScale: false, reasons: ['noStraightLines', 'nonPositive'] });
  // 対数を選んだままでも、対数にできる図に戻れば対数になる
  assert.deepEqual(resolve('perCharSteps', 'meanPerStroke'), { logScale: true, reasons: [] });
});

const LOG_POINTS = [
  { targetKey: 'a', label: 'A', x: 100, y: 1.0 },
  { targetKey: 'b', label: 'B', x: 200, y: 2.0 },
  { targetKey: 'c', label: 'C', x: 400, y: 4.0 },
  { targetKey: 'd', label: 'D', x: 800, y: 0.5 },
];

test('scatterPlotModel(対数): 比が同じ点どうしは間隔が同じで、点は図の内側に置かれ、目盛りの位置も対数の上にある', () => {
  const model = scatterPlotModel({ points: LOG_POINTS, contour: undefined, legendRows: [], contourName: '', contourSuffix: '', logScale: true });
  const [a, b, c] = model.points;
  assert.ok(Math.abs(b!.px - a!.px - (c!.px - b!.px)) < 1e-9);
  assert.ok(Math.abs(a!.py - b!.py - (b!.py - c!.py)) < 1e-9);
  for (const point of model.points) {
    assert.ok(point.px >= PLOT_MARGIN.left && point.px <= PLOT_WIDTH - PLOT_MARGIN.right);
    assert.ok(point.py >= PLOT_MARGIN.top && point.py <= PLOT_HEIGHT - PLOT_MARGIN.bottom);
  }
  // 目盛りの位置は、値の対数に比例する（隣り合う目盛りの位置の差 ÷ 値の対数の差が一定）
  const ratios = model.xTicks
    .slice(1)
    .map((tick, i) => (tick.position - model.xTicks[i]!.position) / (Math.log(tick.value) - Math.log(model.xTicks[i]!.value)));
  assert.ok(ratios.length > 1 && ratios.every((ratio) => Math.abs(ratio - ratios[0]!) < 1e-6));
  assert.deepEqual(
    model.xTicks.map((tick) => tick.text),
    ['50', '100', '200', '500', '1000'],
  );
});

test('scatterPlotModel(対数): 積が一定の線は直線になり、線の上の点が一直線に並ぶ', () => {
  const contour = PRODUCT_CONTOUR;
  const points = [
    { targetKey: 'a', label: 'A', x: 100, y: 0.9 },
    { targetKey: 'b', label: 'B', x: 400, y: 1.5 },
    { targetKey: 'c', label: 'C', x: 160, y: 2.4 },
  ];
  const model = scatterPlotModel({ points, contour, legendRows: [], contourName: '', contourSuffix: '', logScale: true });
  assert.ok(model.contours.length >= 4);
  for (const line of model.contours) {
    const coordinates = [...line.d.matchAll(/[ML]([-\d.]+),([-\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
    assert.ok(coordinates.length >= 2, `${line.level}`);
    const first = coordinates[0]!;
    const last = coordinates[coordinates.length - 1]!;
    // 始点と終点を結ぶ直線からの距離（座標は小数1桁に丸めているので、0.1pxの誤差を許す）
    const length = Math.hypot(last.x - first.x, last.y - first.y);
    for (const p of coordinates) {
      const distance = Math.abs((last.x - first.x) * (first.y - p.y) - (first.x - p.x) * (last.y - first.y)) / length;
      assert.ok(distance < 0.15, `${line.level}: ${distance}`);
    }
  }
  // 通常の目盛りでは曲線で、同じ線が直線にならない
  const linear = scatterPlotModel({ points, contour, legendRows: [], contourName: '', contourSuffix: '' });
  const curved = linear.contours.some((line) => {
    const cs = [...line.d.matchAll(/[ML]([-\d.]+),([-\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
    const f = cs[0]!;
    const l = cs[cs.length - 1]!;
    const len = Math.hypot(l.x - f.x, l.y - f.y);
    return cs.some((p) => Math.abs((l.x - f.x) * (f.y - p.y) - (f.x - p.x) * (l.y - f.y)) / len > 1);
  });
  assert.ok(curved);
});

test('scatterPlotModel(対数): 線の上の点の対数どうしの関係を、点の座標で確かめる（線の量が一定の点は同じ線の上に並ぶ）', () => {
  // 横軸と縦軸の積が同じ2点（100と1、400と0.25）は同じ細い線の上にある。対数の図では、2点を結ぶ線の傾きが、どの細い線の傾きとも等しい
  const points = [
    { targetKey: 'a', label: 'A', x: 100, y: 1 },
    { targetKey: 'b', label: 'B', x: 400, y: 0.25 },
    { targetKey: 'c', label: 'C', x: 200, y: 2 },
  ];
  const model = scatterPlotModel({ points, contour: PRODUCT_CONTOUR, legendRows: [], contourName: '', contourSuffix: '', logScale: true });
  const [a, b] = model.points;
  const lineSlope = (d: string): number => {
    const cs = [...d.matchAll(/[ML]([-\d.]+),([-\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
    return (cs[cs.length - 1]!.y - cs[0]!.y) / (cs[cs.length - 1]!.x - cs[0]!.x);
  };
  const pointSlope = (b!.py - a!.py) / (b!.px - a!.px);
  for (const line of model.contours) assert.ok(Math.abs(lineSlope(line.d) - pointSlope) < 0.01, `${line.level}`);
});

test('scatterPlotModel(対数): 点の名前の置き場所は、描画領域の座標が同じなら通常の目盛りと同じ', () => {
  // 値の対数が通常の値と等しい点は、軸の範囲が同じなら両方の目盛りで同じ座標に置かれる。
  // 両端の2点は、通常の軸の範囲が0〜6（余白を足して）、対数の軸の範囲が1〜1000000（目盛りの値）で、対数の上で一致するように置く
  const labels = ['QWERTY', 'Dvorak', 'NICOLA', 'Colemak'];
  const linearPoints = [
    { targetKey: 'low', label: 'Low', x: 0.5, y: 0.5 },
    { targetKey: 'high', label: 'High', x: 5.5, y: 5.5 },
    ...labels.map((label, i) => ({ targetKey: label, label, x: 3 + i * 0.01, y: 2.5 + (i % 2) * 0.02 })),
  ];
  const logPoints = linearPoints.map((p) => ({ ...p, x: 10 ** p.x, y: 10 ** p.y }));
  const linear = scatterPlotModel({ points: linearPoints, contour: undefined, legendRows: ['かな配列'], contourName: '', contourSuffix: '' });
  const log = scatterPlotModel({ points: logPoints, contour: undefined, legendRows: ['かな配列'], contourName: '', contourSuffix: '', logScale: true });
  for (const [i, point] of linear.points.entries()) {
    assert.ok(Math.abs(point.px - log.points[i]!.px) < 1e-9 && Math.abs(point.py - log.points[i]!.py) < 1e-9);
  }
  // 座標は浮動小数点の誤差を除いて比べる
  const rounded = (names: typeof linear.names) =>
    JSON.parse(JSON.stringify(names), (_key, value) => (typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value));
  assert.deepEqual(rounded(log.names), rounded(linear.names));
});

test('scatterPlotModel: logScaleを偽にしても省いても、通常の目盛りの結果は変わらない', () => {
  const contour = PRODUCT_CONTOUR;
  const base = { points: POINTS, contour, legendRows: ['かな配列'], contourName: '総移動距離', contourSuffix: '' };
  assert.deepEqual(scatterPlotModel({ ...base, logScale: false }), scatterPlotModel(base));
});

type PercentCase = { readonly points: readonly [number, number][]; readonly x: ComparisonColumnId; readonly y: ComparisonColumnId };

function percentLines(c: PercentCase, logScale: boolean): number[] {
  const contour = scatterContour(c.x, c.y, 100, 'ja')!;
  const points = c.points.map(([x, y], i) => ({ targetKey: `k${i}`, label: `L${i}`, x, y }));
  const model = scatterPlotModel({ points, contour, legendRows: [], contourName: '', contourSuffix: '%', logScale });
  return model.contours.map((line) => line.level);
}

const WIDE: PercentCase = {
  points: [
    [300, 30],
    [30, 300],
    [100, 100],
  ],
  x: 'handSwitches',
  y: 'handContinuations',
};
const NARROW: PercentCase = {
  points: [
    [100, 100],
    [120, 90],
    [90, 120],
  ],
  x: 'handSwitches',
  y: 'handContinuations',
};

test('割合の細い線: 範囲が広い時は10%刻みの線を6本に絞らず全部引き、0%と100%の線は引かない（通常・対数とも）', () => {
  for (const logScale of [false, true]) {
    assert.deepEqual(percentLines(WIDE, logScale), [10, 20, 30, 40, 50, 60, 70, 80, 90]);
  }
});

test('割合の細い線: 刻みが10%より細かい時は、今までと同じ刻みで6本に絞る', () => {
  assert.deepEqual(percentLines(NARROW, false), [44, 46, 48, 50, 52, 54]);
  // 対数の目盛りでは範囲が違うので、刻みも違う
  assert.deepEqual(percentLines(NARROW, true), [40, 45, 50, 55, 60]);
});

test('割合の細い線: 今の規則で0%の線が選ばれる範囲でも、刻みが10%の時は0%の線を引かない', () => {
  const zero: PercentCase = {
    points: [
      [125.42, 130.33],
      [126.87, 168.86],
      [123.97, 8.09],
    ],
    x: 'handSwitches',
    y: 'handContinuations',
  };
  assert.deepEqual(percentLines(zero, false), [10, 20, 30, 40, 50]);
});

test('割合の細い線: 範囲が狭く10%より細かい刻みになる図は、今までと同じ刻みと本数のまま', () => {
  const cases: [PercentCase['points'], number[]][] = [
    // 4〜12%付近。刻み2%
    [
      [
        [100, 5],
        [100, 10],
        [100, 12],
      ],
      [4, 6, 8, 10, 12],
    ],
    // 3〜19%付近。刻み2%で8本になる範囲を6本に絞る
    [
      [
        [100, 4],
        [100, 15],
        [100, 20],
      ],
      [6, 8, 10, 12, 14, 16],
    ],
    // 25〜40%付近。10%では3本に満たないので5%
    [
      [
        [100, 35],
        [100, 60],
        [100, 50],
      ],
      [25, 30, 35, 40],
    ],
  ];
  for (const [points, expected] of cases) {
    assert.deepEqual(percentLines({ points, x: 'handSwitches', y: 'handContinuations' }, false), expected);
  }
});

test('割合の細い線: 同指率・同じ手の続きの割合・移動ありキー率は割合として扱う', () => {
  for (const column of ['sameFingerRate', 'sameHandContinuationRate', 'movedPressShare'] as const) {
    assert.equal(axisUnit(column), '%', column);
  }
  // 割合でない量は単位が%にならない
  for (const column of ['sameFinger', 'handSwitches', 'perPressUnits'] as const) assert.notEqual(axisUnit(column), '%', column);
});

test('割合でない細い線は、範囲が広くても6本以内に絞る（通常・対数とも）', () => {
  const contour = scatterContour('actions', 'meanPerStroke', 100, 'ja')!;
  for (const logScale of [false, true]) {
    const model = scatterPlotModel({ points: POINTS, contour, legendRows: [], contourName: '', contourSuffix: '', logScale });
    assert.ok(model.contours.length >= 4 && model.contours.length <= 6, `${logScale} ${model.contours.length}本`);
  }
});
