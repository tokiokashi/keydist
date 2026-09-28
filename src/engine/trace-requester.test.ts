import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES } from './settings-items.ts';
import { resolveEngineInput, type ResolvedInput } from './resolved-input.ts';
import { createEngineCache } from './cache.ts';
import { createTraceRequesterFor } from './trace-requester.ts';

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

function resolve(text: string, overrides = EMPTY_SETTINGS_OVERRIDES): ResolvedInput {
  const setup: Setup = { id: 'setup-1', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 };
  const result = resolveEngineInput({
    target: { kind: 'setup', setupId: setup.id },
    setups: new Map([[setup.id, setup]]),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides,
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

test('createTraceRequesterFor: 部分形（{tracePolicy:{windowSize}}のみ）でwindowSize以外のtracePolicyフィールド（sfbHomeCost等）が保たれる', () => {
  const cache = createEngineCache();
  // sfbHomeCost=false・windowSize=5を既定と違う値にして、部分マージがこれを
  // 巻き戻さないことを確認する（レビュー指摘: N感度の実際の呼び出し形そのもの）。
  const baseInput = resolve('hello world', { global: { sfbHomeCost: false, windowSize: 5 } });
  assert.equal(baseInput.tracePolicy.sfbHomeCost, false);
  assert.equal(baseInput.tracePolicy.windowSize, 5);

  const requester = createTraceRequesterFor({ getTrace: (input) => cache.getTrace(input) }, baseInput);
  const partial = requester.requestTrace({ tracePolicy: { windowSize: 7 } });

  const fullyReconstructed = cache.getTrace({
    ...baseInput,
    tracePolicy: { ...baseInput.tracePolicy, windowSize: 7 },
  });
  assert.equal(partial, fullyReconstructed.trace, '部分形と、sfbHomeCost等を手で複製した完全形は同じTraceになる（同じキャッシュキー）');

  // sfbHomeCost=trueで生成したTrace（同じwindowSize=7）とは異なることも確認し、
  // 「sfbHomeCostが実際に効いている」ことを担保する（キーが偶然一致しているだけではない）。
  const withSfbHomeCostTrue = cache.getTrace({
    ...baseInput,
    tracePolicy: { ...baseInput.tracePolicy, windowSize: 7, sfbHomeCost: true },
  });
  assert.notEqual(partial, withSfbHomeCostTrue.trace);
});

test('createTraceRequesterFor: N=baseInput自身のwindowSizeを要求すると、同一のTraceオブジェクトが返る', () => {
  const cache = createEngineCache();
  const baseInput = resolve('hello world', { global: { windowSize: 4 } });
  const baseTrace = cache.getTrace(baseInput).trace;

  const requester = createTraceRequesterFor({ getTrace: (input) => cache.getTrace(input) }, baseInput);
  const requested = requester.requestTrace({ tracePolicy: { windowSize: 4 } });

  assert.equal(requested, baseTrace, 'baseInput自身のNを部分形で要求すると、既存のキャッシュエントリと同じTraceオブジェクトを再利用する');
  assert.equal(cache.size.trace, 1, '新しいキャッシュエントリは作られない');
});

test('createTraceRequesterFor: フィールドがundefined値で渡ってもクラッシュせず「省略」として扱う（exactOptionalPropertyTypes無し対策）', () => {
  const cache = createEngineCache();
  const baseInput = resolve('hello world');
  const requester = createTraceRequesterFor({ getTrace: (input) => cache.getTrace(input) }, baseInput);

  // トップレベルのundefined値（layout: undefined等）はクラッシュせず、baseInputの値を使う。
  assert.doesNotThrow(() => {
    requester.requestTrace({ layout: undefined, geometry: undefined, text: undefined });
  });
  const withUndefinedTopLevel = requester.requestTrace({ layout: undefined });
  const withoutThatKey = requester.requestTrace({});
  assert.equal(withUndefinedTopLevel, withoutThatKey, 'layout:undefinedは省略と同じ結果になる');
});

test('createTraceRequesterFor: tracePolicy内のundefined値も「省略」扱いになり、省略時と同じキャッシュキーになる', () => {
  const cache = createEngineCache();
  const baseInput = resolve('hello world', { global: { windowSize: 5 } });
  const requester = createTraceRequesterFor({ getTrace: (input) => cache.getTrace(input) }, baseInput);

  const withUndefinedWindowSize = requester.requestTrace({ tracePolicy: { windowSize: undefined } });
  const withoutWindowSizeKey = requester.requestTrace({ tracePolicy: {} });
  const omittedEntirely = requester.requestTrace({});

  assert.equal(withUndefinedWindowSize, withoutWindowSizeKey, '{windowSize: undefined}は{}と同じTraceを返す');
  assert.equal(withUndefinedWindowSize, omittedEntirely, 'tracePolicy自体を省略した場合とも同じTraceを返す');
  assert.equal(cache.size.trace, 1, '3通りとも同じキャッシュキーに当たり、新しいエントリは増えない');
});
