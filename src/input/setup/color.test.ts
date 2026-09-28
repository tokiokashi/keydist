import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupColor, leastUsedColorIndex, SETUP_COLOR_PALETTE_SIZE } from './color.ts';

test('setupColor: 保存されたcolorIndexからパレットを引く（決定的な参照）', () => {
  const setup = { colorIndex: 3 };
  const first = setupColor(setup);
  for (let i = 0; i < 5; i++) assert.equal(setupColor(setup), first);
  assert.notEqual(setupColor({ colorIndex: 0 }), setupColor({ colorIndex: 1 }));
});

test('leastUsedColorIndex: 手持ちが空なら0番から順に使う（initialSetupsが依存する挙動）', () => {
  const indexes: number[] = [];
  for (let i = 0; i < SETUP_COLOR_PALETTE_SIZE; i++) {
    const next = leastUsedColorIndex(indexes);
    assert.equal(next, i);
    indexes.push(next);
  }
  // パレットを一周したら、また0番から（最も使用回数が少ない=1回のうち最小index）。
  assert.equal(leastUsedColorIndex(indexes), 0);
});

test('leastUsedColorIndex: 最も使用回数が少ないindexを選ぶ。同数なら小さい方', () => {
  // index 0 は2回、1は1回使われている状態。次は2番目に少ない1ではなく、
  // まだ使われていない2以降の中で最小のもの（未使用=0回が最小）を選ぶ。
  const next = leastUsedColorIndex([0, 0, 1]);
  assert.equal(next, 2);
});

test('leastUsedColorIndex: 全色が同数使われていれば最小indexに戻る', () => {
  const oneRoundEach = Array.from({ length: SETUP_COLOR_PALETTE_SIZE }, (_, i) => i);
  assert.equal(leastUsedColorIndex(oneRoundEach), 0);
});

test('leastUsedColorIndex: avoidを渡すとそのindexを除いた中から選ぶ（複製が複製元と別の色になる）', () => {
  // 全部0回（空の手持ち）でavoid=0を渡すと、0を除いた最小の1を選ぶ。
  assert.equal(leastUsedColorIndex([], 0), 1);
});

test('leastUsedColorIndex: avoidを指定しても、選ぶ候補はavoid以外から尽きない限り例外にならない', () => {
  // パレットが1色しか無く「avoid以外に候補が無い」ケースは今のパレットサイズ（12）では
  // 再現できないが、その分岐（avoidを諦めて通常どおり選ぶ）が例外を投げない実装に
  // なっていることは、既存の全indexをavoidに指定しても必ず値が返ることで代替確認する。
  const heavilyUsed = Array.from({ length: 40 }, (_, i) => i % SETUP_COLOR_PALETTE_SIZE);
  for (let avoid = 0; avoid < SETUP_COLOR_PALETTE_SIZE; avoid++) {
    const next = leastUsedColorIndex(heavilyUsed, avoid);
    assert.ok(next >= 0 && next < SETUP_COLOR_PALETTE_SIZE);
    assert.notEqual(next, avoid); // このパレットサイズでは常にavoid以外を選べる
  }
});

test('leastUsedColorIndex: 戻り値は常にパレットの範囲内', () => {
  const indexes = Array.from({ length: 40 }, (_, i) => i % SETUP_COLOR_PALETTE_SIZE);
  for (let avoid = 0; avoid < SETUP_COLOR_PALETTE_SIZE; avoid++) {
    const next = leastUsedColorIndex(indexes, avoid);
    assert.ok(next >= 0 && next < SETUP_COLOR_PALETTE_SIZE);
  }
});
