import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPlaybackRateChart } from '../src/playback-rate-chart.ts';

test('速度グラフはカーソルごとのクリック領域と集計内容を持つ', () => {
  const svg = renderPlaybackRateChart([
    { cursor: 0, inputText: '' },
    { cursor: 1, inputText: '<あ>', kanaPerSecond: 1.2, actionsPerSecond: 1 },
  ]);
  assert.match(svg, /data-playback-rate-cursor="1"/);
  assert.match(svg, /集計入力: <code>&lt;あ&gt;<\/code>/);
  assert.match(svg, /かな\/秒/);
  assert.match(svg, /アクション\/秒/);
});


test('Chain / Arpeggio の背景帯は表示選択だけで切り替わる', () => {
  const points = [
    { cursor: 0, inputText: '' },
    { cursor: 1, inputText: 'あ', kanaPerSecond: 2, actionsPerSecond: 3, chain: true },
    { cursor: 2, inputText: 'い', kanaPerSecond: 2, actionsPerSecond: 3, arpeggio: true },
  ];

  const both = renderPlaybackRateChart(points, 'both');
  assert.match(both, /fill="var\(--series-2\)" opacity="0\.10"/);
  assert.match(both, /fill="var\(--series-3\)" opacity="0\.10"/);

  const none = renderPlaybackRateChart(points, 'none');
  assert.doesNotMatch(none, /opacity="0\.10"/);
});
