import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES } from './settings-items.ts';
import { resolveEngineInput } from './resolved-input.ts';
import { createEngineCache } from './cache.ts';
import { createTraceRequesterFor } from './trace-requester.ts';

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

function resolve(text: string) {
  const setup: Setup = { id: 'setup-1', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 };
  const result = resolveEngineInput({
    setup,
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text,
    language: 'en',
  });
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error));
  if (!result.ok) throw new Error('unreachable');
  return result.input;
}

test('createTraceRequesterFor: tracePolicyを差し替えたTraceを、EngineCache経由で共有する（N感度の例外向け）', () => {
  const cache = createEngineCache();
  const baseInput = resolve('hello world');
  const requester = createTraceRequesterFor({ getTrace: (input) => cache.getTrace(input) }, baseInput);

  const traceN3 = requester.requestTrace({
    text: baseInput.text,
    layout: baseInput.layout,
    geometry: baseInput.geometry,
    tracePolicy: { ...baseInput.tracePolicy, windowSize: 3 },
  });
  assert.ok(traceN3.strokes.length > 0);
  // 同じ中身のtracePolicyをcache.getTraceへ直接渡した場合と同じTraceオブジェクトを返す
  // （キャッシュを経由して共有している証拠）。
  const direct = cache.getTrace({ ...baseInput, tracePolicy: { ...baseInput.tracePolicy, windowSize: 3 } });
  assert.equal(traceN3, direct.trace);
  assert.equal(cache.size.trace, 1, 'baseInputのTraceは要求していないので1件のまま');

  const traceN5 = requester.requestTrace({
    text: baseInput.text,
    layout: baseInput.layout,
    geometry: baseInput.geometry,
    tracePolicy: { ...baseInput.tracePolicy, windowSize: 5 },
  });
  assert.notEqual(traceN5, traceN3, '異なるwindowSizeは別のTraceになる');
  assert.equal(cache.size.trace, 2);
});
