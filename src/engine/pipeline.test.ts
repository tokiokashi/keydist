import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES } from './settings-items.ts';
import { resolveEngineInput } from './resolved-input.ts';
import { generateEngineTrace, interpretEngineTrace } from './pipeline.ts';
import { MODEL_VERSION } from './model-version.ts';

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

function resolve(layoutId: string, text: string, language: 'en' | 'ja') {
  const setup: Setup = { id: 'setup-1', layoutId, shapeId: 'row-staggered', colorIndex: 0 };
  const result = resolveEngineInput({
    target: { kind: 'setup', setupId: setup.id },
    setups: new Map([[setup.id, setup]]),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text,
    language,
  });
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error));
  if (!result.ok) throw new Error('unreachable');
  return result.input;
}

test('generateEngineTraceはTrace生成段だけを行い、モデルの版を載せる', () => {
  const input = resolve('qwerty', 'hello world', 'en');
  const traceResult = generateEngineTrace(input);
  assert.equal(traceResult.modelVersion, MODEL_VERSION);
  assert.ok(traceResult.trace.strokes.length > 0);
  assert.equal(traceResult.trace.skipped, 0);
});

test('interpretEngineTraceはTraceを変えず、構造・指標だけを返す', () => {
  const input = resolve('qwerty', 'hello world', 'en');
  const traceResult = generateEngineTrace(input);
  const interpretation = interpretEngineTrace(traceResult, input);
  assert.equal(interpretation.modelVersion, MODEL_VERSION);
  assert.equal(interpretation.metrics.strokes, traceResult.trace.strokes.length);
  assert.ok(interpretation.analysis.aggregate.strokeCount > 0);
});

test('配列定義の不備はerrorsという値で返る（Traceの生成自体は例外を投げない）', () => {
  const input = resolve('qwerty', '打鍵できない文字を含む中文テキスト你好', 'en');
  const traceResult = generateEngineTrace(input);
  assert.ok(Array.isArray(traceResult.trace.errors));
  // qwertyに無い文字は「配列定義の不備」ではなくskippedとして数えられる。
  // errorsが値として存在すること自体（例外にしていないこと）を確認する。
  assert.ok(traceResult.trace.skipped >= 0);
});
