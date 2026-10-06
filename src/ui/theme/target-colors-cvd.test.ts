import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { TARGET_PALETTE_SIZE } from './target-colors.ts';

// 対象の色パレットを色覚多様性のシミュレーションに通して、先頭の数色が見分けられるかを検査する。
// 通常の色覚でのコントラスト・距離は target-colors.test.ts が見る。

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
  // 行列を掛けると色域をわずかに外れることがあるので、表示できる範囲へ収める。
  return matrix.map((row) => Math.min(1, Math.max(0, row[0]! * rgb[0] + row[1]! * rgb[1] + row[2]! * rgb[2]))) as Vec3;
}

// 線形sRGB → OKLab（Björn Ottosson の定義）。
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

const THEME_CSS = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
const PALETTES = [1, 2].map((group) => Array.from({ length: TARGET_PALETTE_SIZE }, (_, i) => {
  const m = THEME_CSS.match(new RegExp(`--target-color-${i}:\\s*light-dark\\(\\s*(#[0-9a-fA-F]{6})\\s*,\\s*(#[0-9a-fA-F]{6})`))!;
  return m[group]!;
}));

// 集合は先頭の数色しか使わないことが多い。12色すべてを見分けられる並びは作れない
// （1型・2型・3型では0.03を割る組が必ず残る）ので、先頭の範囲に限って保証する。
const LEADING = 5;
const MIN_DISTANCE = 0.1;

for (const [name, matrix] of Object.entries(SIMULATIONS)) {
  test(`パレット: ${name}のシミュレーションでも、先頭${LEADING}色はどの2色もOKLabの距離で${MIN_DISTANCE}以上離れている`, () => {
    for (const palette of PALETTES) {
      const seen = palette.slice(0, LEADING).map((hex) => ({ hex, lab: oklab(simulate(linearRgb(hex), matrix)) }));
      for (let i = 0; i < seen.length; i++) {
        for (let j = i + 1; j < seen.length; j++) {
          const [a, b] = [seen[i]!, seen[j]!];
          const d = Math.hypot(a.lab[0] - b.lab[0], a.lab[1] - b.lab[1], a.lab[2] - b.lab[2]);
          assert.ok(d >= MIN_DISTANCE, `${name}: ${a.hex} と ${b.hex} の距離 ${d.toFixed(3)}`);
        }
      }
    }
  });
}
