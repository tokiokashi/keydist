import assert from 'node:assert/strict';
import test from 'node:test';
import {
  playbackRateBandVisibility,
  playbackRateTooltip,
} from '#legacy/analyzer-playback-rate-chart-model.ts';

test('速度グラフtooltipはカーソル・集計入力・速度を表示する', () => {
  const tooltip = playbackRateTooltip({
    cursor: 1,
    inputText: '<あ>',
    kanaPerSecond: 1.2,
    actionsPerSecond: 1,
  });

  assert.match(tooltip, /ステップ 1/);
  assert.match(tooltip, /集計入力: <code>&lt;あ&gt;<\/code>/);
  assert.match(tooltip, /かな\/秒<\/span> <b>1\.20<\/b>/);
  assert.match(tooltip, /アクション\/秒<\/span> <b>1\.00<\/b>/);
});

test('Chain / Arpeggio の背景帯は表示選択だけで切り替わる', () => {
  const chain = { cursor: 1, inputText: 'あ', chain: true };
  const arpeggio = { cursor: 2, inputText: 'い', arpeggio: true };

  assert.deepEqual(playbackRateBandVisibility('both', chain), {
    chain: true,
    arpeggio: false,
  });
  assert.deepEqual(playbackRateBandVisibility('both', arpeggio), {
    chain: false,
    arpeggio: true,
  });
  assert.deepEqual(playbackRateBandVisibility('none', chain), {
    chain: false,
    arpeggio: false,
  });
  assert.deepEqual(playbackRateBandVisibility('arpeggio', chain), {
    chain: false,
    arpeggio: false,
  });
});
