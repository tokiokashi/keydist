import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AnalyzerPlaybackRateChart,
} from '../src/analyzer-playback-surface.tsx';
import type { PlaybackRateChartPoint } from '../src/playback.ts';

function renderChart(
  points: readonly PlaybackRateChartPoint[],
  display: 'none' | 'chain' | 'arpeggio' | 'both' = 'both',
): string {
  return renderToStaticMarkup(createElement(AnalyzerPlaybackRateChart, {
    points,
    display,
    cursor: 0,
    onSeek: () => {},
  }));
}

test('速度グラフはカーソルごとのクリック領域と集計内容を持つ', () => {
  const svg = renderChart([
    { cursor: 0, inputText: '' },
    { cursor: 1, inputText: '<あ>', kanaPerSecond: 1.2, actionsPerSecond: 1 },
  ]);
  assert.match(svg, /data-playback-rate-cursor="1"/);
  assert.match(svg, /集計入力: &lt;code&gt;&amp;lt;あ&amp;gt;&lt;\/code&gt;/);
  assert.match(svg, /かな\/秒/);
  assert.match(svg, /アクション\/秒/);
});

test('Chain / Arpeggio の背景帯は表示選択だけで切り替わる', () => {
  const points: PlaybackRateChartPoint[] = [
    { cursor: 0, inputText: '' },
    { cursor: 1, inputText: 'あ', kanaPerSecond: 2, actionsPerSecond: 3, chain: true },
    { cursor: 2, inputText: 'い', kanaPerSecond: 2, actionsPerSecond: 3, arpeggio: true },
  ];

  const both = renderChart(points, 'both');
  assert.match(both, /fill="var\(--series-2\)" opacity="0\.1"/);
  assert.match(both, /fill="var\(--series-3\)" opacity="0\.1"/);

  const none = renderChart(points, 'none');
  assert.doesNotMatch(none, /opacity="0\.1"/);
});
