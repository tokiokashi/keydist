import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry, dist } from '../src/geometry.ts';
import { figurePresses, gapFigure, FIGURE_TEXT } from '../src/gap-figure.ts';

const geometry = buildGeometry('row-staggered');
const svg = gapFigure(geometry);

/** 面ごとの盤面に出る本文行を取り出す */
const lines = (): string[] =>
  [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);

test('固定例は標準ローマ字で 15 打鍵に展開される', () => {
  const presses = figurePresses(geometry);
  assert.equal(presses.map((p) => p.keyId).join(''), 'jouhouwoatumeru');
  assert.equal(presses.length, 15);
});

test('3 面が拾う打鍵の g は仕様の 3 分岐に 1 つずつ対応する', () => {
  const presses = figurePresses(geometry);
  const at = (n: number) => presses.find((p) => p.number === n)!;
  assert.equal(at(12).gap, 0, 'g = 0。同指連続');
  assert.equal(at(15).gap, 2, '1 ≤ g ≤ N。窓の内側');
  assert.equal(at(11).gap, 4, 'g > N。復帰済み');
});

test('採用した距離は評価器の値と一致する', () => {
  const presses = figurePresses(geometry);
  const at = (n: number) => presses.find((p) => p.number === n)!;
  assert.equal(at(12).distance.toFixed(3), '2.136');
  assert.equal(at(15).distance.toFixed(3), '1.031');
  assert.equal(at(11).distance.toFixed(3), '1.031');
  for (const value of ['2.136 u', '1.031 u']) {
    assert.ok(svg.includes(`採用 ${value}`), `${value} が図に出る`);
  }
});

test('窓の内側の面だけが 2 本の矢印を持ち、負けた候補も残る', () => {
  const boards = svg.split('<figure class="gap-board">').slice(1);
  assert.equal(boards.length, 3);
  const arrows = boards.map((b) => [...b.matchAll(/<polygon /g)].length);
  assert.deepEqual(arrows, [1, 2, 1]);
  const rejected = boards[1].match(/stroke="var\(--muted\)"/g) ?? [];
  assert.ok(rejected.length >= 1, '採らなかった候補はグレーで残す');
});

test('薄く描いたキーの数がそのまま g になる', () => {
  const boards = svg.split('<figure class="gap-board">').slice(1);
  const dim = boards.map((b) => [...b.matchAll(/fill="var\(--panel-2\)"/g)].length);
  assert.deepEqual(dim, [0, 2, 4]);
});

test('導入は j → u の直線距離を形状ごとの実測で出す', () => {
  const j = geometry.keys.get('j')!;
  const u = geometry.keys.get('u')!;
  assert.equal(dist(j, u).toFixed(3), '1.031', 'row-staggered は段ずれで 0.25 u 横に動く');
  const ortho = buildGeometry('ortholinear');
  assert.equal(dist(ortho.keys.get('j')!, ortho.keys.get('u')!).toFixed(3), '1.000');

  const intro = svg.split('<figure class="gap-intro">')[1].split('</figure>')[0];
  assert.ok(intro.includes('j → u は d = 1.031 u'));
  assert.ok(intro.includes(`dx ${(u.x - j.x).toFixed(2)}`));
  assert.ok(intro.includes(`dy ${(u.y - j.y).toFixed(2)}`));
  assert.equal([...intro.matchAll(/<polygon /g)].length, 1, '導入の矢印は 1 本');
  assert.ok(!intro.includes('g ='), '導入では g の話をしない');
  assert.ok(svg.includes('ortholinear では横のずれが無く 1.000 u になる'));
});

test('条件と例文を図の脇に出す', () => {
  assert.ok(svg.includes(FIGURE_TEXT));
  assert.ok(svg.includes('QWERTY'));
  assert.ok(svg.includes('row-staggered'));
  assert.ok(svg.includes('N = 3'));
  assert.ok(svg.includes('標準（j / sh / ch）'));
});

test('g = 0 の面に sfb_home_cost の注記を置く', () => {
  const first = svg.split('<figure class="gap-board">')[1];
  assert.ok(lines().includes('sfb_home_cost で切り替えられる（§8）。'));
  assert.ok(first.includes('sfb_home_cost'));
});

test('SVG は title 属性を使わず data-tip でツールチップを出す', () => {
  assert.ok(!/<(rect|text|g|polygon|line)[^>]*\stitle=/.test(svg));
  assert.ok(svg.includes('data-tip="'));
});
