import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry, dist } from '../src/geometry.ts';
import { figurePresses, gapFigure, FIGURE_TEXT, SFB_TEXT } from '../src/gap-figure.ts';

const geometry = buildGeometry('row-staggered');
const svg = gapFigure(geometry);

test('固定例は標準ローマ字で 15 打鍵に展開される', () => {
  const presses = figurePresses(geometry);
  assert.equal(presses.map((p) => p.keyId).join(''), 'jouhouwoatumeru');
  assert.equal(presses.length, 15);
  assert.ok(svg.includes(FIGURE_TEXT));
});

test('本文が拾う打鍵の g は仕様の 3 分岐に 1 つずつ対応する', () => {
  const presses = figurePresses(geometry);
  const at = (n: number) => presses.find((p) => p.number === n)!;
  assert.equal(at(4).gap, 0, 'u → h。同指連続');
  assert.equal(at(12).gap, 0, 'u → m。同指連続');
  assert.equal(at(15).gap, 2, '1 ≤ g ≤ N。窓の内側');
  assert.equal(at(11).gap, 4, 'g > N。復帰済み');
});

test('図に出る距離は評価器と幾何から引いた値と一致する', () => {
  const presses = figurePresses(geometry);
  const at = (n: number) => presses.find((p) => p.number === n)!;
  const k = (id: string) => geometry.keys.get(id)!;
  // ホームから u。段ずれで真上ではない
  assert.equal(at(3).distance.toFixed(3), '1.031');
  // 同指連続はホームの方が近くても残った側を払う（§8・§9）
  assert.equal(at(4).distance.toFixed(3), '1.250');
  assert.ok(dist(geometry.homes.RI, k('h')) < at(4).distance, 'ホームの方が近い');
  // 窓の内側は短い方
  assert.equal(at(15).distance.toFixed(3), '1.031');
  // 窓の外はホームから。残れば 0 でも払う
  assert.equal(at(11).distance.toFixed(3), '1.031');
  assert.ok(svg.includes('1.031 u') && svg.includes('1.25 u') && svg.includes('2.136 u'));
});

test('距離の表記は末尾の 0 を落とす', () => {
  assert.ok(svg.includes('1.25 u'), '1.250 ではなく 1.25');
  assert.ok(svg.includes('1 u'), '1.000 ではなく 1');
  assert.ok(!svg.includes('1.250 u') && !svg.includes('1.000 u'));
});

test('打鍵順は丸数字で出す', () => {
  assert.ok(svg.includes('①') && svg.includes('②'), '①② が出る');
  assert.ok(svg.includes('⑥'), '窓の外の面は 6 打鍵ぶん振る');
  assert.ok(!/#\d/.test(svg), '通し番号の #n は使わない');
});

test('オーソリニアでは同じ移動が 1 u になる', () => {
  const ortho = buildGeometry('ortholinear');
  assert.equal(dist(ortho.homes.RI, ortho.keys.get('u')!).toFixed(3), '1.000');
  assert.ok(svg.includes('オーソリニア'));
});

test('ホームキーへ戻る同指連続は別の例で示す', () => {
  const sfb = figurePresses(geometry, SFB_TEXT);
  assert.equal(sfb.map((p) => p.keyId).join(''), 'iku');
  assert.equal(sfb[1].gap, 0);
  assert.equal(sfb[1].keyId, 'k', 'k は右中指のホーム');
  assert.equal(sfb[1].distance.toFixed(3), '1.031');
});

test('採らなかった候補は消さずに残す', () => {
  const dashed = [...svg.matchAll(/stroke-dasharray="4 3"/g)];
  assert.ok(dashed.length >= 3, `候補にならない矢印を破線で残す: ${dashed.length}`);
  assert.ok(svg.includes('候補にならない'));
});

test('SVG のツールチップは title 属性ではなく data-tip を使う', () => {
  assert.ok(svg.includes('data-tip='));
  assert.ok(!/<(svg|g|text|rect|line|polygon)[^>]*\stitle=/.test(svg));
});
