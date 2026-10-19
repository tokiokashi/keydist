import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import { createEngineCache } from '#engine/cache.ts';
import { axisKindOf, axisValue, N_SENSITIVITY_METRIC_IDS } from './metric-catalog.ts';
import { N_SENSITIVITY_RANGE, valuesOf } from './extract.ts';
import { computeYRange, type YRangeMode } from './y-range.ts';

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

const TEXT = 'the quick brown fox jumps over the lazy dog and then keeps running through the quiet field';

/** 実際の系列を縦軸に載せて、全指標・全表示・全範囲の決め方で、全点が範囲に収まり目盛りが範囲の両端を含むことを確かめる。 */
test('一覧の全指標が、実測・相対の各表示と3つの範囲の決め方で、図の範囲に収まる', () => {
  for (const [layoutId, shapeId] of [
    ['qwerty', 'row-staggered'],
    ['dvorak', 'ortholinear'],
    ['colemak-dh', 'column-staggered'],
  ] as const) {
    const setup: Setup = { id: 'setup-a', number: 1, layoutId, shapeId };
    const resolved = resolveEngineInput({
      target: { kind: 'setup', setupId: 'setup-a' },
      setups: new Map([[setup.id, setup]]),
      catalog: CATALOG,
      userLayouts: new Map(),
      overrides: EMPTY_SETTINGS_OVERRIDES,
      text: TEXT,
      language: 'en',
    });
    assert.ok(resolved.ok);
    if (!resolved.ok) continue;
    const cache = createEngineCache();
    const homeSpacings = cache.getInterpretation(resolved.input).metrics.adjacentHomeSpacings;
    const points = N_SENSITIVITY_RANGE.map((windowSize) =>
      valuesOf(cache.getTrace({ ...resolved.input, tracePolicy: { ...resolved.input.tracePolicy, windowSize } }).trace, homeSpacings),
    );
    for (const metric of N_SENSITIVITY_METRIC_IDS) {
      for (const scale of ['relative', 'absolute'] as const) {
        const kind = axisKindOf(metric, scale);
        const base = points[0]![metric];
        const ys = points.flatMap((point) => {
          const y = axisValue(kind, base, point[metric]);
          return y === null ? [] : [y];
        });
        for (const mode of ['full', 'fit', 'coarse'] as YRangeMode[]) {
          const range = computeYRange(mode, kind, [Math.min(...ys), Math.max(...ys)]);
          const label = `${layoutId} ${shapeId} ${metric} ${scale} ${mode} ${JSON.stringify(range)}`;
          assert.ok(range.lo <= Math.min(...ys) && range.hi >= Math.max(...ys), label);
          // fullの目盛りは範囲を5等分した値なので、最後の目盛りに浮動小数の誤差が残りうる
          assert.ok(Math.abs(range.ticks.at(0)! - range.lo) < 1e-9, label);
          assert.ok(Math.abs(range.ticks.at(-1)! - range.hi) < 1e-9, label);
        }
      }
    }
  }
});
