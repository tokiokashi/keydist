import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BandChartExtracted, BandChartOkRow } from './extract.ts';
import {
  BAND_HEIGHT,
  bandChartModel,
  bandLabels,
  bandLayout,
  fitLabel,
  FIGURE_INSET,
  INLINE_MIN_WIDTH,
  legendLayout,
  NO_VALUE_MESSAGE,
  percentText,
  segmentGeometries,
  textWidth,
  type BandRowContext,
} from './figure-model.ts';
import { BAND_CHART_PANE_META } from './pane-meta.ts';

function okRow(targetKey: string, counts: readonly number[], options: Partial<BandChartOkRow> = {}): BandChartOkRow {
  const typed = counts.reduce((sum, count) => sum + count, 0);
  return { kind: 'ok', targetKey, counts, shares: counts.map((count) => count / typed), typed, skipped: 0, sameText: true, ...options };
}

const CONTEXT: ReadonlyMap<string, BandRowContext> = new Map(
  ['a', 'b', 'c', 'd'].map((key) => [`layout:${key}`, { targetKey: `layout:${key}`, label: key.toUpperCase(), fullName: `配列${key}` }] as const),
);

test('区分の名前は、境目で書く', () => {
  assert.deepEqual(bandLabels(), ['0.5u未満', '0.5〜1.5u', '1.5〜2.5u', '2.5u以上']);
});

test('行の順は対象の順で、抽出の行の順には従わない', () => {
  const extracted: BandChartExtracted = {
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
    rows: [
      okRow('layout:a', [1, 1, 1, 1]),
      { kind: 'no-value', targetKey: 'layout:b', skipped: 3 },
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
      ['B', 'no-value', NO_VALUE_MESSAGE],
    ],
  );
  assert.deepEqual(
    model.rows.map((row) => row.label),
    ['A'],
  );
});

test('打てない文字の数は1以上の配列だけ出て、値なしの配列も数を持つ', () => {
  const extracted: BandChartExtracted = {
    rows: [okRow('layout:a', [1, 1, 1, 1]), okRow('layout:b', [1, 1, 1, 1], { skipped: 2 }), { kind: 'no-value', targetKey: 'layout:c', skipped: 5 }],
    referenceTargetKey: 'layout:a',
  };
  const model = bandChartModel(extracted, ['layout:a', 'layout:b', 'layout:c'], CONTEXT);
  assert.deepEqual(
    model.skipped.map((row) => [row.label, row.skipped]),
    [
      ['B', 2],
      ['C', 5],
    ],
  );
});

test('評価に渡すテキストが基準と違う配列だけを知らせる', () => {
  const extracted: BandChartExtracted = {
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

test('割合の文字は、区分の幅が文字の入らない狭さの時は書かない', () => {
  const [narrow, wide] = segmentGeometries([0.01, 0.99], 0, 300);
  assert.equal(narrow!.showText, false);
  assert.equal(wide!.showText, true);
});

test('狭い幅では名前を帯の上の行に置き、名前と帯が重ならない', () => {
  const layout = bandLayout(INLINE_MIN_WIDTH - 1, 3);
  assert.equal(layout.mode, 'stacked');
  assert.equal(layout.bandX, FIGURE_INSET);
  assert.equal(layout.bandX + layout.bandWidth, layout.width - FIGURE_INSET);
  for (const row of layout.rows) assert.ok(row.labelY + 9 <= row.bandY);
  for (let i = 1; i < layout.rows.length; i++) assert.ok(layout.rows[i]!.top >= layout.rows[i - 1]!.bandY + BAND_HEIGHT);
});

test('広い幅では名前を帯の左に置き、名前の幅の右から帯が始まる', () => {
  const layout = bandLayout(900, 3);
  assert.equal(layout.mode, 'inline');
  assert.ok(layout.bandX >= FIGURE_INSET + layout.labelWidth);
  assert.equal(layout.bandX + layout.bandWidth, 900 - FIGURE_INSET);
  for (let i = 1; i < layout.rows.length; i++) assert.ok(layout.rows[i]!.bandY >= layout.rows[i - 1]!.bandY + BAND_HEIGHT);
  assert.ok(layout.rows[2]!.bandY + BAND_HEIGHT <= layout.height);
});

test('名前は、名前の幅に収まるように末尾を省く', () => {
  assert.equal(fitLabel('QWERTY', 200, 12), 'QWERTY');
  const fitted = fitLabel('とても長い配列の名前（訓令式・既定の指割り当て）', 100, 12);
  assert.ok(fitted.endsWith('…'));
  assert.ok(textWidth(fitted, 12) <= 100);
});

test('凡例は4つの区分を全部含み、幅が足りなければ折り返す', () => {
  const wide = legendLayout(600);
  assert.equal(wide.items.length, 4);
  assert.equal(new Set(wide.items.map((item) => item.y)).size, 1);
  const narrow = legendLayout(200);
  assert.equal(narrow.items.length, 4);
  assert.ok(new Set(narrow.items.map((item) => item.y)).size > 1);
  assert.ok(narrow.height > wide.height);
  for (const item of narrow.items) assert.ok(item.textX + textWidth(item.label, 12) <= 200 - FIGURE_INSET + 1e-9);
});

test('図の見方は、英語のテキストでは「かな」を使わず「字」と書く', () => {
  const ja = BAND_CHART_PANE_META.help('ja');
  const en = BAND_CHART_PANE_META.help('en');
  assert.ok(ja.notes[0]!.includes('1かなごとの移動距離の割合'));
  assert.ok(en.notes[0]!.includes('1字ごとの移動距離の割合'));
  assert.doesNotMatch([...en.notes, ...en.items.map((item) => item.description)].join(''), /かな(?!ど)/u);
  const text = ja.notes.join('');
  for (const edge of ['0.5u', '1.5u', '2.5u']) assert.ok(text.includes(edge));
  assert.ok(text.includes('打てない文字は数えません'));
});
