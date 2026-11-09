import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FIGURE_INSET, INLINE_MIN_WIDTH } from '../figure-text.ts';
import { bandNoValueMessage } from './quantities.ts';
import type { BandChartExtracted, BandChartOkRow } from './extract.ts';
import {
  BAND_HEIGHT,
  bandChartModel,
  bandLayout,
  legendBandIndices,
  legendLayout,
  percentText,
  segmentGeometries,
  type BandRowContext,
} from './figure-model.ts';

function okRow(targetKey: string, counts: readonly number[], options: Partial<BandChartOkRow> = {}): BandChartOkRow {
  const typed = counts.reduce((sum, count) => sum + count, 0);
  return { kind: 'ok', targetKey, counts, shares: counts.map((count) => count / typed), total: typed, skippedChars: [], sameText: true, ...options };
}

const CONTEXT: ReadonlyMap<string, BandRowContext> = new Map(
  ['a', 'b', 'c', 'd'].map((key) => [`layout:${key}`, { targetKey: `layout:${key}`, label: key.toUpperCase(), fullName: `配列${key}` }] as const),
);

test('行の順は対象の順で、抽出の行の順には従わない', () => {
  const extracted: BandChartExtracted = {
    quantity: 'distance',
    rows: [okRow('layout:c', [1, 1, 1, 1]), okRow('layout:a', [4, 0, 0, 0]), okRow('layout:b', [0, 0, 0, 4])],
    referenceTargetKey: 'layout:a',
  };
  assert.deepEqual(
    bandChartModel(extracted, ['layout:b', 'layout:a', 'layout:c'], CONTEXT).rows.map((row) => row.label),
    ['B', 'A', 'C'],
  );
  assert.deepEqual(
    bandChartModel(extracted, ['layout:c', 'layout:b', 'layout:a'], CONTEXT).rows.map((row) => row.label),
    ['C', 'B', 'A'],
  );
});

test('値を出せない対象は、帯を描かず、計算中・失敗・値なしの行として対象の順に出る', () => {
  const extracted: BandChartExtracted = {
    quantity: 'distance',
    rows: [
      okRow('layout:a', [1, 1, 1, 1]),
      { kind: 'no-value', targetKey: 'layout:b', skippedChars: [{ char: '\n', count: 3 }] },
      { kind: 'failed', targetKey: 'layout:c', failureKind: 'reference', message: '配列が見つかりません' },
    ],
    referenceTargetKey: 'layout:a',
  };
  const model = bandChartModel(extracted, ['layout:d', 'layout:c', 'layout:b', 'layout:a'], CONTEXT);
  assert.deepEqual(
    model.excluded.map((row) => [row.label, row.status, row.message]),
    [
      ['D', 'computing', '計算中…'],
      ['C', 'failed', '配列が見つかりません'],
      ['B', 'no-value', bandNoValueMessage('distance')],
    ],
  );
  assert.deepEqual(
    model.rows.map((row) => row.label),
    ['A'],
  );
});

test('打てない文字は、ある配列だけ表の行になり、値なしの配列も文字を持つ', () => {
  const extracted: BandChartExtracted = {
    quantity: 'distance',
    rows: [
      okRow('layout:a', [1, 1, 1, 1]),
      okRow('layout:b', [1, 1, 1, 1], { skippedChars: [{ char: '☆', count: 2 }] }),
      { kind: 'no-value', targetKey: 'layout:c', skippedChars: [{ char: '\n', count: 5 }] },
    ],
    referenceTargetKey: 'layout:a',
  };
  const model = bandChartModel(extracted, ['layout:a', 'layout:b', 'layout:c'], CONTEXT);
  assert.deepEqual(
    model.skipped.map((row) => [row.label, row.chars]),
    [
      ['B', [{ char: '☆', count: 2 }]],
      ['C', [{ char: '\n', count: 5 }]],
    ],
  );
});

test('評価に渡すテキストが基準と違う配列だけを知らせる', () => {
  const extracted: BandChartExtracted = {
    quantity: 'distance',
    rows: [okRow('layout:a', [1, 1, 1, 1]), okRow('layout:b', [1, 1, 1, 1], { sameText: false })],
    referenceTargetKey: 'layout:a',
  };
  const model = bandChartModel(extracted, ['layout:a', 'layout:b'], CONTEXT);
  assert.deepEqual(
    model.differentText.map((row) => row.label),
    ['B'],
  );
  assert.equal(model.reference?.label, 'A');
});

test('割合の表記', () => {
  assert.equal(percentText(0.5512, 1), '55.1%');
  assert.equal(percentText(0.5512, 0), '55%');
  assert.equal(percentText(0, 0), '0%');
});

test('区分の幅は帯の幅を隙間なく覆い、割合が0の区分は含めない', () => {
  const segments = segmentGeometries([0.2, 0, 0.5, 0.3], 100, 400);
  assert.deepEqual(
    segments.map((segment) => segment.index),
    [0, 2, 3],
  );
  assert.equal(segments[0]!.x, 100);
  for (let i = 1; i < segments.length; i++) assert.ok(Math.abs(segments[i]!.x - (segments[i - 1]!.x + segments[i - 1]!.width)) < 1e-9);
  const last = segments[segments.length - 1]!;
  assert.ok(Math.abs(last.x + last.width - 500) < 1e-9);
});

test('狭い幅では名前を帯の上の行に置き、名前と帯が重ならない', () => {
  const layout = bandLayout(INLINE_MIN_WIDTH - 1, 3);
  assert.equal(layout.mode, 'stacked');
  assert.equal(layout.bandX, FIGURE_INSET);
  assert.equal(layout.bandX + layout.bandWidth, layout.width - FIGURE_INSET);
  for (const row of layout.rows) assert.ok(row.labelY + 9 <= row.bandY);
  for (let i = 1; i < layout.rows.length; i++) assert.ok(layout.rows[i]!.top >= layout.rows[i - 1]!.bandY + BAND_HEIGHT);
});

test('凡例は、表示している配列のどれにも数が0の区分を出さず、並びと区分の番号は変えない', () => {
  const extracted: BandChartExtracted = {
    quantity: 'distance',
    rows: [
      okRow('layout:a', [3, 0, 1, 0]),
      okRow('layout:b', [2, 0, 0, 0]),
      // 値を出せない行は判定に入れない
      { kind: 'no-value', targetKey: 'layout:c', skippedChars: [] },
    ],
    referenceTargetKey: 'layout:a',
  };
  const model = bandChartModel(extracted, ['layout:a', 'layout:b', 'layout:c'], CONTEXT);
  const indices = legendBandIndices(model.rows, 4);
  assert.deepEqual(indices, [0, 2]);
  const legend = legendLayout(600, ['一', '二', '三', '四'], indices);
  assert.deepEqual(
    legend.items.map((item) => [item.index, item.label]),
    [
      [0, '一'],
      [2, '三'],
    ],
  );
  // 1つの配列でも数が0でない区分は出る
  assert.deepEqual(legendBandIndices([model.rows[1]!], 4), [0]);
});
