import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { HEAT_BLOB_LEVELS } from './heatmap-blob.ts';
import {
  HEAT_GROUND,
  HEAT_THEMES,
  contrastRatio,
  heatMultiBlobSample,
  heatMultiKeySample,
  heatMultiLabelSample,
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

/** 強度が増えるにつれて、ライトは暗く、ダークは明るくなる向き。 */
function isMonotone(theme: HeatTheme, luminances: readonly number[]): boolean {
  return luminances.every((value, index) => index === 0 || (theme === 'light' ? value < luminances[index - 1]! : value > luminances[index - 1]!));
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
  for (const theme of HEAT_THEMES) {
    test(`多色の${name}は、${theme === 'light' ? 'ライトで強度が増えるほど暗く' : 'ダークで強度が増えるほど明るく'}なる`, () => {
      assert.ok(
        isMonotone(
          theme,
          samples.map((sample) => relativeLuminance(sample[theme])),
        ),
      );
    });

    test(`多色の${name}の最小の色は、${theme} の地（--heat-0）より${theme === 'light' ? '暗い' : '明るい'}`, () => {
      const first = relativeLuminance(samples[0]![theme]);
      const ground = relativeLuminance(groundOf(theme));
      assert.ok(theme === 'light' ? first < ground : first > ground, `${first} と ${ground}`);
    });

    test(`多色の${name}の全点で、${theme} の色と文字色のコントラスト比が4.5以上`, () => {
      const labels = samples.map(heatMultiLabelSample);
      const ratios = samples.map((sample, index) => contrastRatio(sample[theme], labels[index]![theme]));
      assert.ok(Math.min(...ratios) >= 4.5, `最小 ${Math.min(...ratios)}`);
    });
  }
}

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
    const first = hue(heatMultiKeySample(0.001)[theme]);
    const last = hue(heatMultiKeySample(1)[theme]);
    const gap = Math.abs(first - last);
    assert.ok(Math.min(gap, 360 - gap) >= 90, `${theme}: ${first} と ${last}`);
  }
});
