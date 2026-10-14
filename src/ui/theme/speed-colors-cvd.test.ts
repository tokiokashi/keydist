import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// 表の中央値より遅いマスの色（--speed-slow）と速いマスの色（--speed-fast）が、
// 色覚の違いのシミュレーションを通しても区別できるかを検査する。
// 実際のマスは面の色へ混ぜた色なので、最も濃い時の混ぜた色（personal-speed.cssの割合）で見る。

const MIX = 0.55;

// Machado, Oliveira & Fernandes (2009) の重さ1.0の行列。線形sRGBに掛ける。
const SIMULATIONS = {
  '1型': [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  '2型': [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  '3型': [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
} as const;

type Vec3 = [number, number, number];

function linearRgb(hex: string): Vec3 {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff].map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Vec3;
}

function simulate(rgb: Vec3, matrix: readonly (readonly number[])[]): Vec3 {
  return matrix.map((row) => Math.min(1, Math.max(0, row[0]! * rgb[0] + row[1]! * rgb[1] + row[2]! * rgb[2]))) as Vec3;
}

// 線形sRGB → OKLab（Björn Ottossonの定義）。
function oklab([r, g, b]: Vec3): Vec3 {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

const THEME_CSS = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');

function pair(name: string): readonly [string, string] {
  const m = THEME_CSS.match(new RegExp(`--${name}:\\s*light-dark\\(\\s*(#[0-9a-fA-F]{6})\\s*,\\s*(#[0-9a-fA-F]{6})`))!;
  return [m[1]!, m[2]!];
}

/** sRGBの値のまま混ぜる（CSSの`color-mix(in srgb, …)`と同じ）。 */
function mixHex(color: string, surface: string): string {
  const a = Number.parseInt(color.slice(1), 16);
  const b = Number.parseInt(surface.slice(1), 16);
  const channel = (shift: number) => Math.round(((a >> shift) & 0xff) * MIX + ((b >> shift) & 0xff) * (1 - MIX));
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`;
}

const SLOW = pair('speed-slow');
const FAST = pair('speed-fast');
const SURFACE = pair('surface');
const MIN_DISTANCE = 0.1;

for (const [name, matrix] of Object.entries(SIMULATIONS)) {
  test(`遅い側と速い側の色: ${name}のシミュレーションでも、最も濃いマスどうしと面の色がOKLabの距離で${MIN_DISTANCE}以上離れている`, () => {
    for (const theme of [0, 1] as const) {
      const slow = oklab(simulate(linearRgb(mixHex(SLOW[theme], SURFACE[theme])), matrix));
      const fast = oklab(simulate(linearRgb(mixHex(FAST[theme], SURFACE[theme])), matrix));
      const surface = oklab(simulate(linearRgb(SURFACE[theme]), matrix));
      assert.ok(distance(slow, fast) >= MIN_DISTANCE, `${name} ${theme === 0 ? '明' : '暗'}: 遅い側と速い側の距離 ${distance(slow, fast).toFixed(3)}`);
      assert.ok(distance(slow, surface) >= MIN_DISTANCE / 2, `${name} ${theme === 0 ? '明' : '暗'}: 遅い側と面の距離 ${distance(slow, surface).toFixed(3)}`);
      assert.ok(distance(fast, surface) >= MIN_DISTANCE / 2, `${name} ${theme === 0 ? '明' : '暗'}: 速い側と面の距離 ${distance(fast, surface).toFixed(3)}`);
    }
  });
}
