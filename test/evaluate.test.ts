import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '../src/geometry.ts';
import { evaluate, type Options } from '../src/evaluate.ts';
import { computeMetrics } from '../src/metrics.ts';
import { LAYOUT_BY_ID } from '../src/layouts/index.ts';

const geometry = buildGeometry('row-staggered');
const qwerty = LAYOUT_BY_ID.get('qwerty')!;
const opts = (o: Partial<Options> = {}): Options => ({
  windowSize: 3,
  sfbHomeCost: true,
  ...o,
});

const near = (a: number, b: number, msg?: string) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} expected ${b}, got ${a}`);

const totalOf = (text: string, o: Partial<Options> = {}) =>
  computeMetrics(evaluate(text, qwerty, geometry, opts(o)), geometry).totalUnits;

test('初回打鍵はホームからの距離になる', () => {
  // j は右人差し指のホームキー
  near(totalOf('j'), 0, 'j');
  // h はホームの 1u 左
  near(totalOf('h'), 1, 'h');
});

test('g=0（同指連続）はキー間距離。ホームキーでも加算する', () => {
  // h(1u) → j: 同指連続なので min を取らず d(h,j)=1u
  near(totalOf('hj'), 2, 'hj');
});

test('sfbHomeCost=false のとき g=0 のホームキー打鍵は 0', () => {
  near(totalOf('hj', { sfbHomeCost: false }), 1, 'hj');
});

test('sfbHomeCost はホームキー以外の同指連続を変えない', () => {
  // h → y は両方とも右人差し指、y はホームキーではない
  assert.equal(totalOf('hy', { sfbHomeCost: true }), totalOf('hy', { sfbHomeCost: false }));
});

test('窓の内側では残った場合と戻った場合の小さい方を採る', () => {
  // y(上段 col5) → 他指 1 打 → u(上段 col6)。ともに右人差し指。
  //   d_stay = dist(y, u) = 1
  //   d_home = dist(j, u) = √(0.25² + 1²) ≈ 1.0308
  // 窓内なので小さい方の d_stay = 1 が採られる
  const t = evaluate('yau', qwerty, geometry, opts({ windowSize: 3 }));
  const last = t.strokes[2];
  assert.equal(last.char, 'u');
  assert.equal(last.gap, 1);
  near(last.distance, 1, 'u');
});

test('窓の外では必ずホームからの距離になる', () => {
  // y → 他指 4 打 → u。windowSize=3 なので g=4 > N
  const t = evaluate('yasdfu', qwerty, geometry, opts({ windowSize: 3 }));
  const last = t.strokes[5];
  assert.equal(last.char, 'u');
  assert.equal(last.gap, 4);
  const home = geometry.homes.RI;
  const u = geometry.grid[1][6];
  near(last.distance, Math.hypot(home.x - u.x, home.y - u.y), 'u');
});

test('g は全打鍵を数える（その指の打鍵だけではない）', () => {
  const t = evaluate('yasu', qwerty, geometry, opts());
  assert.equal(t.strokes[3].gap, 2);
});

test('N を大きくすると総移動距離は単調に減少する', () => {
  const text = 'the quick brown fox jumps over the lazy dog';
  let last = Infinity;
  for (const n of [0, 1, 2, 3, 5, 8, 12]) {
    const d = totalOf(text, { windowSize: n });
    assert.ok(d <= last + 1e-9, `N=${n}: ${d} > ${last}`);
    last = d;
  }
});

test('配列に無い文字は skipped に数える', () => {
  const t = evaluate('a漢b', qwerty, geometry, opts());
  assert.equal(t.strokes.length, 2);
  assert.equal(t.skipped, 1);
});

test('段ずれ量が ANSI の修飾キー幅と一致する', () => {
  // 上段 q は +0.5u、ホーム段 a は +0.75u、下段 z は +1.25u
  near(geometry.grid[1][0].x, 0.5, 'q');
  near(geometry.grid[2][0].x, 0.75, 'a');
  near(geometry.grid[3][0].x, 1.25, 'z');
});

test('隣接指間距離はホーム段で 1u 前後になる', () => {
  const m = computeMetrics(evaluate('asdf jkl;', qwerty, geometry, opts()), geometry);
  for (const stat of m.adjacent) {
    assert.ok(stat.mean > 0.5 && stat.mean < 2, `${stat.pair.join('-')}: ${stat.mean}`);
  }
});
