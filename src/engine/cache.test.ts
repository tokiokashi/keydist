import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride, type SettingsCascadeOverrides } from './settings-items.ts';
import { resolveEngineInput, type ResolvedInput } from './resolved-input.ts';
import { createEngineCache } from './cache.ts';

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

function resolve(
  setup: Setup,
  overrides: SettingsCascadeOverrides = EMPTY_SETTINGS_OVERRIDES,
  text = 'hello world',
): ResolvedInput {
  const result = resolveEngineInput({
    setup,
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

test('中身が同じSetup2つは計算を共有する（idが違っても同じTrace/解釈を再利用する）', () => {
  const cache = createEngineCache();
  const setupA: Setup = { id: 'setup-a', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 };
  const setupB: Setup = { id: 'setup-b', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 1 };

  const traceA = cache.getTrace(resolve(setupA));
  const traceB = cache.getTrace(resolve(setupB));
  assert.equal(traceA, traceB, 'idや色が違うだけの中身が同じSetupはTraceオブジェクトを共有する');
  assert.equal(cache.size.trace, 1);

  const interpretationA = cache.getInterpretation(resolve(setupA));
  const interpretationB = cache.getInterpretation(resolve(setupB));
  assert.equal(interpretationA, interpretationB);
  assert.equal(cache.size.interpretation, 1);
});

test('解釈だけが違えばTraceは再利用し、解釈だけ計算し直す', () => {
  const cache = createEngineCache();
  const setup: Setup = { id: 'setup-a', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 };

  const baseInput = resolve(setup);
  const baseTrace = cache.getTrace(baseInput);
  const baseInterpretation = cache.getInterpretation(baseInput);

  const write = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'chainInterpretation', {
    ...baseInput.chainInterpretation,
    breakOnSameFinger: !baseInput.chainInterpretation.breakOnSameFinger,
  });
  assert.ok(write.ok);
  if (!write.ok) return;
  const changedInput = resolve(setup, write.overrides);

  const changedTrace = cache.getTrace(changedInput);
  const changedInterpretation = cache.getInterpretation(changedInput);

  assert.equal(changedTrace, baseTrace, 'chain解釈の変更はTraceに影響しないので同じTraceを再利用する');
  assert.notEqual(changedInterpretation, baseInterpretation, '解釈の値が違うので解釈は計算し直す');
  assert.equal(cache.size.trace, 1);
  assert.equal(cache.size.interpretation, 2);
});

test('中身が違えば別のキャッシュエントリになる（テキストの違い）', () => {
  const cache = createEngineCache();
  const setup: Setup = { id: 'setup-a', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 };

  cache.getTrace(resolve(setup, EMPTY_SETTINGS_OVERRIDES, 'hello'));
  cache.getTrace(resolve(setup, EMPTY_SETTINGS_OVERRIDES, 'world'));
  assert.equal(cache.size.trace, 2);
});

test('上限を超えると最も長く参照していないTraceを1件だけ捨てる（LRU）', () => {
  const cache = createEngineCache({ maxTraceEntries: 2 });
  const setup: Setup = { id: 'setup-a', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 };

  const first = cache.getTrace(resolve(setup, EMPTY_SETTINGS_OVERRIDES, 'text-1'));
  cache.getTrace(resolve(setup, EMPTY_SETTINGS_OVERRIDES, 'text-2'));
  // firstに触れて「最近使った」扱いにする。
  cache.getTrace(resolve(setup, EMPTY_SETTINGS_OVERRIDES, 'text-1'));
  cache.getTrace(resolve(setup, EMPTY_SETTINGS_OVERRIDES, 'text-3'));

  assert.equal(cache.size.trace, 2);
  const firstAgain = cache.getTrace(resolve(setup, EMPTY_SETTINGS_OVERRIDES, 'text-1'));
  assert.equal(firstAgain, first, 'text-1は直前に触れていたので追い出されていない');
});

test('clear()は永続化していないメモリキャッシュを空にする', () => {
  const cache = createEngineCache();
  const setup: Setup = { id: 'setup-a', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 };
  cache.getInterpretation(resolve(setup));
  assert.ok(cache.size.trace > 0);
  cache.clear();
  assert.deepEqual(cache.size, { trace: 0, interpretation: 0 });
});
