import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { setupColor, targetColor, leastUsedColorIndex, SETUP_COLOR_PALETTE_SIZE } from './color.ts';
import type { Setup } from './types.ts';

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

// ---------------------------------------------------------------------------
// targetColor（レビュー指摘2）
// ---------------------------------------------------------------------------

test('targetColor: 配列対象は決定的（同じlayoutIdは毎回同じ色）', () => {
  const target = { kind: 'layout', layoutId: 'qwerty' } as const;
  const first = targetColor(target, new Map());
  for (let i = 0; i < 5; i++) assert.equal(targetColor(target, new Map()), first);
});

test('targetColor: 組み込み配列はqwerty/colemakのような隣り合う配列でも違う色になる', () => {
  const qwerty = targetColor({ kind: 'layout', layoutId: 'qwerty' }, new Map());
  const colemak = targetColor({ kind: 'layout', layoutId: 'colemak' }, new Map());
  assert.notEqual(qwerty, colemak);
});

test('targetColor: 組み込み配列は登録順から歩幅を空けて色を割り当てる（LAYOUT_BY_IDの先頭数件で衝突しない）', () => {
  const ids = [...LAYOUT_BY_ID.keys()].slice(0, SETUP_COLOR_PALETTE_SIZE);
  const colors = ids.map((id) => targetColor({ kind: 'layout', layoutId: id }, new Map()));
  assert.equal(new Set(colors).size, colors.length, '色数と同じ件数までは全員別の色になるはず');
});

test('targetColor: 自作配列（LAYOUT_BY_IDに無いid）はハッシュにフォールバックし、それでも決定的', () => {
  const target = { kind: 'layout', layoutId: 'my-custom-layout-abc' } as const;
  const first = targetColor(target, new Map());
  assert.equal(targetColor(target, new Map()), first);
  assert.ok(first.startsWith('#'));
});

test('targetColor: Setup対象は保存されたcolorIndexをそのまま使う', () => {
  const setup: Setup = { id: 's1', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 3 };
  const target = { kind: 'setup', setupId: 's1' } as const;
  assert.equal(targetColor(target, new Map([['s1', setup]])), setupColor(setup));
});

test('targetColor: 手持ちに無いSetup idでも例外にならず既定色を返す', () => {
  const target = { kind: 'setup', setupId: 'ghost' } as const;
  const color = targetColor(target, new Map());
  assert.ok(color.startsWith('#'));
});
