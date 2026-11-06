import assert from 'node:assert/strict';
import test from 'node:test';
import { createEngineCache } from '#engine/cache.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { noRemember } from '#analyzers/contract.ts';
import { findOptionsKeyDisciplineViolations, findViewOptionsExtractionViolations } from '#analyzers/options.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { AnalysisTarget, Setup } from '#input/setup/index.ts';
import { computeComparisonRowValues } from '../comparison-column-values.ts';
import { computeScatterExtraction } from './extract.ts';
import { ALTERNATE_SCATTER_OPTIONS, DEFAULT_SCATTER_OPTIONS, scatterOptions } from './options.ts';

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

test('computeScatterExtraction: 解決できたメンバーは比較表の列の値と入力文字数を持つok行、失敗はfailed行になる（行を消さない）', () => {
  const setup: Setup = { id: 'setup-a', number: 1, layoutId: 'qwerty', shapeId: 'row-staggered' };
  const resolution = resolveEngineInput({
    target: { kind: 'setup', setupId: setup.id },
    setups: new Map([[setup.id, setup]]),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: 'hello world',
    language: 'en',
  });
  assert.ok(resolution.ok);
  if (!resolution.ok) return;

  const cache = createEngineCache();
  const { trace } = cache.getTrace(resolution.input);
  const { analysis, metrics } = cache.getInterpretation(resolution.input);
  const targetA: AnalysisTarget = { kind: 'setup', setupId: 'setup-a' };
  const extracted = computeScatterExtraction(
    [
      {
        target: targetA,
        trace,
        analysis,
        metrics,
        requestTrace: {
          requestTrace: () => {
            throw new Error('unused');
          },
        },
        remember: noRemember,
      },
    ],
    [{ target: { kind: 'setup', setupId: 'setup-deleted' }, kind: 'reference', message: '配列が見つかりません（削除された可能性があります）' }],
  );

  assert.equal(extracted.rows.length, 2);
  const okRow = extracted.rows.find((row) => row.targetKey === 'setup:setup-a');
  const failedRow = extracted.rows.find((row) => row.targetKey === 'setup:setup-deleted');
  assert.equal(okRow?.kind, 'ok');
  if (okRow?.kind === 'ok') {
    assert.deepEqual(okRow.values, computeComparisonRowValues(metrics, trace));
    assert.equal(okRow.inputChars, 'hello world'.length);
  }
  assert.equal(failedRow?.kind, 'failed');
  if (failedRow?.kind === 'failed') {
    assert.equal(failedRow.failureKind, 'reference');
    assert.match(failedRow.message, /削除/);
  }
});

test('optionsDiscipline: affectsの宣言どおりの入れ忘れが無い（散布図は全項目がview）', () => {
  assert.deepEqual(findOptionsKeyDisciplineViolations(scatterOptions, DEFAULT_SCATTER_OPTIONS, ALTERNATE_SCATTER_OPTIONS), []);
  assert.deepEqual(
    findViewOptionsExtractionViolations(scatterOptions, DEFAULT_SCATTER_OPTIONS, ALTERNATE_SCATTER_OPTIONS, () => 'dummy'),
    [],
  );
});

test('解析設定: 既定は1文字の動作数と1打鍵の距離の組み合わせ1つで、保存した値を読み書きできる', () => {
  assert.deepEqual(DEFAULT_SCATTER_OPTIONS.presets, ['distance']);
  const decoded = scatterOptions.decodeOptions(
    { presets: ['hand', 'free'], xAxis: 'totalUnits', yAxis: 'sameFinger', tickScale: 'log', columns: '2' },
    [],
  ) as typeof DEFAULT_SCATTER_OPTIONS;
  assert.deepEqual(decoded, ALTERNATE_SCATTER_OPTIONS);
  const diagnostics: Array<{ path: string; message: string }> = [];
  const broken = scatterOptions.decodeOptions({ presets: 'nothing', xAxis: 'nothing' }, diagnostics) as typeof DEFAULT_SCATTER_OPTIONS;
  assert.deepEqual(broken, DEFAULT_SCATTER_OPTIONS);
  assert.ok(diagnostics.length >= 2);
});
