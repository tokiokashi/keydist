import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { TARGET_PALETTE_SIZE } from './target-colors.ts';

// 散布図が配列の種類の点に使う色（--kind-color-*）を、theme.cssから明暗それぞれ読んで検査する。
// 対象の色（--target-color-N）と紛れないこと、背景から見分けられることが条件。
const THEME_CSS = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');

function lightDark(token: string): { light: string; dark: string } {
  const pattern = new RegExp(`^\\s*${token}:\\s*light-dark\\(\\s*(#[0-9a-fA-F]{6})\\s*,\\s*(#[0-9a-fA-F]{6})\\s*\\);`, 'gm');
  const matches = [...THEME_CSS.matchAll(pattern)];
  assert.equal(matches.length, 1, `theme.cssの${token} を light-dark(#rrggbb, #rrggbb) の形で1か所から読めない`);
  return { light: matches[0]![1]!, dark: matches[0]![2]! };
}

function channels(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(linear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// sRGB → OKLab（Björn Ottossonの定義）。
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

const THEMES = ['light', 'dark'] as const;
const SURFACES = ['--bg', '--surface', '--surface-raised', '--surface-subtle', '--surface-muted'];
const KINDS = ['--kind-color-kana', '--kind-color-alpha'];

test('配列の種類の色: どの面に対してもコントラスト比3以上（明暗それぞれ）', () => {
  for (const kind of KINDS) {
    const color = lightDark(kind);
    for (const surface of SURFACES) {
      const background = lightDark(surface);
      for (const theme of THEMES) {
        const ratio = contrast(color[theme], background[theme]);
        assert.ok(ratio >= 3, `${kind} ${theme} ${surface}: ${ratio.toFixed(2)}`);
      }
    }
  }
});

test('配列の種類の色: 対象の色のどれともOKLabの距離で0.1以上離れている（明暗それぞれ）', () => {
  for (const kind of KINDS) {
    const color = lightDark(kind);
    for (let i = 0; i < TARGET_PALETTE_SIZE; i++) {
      const target = lightDark(`--target-color-${i}`);
      for (const theme of THEMES) {
        const d = distance(color[theme], target[theme]);
        assert.ok(d >= 0.1, `${kind} と --target-color-${i}（${theme}）の距離 ${d.toFixed(3)}`);
      }
    }
  }
});

test('配列の種類の色: 2色は互いにOKLabの距離で0.2以上離れている（明暗それぞれ）', () => {
  const [kana, alpha] = KINDS.map((kind) => lightDark(kind)) as [ReturnType<typeof lightDark>, ReturnType<typeof lightDark>];
  for (const theme of THEMES) {
    const d = distance(kana[theme], alpha[theme]);
    assert.ok(d >= 0.2, `${theme}: ${d.toFixed(3)}`);
  }
});
