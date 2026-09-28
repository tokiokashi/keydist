import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { AnalysisTarget, Setup } from '#input/setup/index.ts';
import { sampleText } from '#input/text/samples.ts';
import { nSensitivity } from '#analyzers/n-sensitivity/sensitivity.ts';
import {
  N_SENSITIVITY_RANGE,
  nSensitivityDefinition,
  type NSensitivitySeries,
} from '#analyzers/n-sensitivity/extract.ts';
import { DEFAULT_N_SENSITIVITY_OPTIONS } from '#analyzers/n-sensitivity/options.ts';
import { EMPTY_SETTINGS_OVERRIDES, type SettingsCascadeOverrides } from './settings-items.ts';
import { resolveEngineInput, type ResolvedInput } from './resolved-input.ts';
import { createEngineCache } from './cache.ts';
import type { EngineSetMemberInput } from './request.ts';

/**
 * `cache.getSetExtraction`（`SetAnalyzerDefinition`の実際の配線）を通した、N感度の
 * 実engine経路のテスト（#544 Phase 3レビュー「手組みのrequesterではなく実engineで検証する」）。
 *
 * `extract.test.ts`（Analyzerユニット側）のテストは`AnalyzerSetMember.requestTrace`を
 * 手組みのスタブで渡していたため、`engine/cache.ts`の`getSetExtraction`が実際に
 * `createTraceRequesterFor`をどう組み立てているか（部分マージ・undefined値の扱い等）は
 * 検証していなかった。ここでは`cache.getSetExtraction`をそのまま呼び、その結果を
 * 旧`nSensitivity()`と突き合わせる。
 */

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

function resolve(
  layoutId: string,
  text: string,
  overrides: SettingsCascadeOverrides = EMPTY_SETTINGS_OVERRIDES,
  language: 'en' | 'ja' = 'en',
): ResolvedInput {
  const setup: Setup = { id: `setup-${layoutId}`, layoutId, shapeId: 'row-staggered', colorIndex: 0 };
  const result = resolveEngineInput({
    target: { kind: 'setup', setupId: setup.id },
    setups: new Map([[setup.id, setup]]),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides,
    text,
    language,
  });
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error));
  if (!result.ok) throw new Error('unreachable');
  return result.input;
}

function targetFor(layoutId: string): AnalysisTarget {
  return { kind: 'setup', setupId: `setup-${layoutId}` };
}

function memberInputFor(layoutId: string, input: ResolvedInput): EngineSetMemberInput {
  return { target: targetFor(layoutId), resolution: { ok: true, input } };
}

function assertSeriesMatchesLegacy(series: NSensitivitySeries | undefined, input: ResolvedInput): void {
  assert.ok(series, '対応する系列が見つからない');
  assert.equal(series!.kind, 'ok');
  if (series!.kind !== 'ok') return;

  const legacyPoints = nSensitivity(
    input.text,
    input.layout,
    input.geometry,
    input.tracePolicy,
    [...N_SENSITIVITY_RANGE],
    input.romajiRuleId,
    input.chainInterpretation,
    input.arpeggioInterpretation,
  );

  assert.equal(series!.points.length, legacyPoints.length);
  for (let i = 0; i < legacyPoints.length; i++) {
    assert.equal(
      series!.points[i]!.windowSize,
      legacyPoints[i]!.windowSize,
      `windowSize[${i}]`,
    );
    assert.equal(
      series!.points[i]!.totalUnits,
      legacyPoints[i]!.totalUnits,
      `totalUnits[${i}] (N=${legacyPoints[i]!.windowSize})`,
    );
  }
}

test('cache.getSetExtraction: 異なる配列の2メンバーそれぞれが、実engine経由で旧nSensitivityと全11N一致する', () => {
  const cache = createEngineCache();
  const inputA = resolve('qwerty', 'hello world');
  const inputB = resolve('colemak-dh', 'hello world');

  const result = cache.getSetExtraction(
    [memberInputFor('qwerty', inputA), memberInputFor('colemak-dh', inputB)],
    nSensitivityDefinition,
    DEFAULT_N_SENSITIVITY_OPTIONS,
  );

  assert.equal(result.extracted.series.length, 2);
  assertSeriesMatchesLegacy(result.extracted.series.find((s) => s.targetKey === 'setup:setup-qwerty'), inputA);
  assertSeriesMatchesLegacy(result.extracted.series.find((s) => s.targetKey === 'setup:setup-colemak-dh'), inputB);
});

test('cache.getSetExtraction: 長い日本語サンプル・windowSize=7（非既定）の実engine経路でも旧nSensitivityと全11N一致する', () => {
  const cache = createEngineCache();
  const text = sampleText('ja', 'legacy');
  assert.ok(text.length > 100, '「長い」ことの前提確認（前処理後の文字数）');

  const input = resolve('qwerty', text, { global: { windowSize: 7 } }, 'ja');
  assert.equal(input.tracePolicy.windowSize, 7);

  const result = cache.getSetExtraction(
    [memberInputFor('qwerty', input)],
    nSensitivityDefinition,
    DEFAULT_N_SENSITIVITY_OPTIONS,
  );

  assert.equal(result.extracted.series.length, 1);
  assertSeriesMatchesLegacy(result.extracted.series[0], input);
});

test('cache.getSetExtraction: 解決に失敗したメンバーは系列から落ちてfailuresに回る（実engine経路でも部分失敗を保つ）', () => {
  const cache = createEngineCache();
  const inputA = resolve('qwerty', 'hello world');

  const result = cache.getSetExtraction(
    [
      memberInputFor('qwerty', inputA),
      { target: targetFor('missing'), resolution: { ok: false, error: { kind: 'target-missing', target: targetFor('missing') } } },
    ],
    nSensitivityDefinition,
    DEFAULT_N_SENSITIVITY_OPTIONS,
  );

  assert.equal(result.extracted.series.length, 2);
  const ok = result.extracted.series.find((s) => s.targetKey === 'setup:setup-qwerty');
  const failed = result.extracted.series.find((s) => s.targetKey === 'setup:setup-missing');
  assert.equal(ok?.kind, 'ok');
  assert.equal(failed?.kind, 'failed');
});
