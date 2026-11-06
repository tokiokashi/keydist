import assert from 'node:assert/strict';
import test from 'node:test';
import { createEngineCache } from '#engine/cache.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { LAYOUT_BY_ID, LAYOUTS_JA } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import { computeComparisonRowValues } from '../comparison-column-values.ts';
import { fixedTestText } from '../../../test/kana-test-text.ts';
import { SCATTER_PRESET_AXES, scatterContour, type ScatterAxes } from './axes.ts';
import { estimateTextWidth, logAxis, logScaleBlockers, scatterPlotModel } from './plot-model.ts';

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

const TEXT = fixedTestText('ja');

/** 組み込みの日本語の配列を全部、既定の物理配列で評価した比較表の列の値。 */
function builtinRows() {
  const cache = createEngineCache();
  const rows = [];
  for (const layout of LAYOUTS_JA) {
    const resolution = resolveEngineInput({
      target: { kind: 'layout', layoutId: layout.id },
      setups: new Map(),
      catalog: CATALOG,
      userLayouts: new Map(),
      overrides: EMPTY_SETTINGS_OVERRIDES,
      text: TEXT,
      language: 'ja',
    });
    if (!resolution.ok) continue;
    const { trace } = cache.getTrace(resolution.input);
    const { metrics } = cache.getInterpretation(resolution.input);
    rows.push(computeComparisonRowValues(metrics, trace));
  }
  return rows;
}

const ROWS = builtinRows();

/** 細い線を引き、対数にできる組み合わせ（用意した組み合わせのうち）。 */
const LOG_PRESETS = (Object.entries(SCATTER_PRESET_AXES) as Array<[string, ScatterAxes]>).filter(([, axes]) => {
  const contour = scatterContour(axes.x, axes.y, TEXT.length, 'ja');
  if (contour === undefined || !contour.drawsLines) return false;
  const blockers = logScaleBlockers(contour, pointsOf(axes));
  return !blockers.noStraightLines && !blockers.nonPositive;
});

function pointsOf(axes: ScatterAxes) {
  return ROWS.map((row) => ({ x: row[axes.x], y: row[axes.y] })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

test('組み込みの配列を全部選んだ時、対数にできる全ての組み合わせで、軸の両端は目盛りで、どの点も余白を残して内側にあり、数字は重ならない', () => {
  assert.ok(ROWS.length > 20);
  assert.ok(LOG_PRESETS.length >= 3);
  for (const [preset, axes] of LOG_PRESETS) {
    const points = pointsOf(axes);
    for (const [name, values, target, horizontal] of [
      ['横軸', points.map((p) => p.x), 6, true],
      ['縦軸', points.map((p) => p.y), 5, false],
    ] as const) {
      const axis = logAxis(values, target, horizontal);
      const min = Math.log10(Math.min(...values));
      const max = Math.log10(Math.max(...values));
      const margin = max > min ? (max - min) * 0.1 : Math.log10(1.1);
      const where = `${preset}の${name}`;
      assert.equal(axis.range.lo, axis.values[0], where);
      assert.equal(axis.range.hi, axis.values.at(-1), where);
      assert.ok(Math.log10(axis.range.lo) <= min - margin + 1e-9, `${where}: 下の余白`);
      assert.ok(Math.log10(axis.range.hi) >= max + margin - 1e-9, `${where}: 上の余白`);
      assert.equal(new Set(axis.texts).size, axis.texts.length, `${where}: 同じ数字が並ぶ`);
    }
  }
});

test('組み込みの配列を全部選んだ時、対数にできる全ての組み合わせで、隣り合う目盛りの数字が重ならない', () => {
  for (const [preset, axes] of LOG_PRESETS) {
    const points = pointsOf(axes);
    const model = scatterPlotModel({
      points: points.map((p, i) => ({ targetKey: String(i), label: String(i), x: p.x, y: p.y })),
      contour: undefined,
      legendRows: [],
      contourName: '',
      contourSuffix: '',
      logScale: true,
    });
    for (const [name, ticks, needed] of [
      ['横軸', model.xTicks, (a: string, b: string) => (estimateTextWidth(a) + estimateTextWidth(b)) / 2],
      ['縦軸', model.yTicks, () => 11],
    ] as const) {
      for (let i = 1; i < ticks.length; i++) {
        const distance = Math.abs(ticks[i]!.position - ticks[i - 1]!.position);
        assert.ok(distance >= needed(ticks[i]!.text, ticks[i - 1]!.text), `${preset}の${name}: ${ticks[i - 1]!.text}と${ticks[i]!.text}`);
      }
    }
  }
});
