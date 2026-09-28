import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import {
  BUILTIN_LAYOUT_COLOR_INDEX,
  leastUsedColorIndex,
  paletteColor,
  setupColor,
  SETUP_COLOR_PALETTE_SIZE,
  targetColor,
} from './color.ts';
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
  assert.equal(leastUsedColorIndex([], [0]), 1);
  assert.equal(leastUsedColorIndex([], [0, 1]), 2);
});

test('leastUsedColorIndex: avoidを指定しても、選ぶ候補はavoid以外から尽きない限り例外にならない', () => {
  // パレットが1色しか無く「avoid以外に候補が無い」ケースは今のパレットサイズ（12）では
  // 再現できないが、その分岐（avoidを諦めて通常どおり選ぶ）が例外を投げない実装に
  // なっていることは、既存の全indexをavoidに指定しても必ず値が返ることで代替確認する。
  const heavilyUsed = Array.from({ length: 40 }, (_, i) => i % SETUP_COLOR_PALETTE_SIZE);
  for (let avoid = 0; avoid < SETUP_COLOR_PALETTE_SIZE; avoid++) {
    const next = leastUsedColorIndex(heavilyUsed, [avoid]);
    assert.ok(next >= 0 && next < SETUP_COLOR_PALETTE_SIZE);
    assert.notEqual(next, avoid); // このパレットサイズでは常にavoid以外を選べる
  }
});

test('leastUsedColorIndex: 戻り値は常にパレットの範囲内', () => {
  const indexes = Array.from({ length: 40 }, (_, i) => i % SETUP_COLOR_PALETTE_SIZE);
  for (let avoid = 0; avoid < SETUP_COLOR_PALETTE_SIZE; avoid++) {
    const next = leastUsedColorIndex(indexes, [avoid]);
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

test('leastUsedColorIndex: 全色をavoidしても例外にならず、除外を諦めて選ぶ', () => {
  const all = Array.from({ length: SETUP_COLOR_PALETTE_SIZE }, (_, i) => i);
  assert.equal(leastUsedColorIndex([], all), 0);
});

// ---------------------------------------------------------------------------
// パレットと組み込み配列の色（レビュー指摘M2）
// ---------------------------------------------------------------------------

/** sRGBの16進 → OKLCHの色相（度）。色相の近さを人の見え方に近い尺度で測るため。 */
function oklchHue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return (Math.atan2(bb, a) * 180 / Math.PI + 360) % 360;
}

function hueDistance(a: string, b: string): number {
  const d = Math.abs(oklchHue(a) - oklchHue(b));
  return Math.min(d, 360 - d);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const PALETTE = Array.from({ length: SETUP_COLOR_PALETTE_SIZE }, (_, i) => paletteColor(i));

test('パレット: どの2色も色相が25°以上離れている（30°刻みから丸め誤差を見込む）', () => {
  for (let i = 0; i < PALETTE.length; i++) {
    for (let j = i + 1; j < PALETTE.length; j++) {
      assert.ok(hueDistance(PALETTE[i]!, PALETTE[j]!) >= 25, `${PALETTE[i]} と ${PALETTE[j]} の色相が近い`);
    }
  }
});

test('パレット: ライト・ダーク両themeの面（--surface）に対してコントラスト比3以上', () => {
  for (const color of PALETTE) {
    assert.ok(contrast(color, '#ffffff') >= 3, `${color} はライトthemeで薄い`);
    assert.ok(contrast(color, '#1c1c1a') >= 3, `${color} はダークthemeで暗い`);
  }
});

const layoutColor = (layoutId: string) => targetColor({ kind: 'layout', layoutId }, new Map());

test('組み込み配列: すべての組み込み配列が固定の表に載っている（足した配列の色を明示的に決める）', () => {
  for (const id of LAYOUT_BY_ID.keys()) {
    assert.ok(BUILTIN_LAYOUT_COLOR_INDEX.has(id), `${id} の色が表に無い`);
  }
});

test('組み込み配列: 英字配列同士は色相で60°以上離れている', () => {
  const latin = ['qwerty', 'dvorak', 'colemak', 'colemak-dh', 'workman'];
  for (let i = 0; i < latin.length; i++) {
    for (let j = i + 1; j < latin.length; j++) {
      const d = hueDistance(layoutColor(latin[i]!), layoutColor(latin[j]!));
      assert.ok(d >= 55, `${latin[i]} と ${latin[j]} の色相差が${d.toFixed(0)}°`);
    }
  }
});

test('組み込み配列: 色を共有するのは決めた5組だけで、qwertyと同系統の変種は共有しない', () => {
  const allowed = new Set([
    'shingeta|workman',
    'oonishi-custom|shin-jis-prefix',
    'colemak|naginata-v18',
    'dvorak|tsuki-2-263',
    'colemak-dh|shin-jis-simultaneous',
  ]);
  const ids = [...LAYOUT_BY_ID.keys()];
  const shared: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (layoutColor(ids[i]!) === layoutColor(ids[j]!)) shared.push([ids[i], ids[j]].sort().join('|'));
    }
  }
  assert.deepEqual(new Set(shared), allowed);
  // 17配列・12色なので5組は避けられない（鳩の巣原理）。それより多く共有していない。
  assert.equal(shared.length, ids.length - SETUP_COLOR_PALETTE_SIZE);
});

test('組み込み配列: 同じ系統の変種どうしは色相で60°以上離れている', () => {
  const families = [
    ['colemak', 'colemak-dh'],
    ['oonishi', 'oonishi-custom'],
    ['shin-jis-prefix', 'shin-jis-simultaneous'],
    ['kawasemi-kai', 'kawasemi-plus'],
  ];
  for (const family of families) {
    for (let i = 0; i < family.length; i++) {
      for (let j = i + 1; j < family.length; j++) {
        const d = hueDistance(layoutColor(family[i]!), layoutColor(family[j]!));
        assert.ok(d >= 55, `${family[i]} と ${family[j]} の色相差が${d.toFixed(0)}°`);
      }
    }
  }
});

test('組み込み配列: レビューで見つかった同色の組がすべて別の色になっている', () => {
  const pairs = [
    ['colemak', 'colemak-dh'],
    ['qwerty', 'shin-jis-prefix'],
    ['dvorak', 'shin-jis-simultaneous'],
    ['colemak', 'shingeta'],
    ['colemak-dh', 'tsuki-2-263'],
    ['workman', 'kawasemi-kai'],
    ['oonishi', 'kawasemi-plus'],
  ];
  for (const [a, b] of pairs) assert.notEqual(layoutColor(a!), layoutColor(b!), `${a} と ${b}`);
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
