import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { COLOR_SLOT_COUNT } from '#engine/multi-target-selection.ts';
import { TARGET_PALETTE_SIZE, targetPaletteColor } from './target-colors.ts';

// 背景は theme.css から読む。直書きすると theme.css を変えた時に古い値で測り続け、
// パレットが基準を割っても気づけない。N感度の線は実際にはページ地（--bg）の上に描かれる。
// 枠付きの面（--surface）も測る。
const THEME_CSS = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');

function lightDark(token: string): { light: string; dark: string } {
  const pattern = new RegExp(`^\\s*${token}:\\s*light-dark\\(\\s*(#[0-9a-fA-F]{6})\\s*,\\s*(#[0-9a-fA-F]{6})\\s*\\);`, 'gm');
  const matches = [...THEME_CSS.matchAll(pattern)];
  // 1か所で定義し color-scheme だけで切り替える前提（theme.css 冒頭の注記）。複数あれば、どれを測るか決められない。
  assert.equal(matches.length, 1, `theme.css の ${token} を light-dark(#rrggbb, #rrggbb) の形で1か所から読めない`);
  return { light: matches[0]![1]!, dark: matches[0]![2]! };
}

const BACKGROUNDS: Record<string, string> = {};
for (const token of ['--bg', '--surface', '--surface-raised', '--surface-subtle', '--surface-muted']) {
  const { light, dark } = lightDark(token);
  BACKGROUNDS[`light ${token}`] = light;
  BACKGROUNDS[`dark ${token}`] = dark;
}

function channels(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

// WCAG 2.x の相対輝度とコントラスト比。
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(linear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// sRGB → OKLab（Björn Ottosson の定義）。色の見分けやすさを距離で測るため。
function oklab(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map(linear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function distance(a: string, b: string): number {
  const [x, y] = [oklab(a), oklab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

// 色は theme.css の --target-color-N（light-dark）から、明暗それぞれ読む。
const PALETTES = { light: [] as string[], dark: [] as string[] };
for (let i = 0; i < TARGET_PALETTE_SIZE; i++) {
  const { light, dark } = lightDark(`--target-color-${i}`);
  PALETTES.light.push(light);
  PALETTES.dark.push(dark);
}
const THEMES = ['light', 'dark'] as const;

test('パレット: どの色も明暗両themeの背景に対してコントラスト比3以上', () => {
  for (const theme of THEMES) {
    for (const color of PALETTES[theme]) {
      for (const [name, background] of Object.entries(BACKGROUNDS)) {
        if (!name.startsWith(theme)) continue;
        const ratio = contrast(color, background);
        assert.ok(ratio >= 3, `${color} は ${name}(${background}) に対して ${ratio.toFixed(2)}`);
      }
    }
  }
});

test('パレット: 1色目は、入れ替えても距離の変わらない2色目より、明暗の面を通した最悪のコントラスト比が高い', () => {
  // 1色だけの集合では1色目しか使わない。先頭2色の入れ替えは先頭k色（k≥2）の距離を変えないので、
  // 明・暗それぞれの色をそれぞれの theme の全ての面に当てた最小値が高い方を先にする。
  // theme ごとに比べると、暗では青紫が橙より下がる（青紫は暗の面の明度の下限に近い）ので、theme をまたいだ最悪値で見る。
  const worst = (slot: number) => Math.min(...THEMES.flatMap((theme) =>
    Object.entries(BACKGROUNDS).filter(([name]) => name.startsWith(theme)).map(([, background]) => contrast(PALETTES[theme][slot]!, background))));
  const [first, second] = [worst(0), worst(1)];
  assert.ok(first >= second, `1色目 ${first.toFixed(3)}、2色目 ${second.toFixed(3)}`);
});

test('パレット: どの2色もOKLabの距離で0.12以上離れている（明暗それぞれ）', () => {
  for (const pal of [PALETTES.light, PALETTES.dark]) {
    for (let i = 0; i < pal.length; i++) {
      for (let j = i + 1; j < pal.length; j++) {
        const d = distance(pal[i]!, pal[j]!);
        assert.ok(d >= 0.12, `${pal[i]} と ${pal[j]} の距離 ${d.toFixed(3)}`);
      }
    }
  }
});

test('パレット: 先頭から配った時、先頭の数色ほど互いに離れている（明暗それぞれ）', () => {
  // 集合は先頭の数色しか使わないことが多い。先頭k色の最小距離がkとともに減る（増えない）ことと、
  // 先頭3色が色相の隣り合わない色（距離0.25以上）であることを確かめる。
  for (const theme of THEMES) {
    const pal = PALETTES[theme];
    const minDistance = (k: number) => {
      let min = Number.POSITIVE_INFINITY;
      for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) min = Math.min(min, distance(pal[i]!, pal[j]!));
      return min;
    };
    assert.ok(minDistance(3) >= 0.25, `${theme}: 先頭3色の最小距離 ${minDistance(3).toFixed(3)}`);
    for (let k = 3; k <= pal.length; k++) {
      assert.ok(minDistance(k) <= minDistance(k - 1) + 1e-9, `${theme}: k=${k}`);
    }
  }
});

test('targetPaletteColor: 番号がパレットの数を超えたら先頭から繰り返す', () => {
  assert.equal(targetPaletteColor(TARGET_PALETTE_SIZE), targetPaletteColor(0));
  assert.equal(targetPaletteColor(TARGET_PALETTE_SIZE + 1), targetPaletteColor(1));
  assert.equal(targetPaletteColor(2), 'var(--target-color-2)');
});

test('パレットの色数は、集合が配る番号の数（COLOR_SLOT_COUNT）と一致する', () => {
  assert.equal(TARGET_PALETTE_SIZE, COLOR_SLOT_COUNT);
});
