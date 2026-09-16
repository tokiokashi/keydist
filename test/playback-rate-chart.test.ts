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
