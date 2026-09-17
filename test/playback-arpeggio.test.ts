import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ARPEGGIO_CONDITIONS,
  playbackArpeggioOrders,
  playbackArpeggioSpans,
} from '../src/playback-arpeggio.ts';
import {
  createPlaybackState,
  playbackArpeggioTimings,
  playbackStrokeDurationMs,
} from '../src/playback.ts';

function stroke(
  finger: string,
  id: string,
  x: number,
  row: number,
  options: { triggerKeys?: string[]; presses?: unknown[] } = {},
): any {
  return {
    triggerKeys: options.triggerKeys ?? [],
    presses: options.presses ?? [{
      finger,
      keys: [{ id, x, row }],
      sfb: false,
    }],
  };
}

test('アルペジオは指順と横方向が一致する2打を拾う', () => {
  const spans = playbackArpeggioSpans([
    stroke('LM', 'e', 2, 1),
    stroke('LI', 'r', 4, 1),
  ]);
  assert.deepEqual(spans, [{ start: 0, end: 2, hand: 'left' }]);
  assert.equal(playbackArpeggioOrders([
    stroke('LM', 'e', 2, 1),
    stroke('LI', 'r', 4, 1),
  ], 1).get('r'), 2);
});

test('横の開きが小さい遷移と指順に逆らう遷移は拾わない', () => {
  assert.deepEqual(playbackArpeggioSpans([
    stroke('LM', 'e', 2, 1),
    stroke('LI', 'r', 2.5, 1),
  ]), []);
  assert.deepEqual(playbackArpeggioSpans([
    stroke('LM', 'e', 4, 1),
    stroke('LI', 'r', 2, 1),
  ]), []);
});

test('折り返し振幅と行差の条件を2遷移へ適用する', () => {
  const middleTopMiddle = [
    stroke('LM', 'd', 2, 2),
    stroke('LI', 'r', 4, 1),
    stroke('LM', 'f', 2, 2),
  ];
  assert.equal(playbackArpeggioSpans(middleTopMiddle).length, 1);
  const bottomTopBottom = [
    stroke('LM', 'c', 2, 3),
    stroke('LI', 'r', 4, 1),
    stroke('LM', 'v', 2, 3),
  ];
  assert.equal(playbackArpeggioSpans(bottomTopBottom).length, 0);
  assert.equal(playbackArpeggioSpans([
    stroke('LM', 'd', 2, 2),
    stroke('LI', 'r', 4, 1),
  ], { ...DEFAULT_ARPEGGIO_CONDITIONS, maxRowStep: 0 }).length, 0);
});

test('親指だけのステップはチェーンを切り、同一ステップの出力親指だけ表示対象にする', () => {
  const withThumbOnlyStep = [
    stroke('LM', 'e', 2, 1),
    stroke('LT', 'thumb-l', 3.5, 4),
    stroke('LI', 'r', 4, 1),
  ];
  assert.equal(playbackArpeggioSpans(withThumbOnlyStep, {
    ...DEFAULT_ARPEGGIO_CONDITIONS,
    includeThumb: true,
  }).length, 0);
  const withMixedOutput = [
    stroke('LM', 'e', 2, 1),
    {
      ...stroke('LI', 'r', 4, 1),
      presses: [
        { finger: 'LI', keys: [{ id: 'r', x: 4, row: 1 }], sfb: false },
        { finger: 'LT', keys: [{ id: 'thumb-l', x: 3.5, row: 4 }], sfb: false },
      ],
    },
  ];
  assert.deepEqual(playbackArpeggioSpans(withMixedOutput, {
    ...DEFAULT_ARPEGGIO_CONDITIONS,
    includeThumb: true,
  }), [{ start: 0, end: 2, hand: 'left' }]);
  assert.equal(playbackArpeggioOrders(withMixedOutput, 1, {
    ...DEFAULT_ARPEGGIO_CONDITIONS,
    includeThumb: true,
  }).get('thumb-l'), 2);
  assert.equal(playbackArpeggioSpans([
    stroke('LT', 'thumb-l', 3.5, 4),
  ], { ...DEFAULT_ARPEGGIO_CONDITIONS, includeThumb: true }).length, 0);
});

test('層操作のtriggerKeysは出力キーとして数えない', () => {
  assert.deepEqual(playbackArpeggioSpans([
    stroke('LM', 'q', 1, 1, { triggerKeys: ['q'] }),
    stroke('LI', 'r', 4, 1),
  ]), []);
});

test('アルペジオ時間は通常時間を下回らず、前寄せ遅延を適用する', () => {
  const strokes = [
    stroke('LM', 'e', 2, 1),
    stroke('LI', 'r', 4, 1),
  ];
  const conditions = DEFAULT_ARPEGGIO_CONDITIONS;
  const timings = playbackArpeggioTimings(strokes, conditions, 1);
  assert.equal(timings.get(1)?.intervalMs, 0);
  assert.equal(timings.get(1)?.leadDelayMs, 0);
  assert.equal(playbackStrokeDurationMs(strokes[1], 1, false, undefined, strokes[0], 1, timings.get(1)), 1000);
  const distributed = playbackArpeggioTimings(strokes, conditions, 1, undefined, 'distributed');
  assert.equal(playbackStrokeDurationMs(strokes[1], 1, false, undefined, strokes[0], 1, distributed.get(1)), 1000);
  assert.equal(createPlaybackState(1, false, undefined, 1, conditions).arpeggio, conditions);
});
