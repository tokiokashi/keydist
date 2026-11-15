import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlaybackRateChartPoint } from '#interpretation/timing/playback.ts';
import { rateChartModel } from './rate-chart-model.ts';
import { rateChartTableModel } from './table-model.ts';

const POINTS: PlaybackRateChartPoint[] = [
  { cursor: 0, inputText: '' },
  { cursor: 1, inputText: 'あ', kanaPerSecond: 3, actionsPerSecond: 4.256, chain: true },
  { cursor: 2, inputText: 'あい', kanaPerSecond: 2.5, chain: true },
  { cursor: 3, inputText: 'いう', kanaPerSecond: 2, actionsPerSecond: 3, chain: true, arpeggio: true },
  { cursor: 4, inputText: 'うえ', kanaPerSecond: 1, actionsPerSecond: 2, arpeggio: true },
];

test('速度グラフの表: 区間の点が図と同じ範囲・同じ書式で並び、図に出している帯の列だけが付く', () => {
  const display = { chain: true, arpeggio: false };
  const span = { start: 1, end: 3 };
  const table = rateChartTableModel(POINTS, display, 'ja', span);
  assert.deepEqual(table.columns, ['集計入力', 'かな/秒', 'アクション/秒', 'Chain']);
  // 区間の左端（位置1）は手前の区間のステップなので、図の帯に入らず、表でも含まない
  assert.deepEqual(
    table.rows.map((row) => [row.header, ...row.cells]),
    [
      ['1', 'あ', '3.00', '4.26', '—'],
      ['2', 'あい', '2.50', '—', '含む'],
      ['3', 'いう', '2.00', '3.00', '含む'],
    ],
  );
  // 図の帯は位置1から3まで1本（ステップ2・3）で、表の「含む」と同じ点を指す
  const chart = rateChartModel(POINTS, display, undefined, span);
  assert.equal(chart?.bands.length, 1);
  assert.equal(chart?.bands[0]?.kind, 'chain');
});

test('速度グラフの表: 帯を出さない時は帯の列が無く、区間を渡さなければ全部の点が並ぶ', () => {
  const table = rateChartTableModel(POINTS, { chain: false, arpeggio: false }, 'ja');
  assert.equal(table.columns.length, 3);
  assert.equal(table.rows.length, 5);
});
