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

test('同じキーを区間内で何度も踏む時、通り過ぎた番号ではなく次の番号を出す', () => {
  const zigzag = [
    stroke('LM', 'e', 2, 1),
    stroke('LI', 'r', 4, 1),
    stroke('LM', 'e', 2, 1),
  ];
  assert.equal(playbackArpeggioSpans(zigzag).length, 1);
  // カーソル1（1打目のみ完了）: 'e'はまだ1番目が未通過なので1を出す
  assert.equal(playbackArpeggioOrders(zigzag, 1).get('e'), 1);
  // カーソル2（2打目まで完了）: 1番目は通り過ぎたので次の3番目を出す
  assert.equal(playbackArpeggioOrders(zigzag, 2).get('e'), 3);
  // カーソル3（全打完了）: 全部通り過ぎているので最後の番号を残す
  assert.equal(playbackArpeggioOrders(zigzag, 3).get('e'), 3);
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

test('アルペジオ判定済みのエッジだけ方向別速度を使い、前寄せ遅延を適用する', () => {
  const strokes = [
    stroke('LM', 'e', 2, 1),
    stroke('LI', 'r', 4, 1),
  ];
  const conditions = DEFAULT_ARPEGGIO_CONDITIONS;
  const calibration = {
    actionsPerSecond: 5,
    sameHandDifferentFingerActionsPerSecond: 2,
    sameHandDifferentFingerActionsPerSecondByPair: { 'LM:LI': 3 },
    sameHandDifferentFingerActionsPerDirectedPair: { 'LM>LI': 0.2 },
    fingerSpeedUnitsPerSecond: {},
    fallbackFingerSpeedUnitsPerSecond: 10,
    measuredAt: 1,
  };
  const normalMs = playbackStrokeDurationMs(strokes[1], 1, false, calibration, strokes[0]);
  assert.equal(normalMs, 1000 / 3);
  const timings = playbackArpeggioTimings(strokes, conditions, 1, calibration);
  assert.equal(timings.get(1)?.intervalMs, 0);
  assert.ok(Math.abs((timings.get(1)?.leadDelayMs ?? 0) - (5000 - normalMs)) < 1e-9);
  assert.equal(playbackStrokeDurationMs(strokes[1], 1, false, calibration, strokes[0], 1, timings.get(1)), 5000);
  const distributed = playbackArpeggioTimings(strokes, conditions, 1, calibration, 'distributed');
  assert.equal(distributed.get(1)?.intervalMs, 5000);
  assert.equal(playbackStrokeDurationMs(strokes[1], 1, false, calibration, strokes[0], 1, distributed.get(1)), 5000);
  const nonArpeggio = [
    stroke('LM', 'e', 2, 1),
    stroke('LI', 'r', 2.5, 1),
  ];
  assert.deepEqual(playbackArpeggioTimings(nonArpeggio, conditions, 1, calibration), new Map());
  assert.equal(playbackStrokeDurationMs(nonArpeggio[1], 1, false, calibration, nonArpeggio[0]), 1000 / 3);
  assert.equal(createPlaybackState(1, false, undefined, 1, conditions).arpeggio, conditions);
});
