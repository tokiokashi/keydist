import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID, LAYOUTS, LAYOUTS_JA } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import { sampleText } from '#input/text/samples.ts';
import type { Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { resolveEngineInput, type ResolvedInput } from '#engine/resolved-input.ts';
import { generateTrace } from '#trace/generate.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { computeLayerComboPressesExtraction } from './extract.ts';

/**
 * 押下数の表の材料を、実際のengine経路（解決 → Trace → Metrics）で検証する。物理配列はrow-staggered。
 * テキストは組み込みのサンプル（日本語は `legacy`、英文は `default`）。
 */

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

function tryResolve(layoutId: string, language: 'ja' | 'en', text: string) {
  const setup: Setup = { id: 'setup-layer-combo-presses', number: 1, layoutId, shapeId: 'row-staggered' };
  return resolveEngineInput({
    target: { kind: 'setup', setupId: setup.id },
    setups: new Map([[setup.id, setup]]),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text,
    language,
  });
}

function measureInput(input: ResolvedInput) {
  const trace = generateTrace(input.text, input.layout, input.geometry, input.tracePolicy);
  const metrics = computeMetrics(trace, input.geometry);
  return { metrics, extracted: computeLayerComboPressesExtraction({ trace, metrics }) };
}

test('帰属先ごとの押下数の和は、全配列・日本語と英文のどちらでも全押下数に一致する', () => {
  const ids = [...new Set([...LAYOUTS, ...LAYOUTS_JA].map((layout) => layout.id))];
  let measured = 0;
  for (const id of ids) {
    for (const language of ['ja', 'en'] as const) {
      const result = tryResolve(id, language, sampleText(language, language === 'ja' ? 'legacy' : 'default'));
      // その言語のテキストを打てない配列は、エンジンが対象から外す
      if (!result.ok) {
        assert.equal(result.error.kind, 'incompatible-text', `${id}/${language}`);
        continue;
      }
      const { extracted, metrics } = measureInput(result.input);
      const sum = extracted.rows.reduce((total, row) => total + row.presses, 0);
      assert.equal(sum, metrics.presses, `${id}/${language}`);
      assert.equal(extracted.presses, metrics.presses, `${id}/${language}`);
      assert.ok(metrics.presses > 0, `${id}/${language}`);
      measured++;
    }
  }
  assert.ok(measured >= ids.length, `測れた組が少ない: ${measured}`);
});

test('英文ではローマ字のコンボが外れ、コンボの行が無くなる', () => {
  const kinds = (language: 'ja' | 'en') => {
    const result = tryResolve('oonishi-custom', language, sampleText(language, language === 'ja' ? 'legacy' : 'default'));
    assert.ok(result.ok);
    if (!result.ok) throw new Error('unreachable');
    return measureInput(result.input).extracted.rows.map((row) => row.kind);
  };
  assert.deepEqual(kinds('ja'), ['layer', 'layer', 'combo']);
  assert.deepEqual(kinds('en'), ['layer', 'layer']);
});
