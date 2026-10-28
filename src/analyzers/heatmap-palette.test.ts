import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { HEAT_BLOB_LEVELS, heatBlobBlurParts, type HeatBlobSource } from './heatmap-blob.ts';
import {
  HEAT_GROUND,
  HEAT_STOPS,
  HEAT_THEMES,
  contrastRatio,
  heatMultiBlobMixSample,
  heatMultiBlobSample,
  heatMultiKeySample,
  heatMultiLabelSample,
  heatMultiRgb,
  relativeLuminance,
  type HeatRgb,
  type HeatSample,
  type HeatTheme,
} from './heatmap-palette.ts';

// 強度0〜1を細かく刻んだ点。キーの塗りは描画と同じ関数（heatMultiKeySample）で色を求める。
const KEY_STEPS = 1000;
const keyPoints = Array.from({ length: KEY_STEPS }, (_, index) => (index + 1) / KEY_STEPS);
const blobLevels = Array.from({ length: HEAT_BLOB_LEVELS }, (_, index) => index + 1);

const THEME_CSS = readFileSync(new URL('../ui/theme/theme.css', import.meta.url), 'utf8');

function groundOf(theme: HeatTheme): HeatRgb {
  const match = THEME_CSS.match(/^\s*--heat-0:\s*light-dark\(\s*(#[0-9a-fA-F]{6})\s*,\s*(#[0-9a-fA-F]{6})\s*\);/m);
  assert.ok(match, 'theme.cssの--heat-0をlight-dark(#rrggbb, #rrggbb)の形で読めない');
  const hex = theme === 'light' ? match[1]! : match[2]!;
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

const SERIES: readonly { readonly name: string; readonly samples: readonly HeatSample[] }[] = [
  { name: 'キーの塗り', samples: keyPoints.map(heatMultiKeySample) },
  { name: 'サーモグラフィ', samples: blobLevels.map(heatMultiBlobSample) },
];

test('地の色はtheme.cssの--heat-0と同じ', () => {
  for (const theme of HEAT_THEMES) {
    const n = Number.parseInt(HEAT_GROUND[theme].slice(1), 16);
    assert.deepEqual(groundOf(theme), [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);
  }
});

for (const { name, samples } of SERIES) {
  test(`多色の${name}の最小の色は、darkの地（--heat-0）より明るい`, () => {
    const first = relativeLuminance(samples[0]!.dark);
    const ground = relativeLuminance(groundOf('dark'));
    assert.ok(first > ground, `${first} と ${ground}`);
  });

  for (const theme of HEAT_THEMES) {
    test(`多色の${name}の全点で、${theme} の色と文字色のコントラスト比が4.5以上`, () => {
      const labels = samples.map(heatMultiLabelSample);
      const ratios = samples.map((sample, index) => contrastRatio(sample[theme], labels[index]![theme]));
      assert.ok(Math.min(...ratios) >= 4.5, `最小 ${Math.min(...ratios)}`);
    });
  }
}

test('ライトの多色の色と位置は、heatmap.js 1.0の既定の配色と一致する', () => {
  // 出典（既定の配色）: https://patorjk.com/common/vendor/heatmap/heatmap.js
  const expected: readonly (readonly [number, HeatRgb])[] = [
    [0.45, [0, 0, 255]],
    [0.55, [0, 255, 255]],
    [0.65, [0, 255, 0]],
    [0.95, [255, 255, 0]],
    [1, [255, 0, 0]],
  ];
  const [ground, ...colored] = HEAT_STOPS.light;
  assert.deepEqual(ground, [0, HEAT_GROUND.light]);
  assert.deepEqual(
    colored.map(([position]) => position),
    expected.map(([position]) => position),
  );
  for (const [position, rgb] of expected) {
    assert.deepEqual(heatMultiRgb('light', position), rgb, `強度 ${position}`);
  }
});

test('ダークの多色の高い端は、ライトと同じ赤で、赤へ向かう領域は上位5%', () => {
  assert.deepEqual(heatMultiRgb('dark', 1), heatMultiRgb('light', 1));
  assert.deepEqual(heatMultiRgb('dark', 1), [255, 0, 0]);
  assert.deepEqual(
    HEAT_STOPS.dark.slice(-2).map(([position]) => position),
    [0.95, 1],
  );
  assert.deepEqual(heatMultiRgb('dark', 0.95), [255, 246, 176]);
});

test('ライトの多色は、0.45より低い所で地の色から青へつながる', () => {
  const ground = groundOf('light');
  assert.deepEqual(heatMultiRgb('light', 0), ground);
  const blue = relativeLuminance([0, 0, 255]);
  const lows = [0.05, 0.15, 0.25, 0.35, 0.45].map((t) => relativeLuminance(heatMultiRgb('light', t)));
  // 地から青へ、輝度が一方向に下がる
  assert.ok(lows.every((value, index) => index === 0 || value < lows[index - 1]!));
  assert.ok(lows[0]! < relativeLuminance(ground) && lows[4]! === blue);
});

test('色相が大きく変わる。最初と最後の色は、ライト・ダークとも色相が90度以上離れる', () => {
  const hue = ([r, g, b]: HeatRgb): number => {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    if (delta === 0) return 0;
    const raw = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    return (raw * 60 + 360) % 360;
  };
  for (const theme of HEAT_THEMES) {
    // ライトの並びは地の色から始まるので、地ではない最初の色で比べる
    const firstColored = HEAT_STOPS[theme].find(([, hex]) => hex !== HEAT_GROUND[theme])!;
    const first = hue(heatMultiRgb(theme, firstColored[0]));
    const last = hue(heatMultiRgb(theme, 1));
    const gap = Math.abs(first - last);
    assert.ok(Math.min(gap, 360 - gap) >= 90, `${theme}: ${first} と ${last}`);
  }
});

test('ぼかした後の表示色は、段の色を重みで平均した色。1つの段だけなら、その段の色と同じ', () => {
  for (const level of [1, HEAT_BLOB_LEVELS / 2, HEAT_BLOB_LEVELS]) {
    assert.deepEqual(heatMultiBlobMixSample([{ level, weight: 1 }]), heatMultiBlobSample(level));
  }
  const mixed = heatMultiBlobMixSample([
    { level: 0, weight: 0.5 },
    { level: HEAT_BLOB_LEVELS, weight: 0.5 },
  ]);
  const ground = HEAT_GROUND.light;
  const red = heatMultiBlobSample(HEAT_BLOB_LEVELS).light;
  const n = Number.parseInt(ground.slice(1), 16);
  assert.deepEqual(mixed.light, [
    Math.round((((n >> 16) & 0xff) + red[0]) * 50) / 100,
    Math.round((((n >> 8) & 0xff) + red[1]) * 50) / 100,
    Math.round(((n & 0xff) + red[2]) * 50) / 100,
  ]);
});

test('ダークの低い段の溶かし方は、段数によらず強度に対して同じ（強度1/4で地から色に変わりきる）', () => {
  const ground = groundOf('dark');
  const full = heatMultiKeySample(0.25).dark;
  const half = heatMultiBlobSample(HEAT_BLOB_LEVELS / 8).dark;
  const quarter = heatMultiBlobSample(HEAT_BLOB_LEVELS / 4).dark;
  const halfKey = heatMultiKeySample(0.125).dark;
  for (const n of [0, 1, 2] as const) {
    assert.ok(Math.abs(quarter[n] - full[n]) < 0.01);
    assert.ok(Math.abs(half[n] - (ground[n] + halfKey[n]) / 2) < 0.01, `成分${n}`);
  }
});

test('サーモグラフィの文字色は、ぼかした後の表示色の上で、どの点でもコントラスト比が4.5以上', () => {
  const KEY = 30;
  // 押下の偏った配列を想像した、強さの違う塊をまばらに・密に並べた図
  const sources: HeatBlobSource[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 10; col++) {
      const intensity = ((col * 7 + row * 13) % 11) / 10;
      sources.push({ x: col * KEY + 15, y: row * KEY + 15, intensity });
    }
  }
  let checked = 0;
  for (let x = 0; x <= 10 * KEY; x += 3) {
    for (let y = 0; y <= 3 * KEY; y += 3) {
      const parts = heatBlobBlurParts(sources, x, y, KEY);
      if (!parts.some((part) => part.level > 0)) continue;
      const shown = heatMultiBlobMixSample(parts);
      const label = heatMultiLabelSample(shown);
      for (const theme of HEAT_THEMES) {
        const ratio = contrastRatio(shown[theme], label[theme]);
        assert.ok(ratio >= 4.5, `${theme} (${x}, ${y}): ${ratio}`);
      }
      checked++;
    }
  }
  assert.ok(checked > 500);
});
