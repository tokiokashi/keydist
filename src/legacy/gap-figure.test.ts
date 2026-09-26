import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry, dist } from '#input/shapes/geometry.ts';
import { figurePresses, gapFigure, SFB_TEXT } from '#legacy/gap-figure.ts';

const geometry = buildGeometry('row-staggered');
const svg = gapFigure(geometry);

test('固定例は標準ローマ字で15打鍵に展開される', () => {
  const presses = figurePresses(geometry);
  assert.equal(presses.map((p) => p.keyId).join(''), 'jouhouwoatumeru');
  assert.equal(presses.length, 15);
});

test('本文が拾う打鍵は同指連続とselected input距離の3分岐に対応する', () => {
  const presses = figurePresses(geometry);
  const at = (n: number) => presses.find((p) => p.number === n)!;
  assert.equal(at(4).gap, 0, 'u → h。同指連続');
  assert.equal(at(12).gap, 0, 'u → m。同指連続');
  assert.equal(at(15).inputDistance, 3, '3入力先なのでN=3の内側');
  assert.equal(at(11).inputDistance, 5, '5入力先なのでN=3の外');
});

test('図に出る距離は評価器と幾何から引いた値と一致する', () => {
  const presses = figurePresses(geometry);
  const at = (n: number) => presses.find((p) => p.number === n)!;
  const k = (id: string) => geometry.keys.get(id)!;
  // ホームからu。段ずれで真上ではない
  assert.equal(at(3).distance.toFixed(3), '1.031');
  // 同指連続はホームの方が近くても残った側を払う（§8・§9）
  assert.equal(at(4).distance.toFixed(3), '1.250');
  assert.ok(dist(geometry.homes.RI, k('h')) < at(4).distance, 'ホームの方が近い');
  // 窓の内側は短い方
  assert.equal(at(15).distance.toFixed(3), '1.031');
  // 窓の外はホームから。残れば0でも払う
  assert.equal(at(11).distance.toFixed(3), '1.031');
  assert.ok(svg.includes('1.031u') && svg.includes('1.25u') && svg.includes('2.136u'));
});

test('距離の表記は末尾の0を落とす', () => {
  assert.ok(svg.includes('1.25u'), '1.250ではなく1.25');
  assert.ok(svg.includes('1u'), '1.000ではなく1');
  assert.ok(!svg.includes('1.250u') && !svg.includes('1.000u'));
});

test('打鍵順は丸数字で出す', () => {
  assert.ok(svg.includes('①') && svg.includes('②'), '①② が出る');
  assert.ok(svg.includes('⑥'), '窓の外の面は6打鍵ぶん振る');
  assert.ok(!/#\d/.test(svg), '通し番号の #nは使わない');
});

test('オーソリニアでは同じ移動が1 uになる', () => {
  const ortho = buildGeometry('ortholinear');
  assert.equal(dist(ortho.homes.RI, ortho.keys.get('u')!).toFixed(3), '1.000');
  assert.ok(svg.includes('オーソリニア'));
});

test('ホームキーへ戻る同指連続は別の例で示す', () => {
  const sfb = figurePresses(geometry, SFB_TEXT);
  assert.equal(sfb.map((p) => p.keyId).join(''), 'iku');
  assert.equal(sfb[1].gap, 0);
  assert.equal(sfb[1].keyId, 'k', 'kは右中指のホーム');
  assert.equal(sfb[1].distance.toFixed(3), '1.031');
});

test('採らなかった候補は消さずに残す', () => {
  const dashed = [...svg.matchAll(/stroke-dasharray="4 3"/g)];
  assert.ok(dashed.length >= 3, `候補にならない矢印を破線で残す: ${dashed.length}`);
  assert.ok(svg.includes('候補にならない'));
});

test('SVGのツールチップはtitle属性ではなくdata-tipを使う', () => {
  assert.ok(svg.includes('data-tip='));
  assert.ok(!/<(svg|g|text|rect|line|polygon)[^>]*\stitle=/.test(svg));
});

test('句点の直後で改行する', () => {
  assert.ok(svg.includes('。<br />'), '文の切れ目に改行が入る');
  assert.ok(!/。<br \/><\/p>/.test(svg), '段落末尾には改行を足さない');
});

test('本文の数式にスペースを入れない', () => {
  // 単位と矢印は常に詰める
  for (const bad of [' ≤ ', '1.031 u', '1.25 u', '1 u']) {
    assert.ok(!svg.includes(bad), `スペース入りの表記が残っている: ${bad}`);
  }
  // 本文（<p>）の中は等号も詰める
  // 前提条件の囲みは独立した式の行なので除く
  const body = svg.replace(/<div class="callout callout-important">[\s\S]*?<\/div>/, '');
  const prose = [...body.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => m[1]).join('\n');
  for (const bad of [' = ', ' → ', 'N = ', 'd = ']) {
    assert.ok(!prose.includes(bad), `本文にスペース入りの表記が残っている: ${bad}`);
  }
  // 独立した式の行だけ等号の両側を空ける
  assert.ok(svg.includes('d(j,u) = '), '盤面のラベルは等号の両側を空ける');
  assert.ok(svg.includes('d(j,u)') && svg.includes('d(u,h)'), '盤面のラベルはd(ab)の形');
  assert.ok(svg.includes('N = 3'), '前提条件の行');
  assert.ok(svg.includes('5入力先'), 'Nは入力先の距離として説明する');
});

test('囲みはnote / important / warningの3種を使う', () => {
  for (const kind of ['note', 'important', 'warning']) {
    assert.ok(svg.includes(`callout-${kind}`), `${kind} の囲みが出る`);
  }
  assert.ok(svg.includes('前提条件'), '前提条件の囲みは見出しを差し替える');
  assert.ok(svg.includes('Note') && svg.includes('Warning'), '種別名は英語で出す');
});
