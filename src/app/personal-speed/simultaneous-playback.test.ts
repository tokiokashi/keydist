import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { MEASUREMENT_SENTENCES } from '#editors/personal-speed/calibration-text.ts';
import type { PlaybackCalibration } from '#interpretation/timing/calibration.ts';
import { playbackNormalMs, playbackStepDurationMs } from '#interpretation/timing/playback.ts';
import { strokeSimultaneousKind } from '#interpretation/timing/stroke-structure.ts';
import { personalSpeedSentenceBuilder } from './sentence-source.ts';

const BASE: PlaybackCalibration = {
  actionsPerSecond: 6,
  actionsPerSecondByDirection: { 'L→R': 6.5, 'R→L': 5.5 },
  sameHandDifferentFingerActionsPerSecond: 5.2,
  sameHandDifferentFingerActionsPerSecondByPair: {},
  fingerRepeatMs: {},
  fingerMoveMsPerUnit: {},
  fallbackRepeatMs: 1000 / 5,
  fallbackMoveMsPerUnit: 1000 / 12,
  measuredAt: 1,
};
const WITH_C: PlaybackCalibration = { ...BASE, simultaneousOverheadMs: { 'both-hands': 30, 'one-hand': 40, thumb: 50 } };

const builder = personalSpeedSentenceBuilder({
  userLayouts: [],
  userRomajiRules: [],
  fingerAssignments: [],
  setupLibrary: { setups: [], overrides: EMPTY_SETTINGS_OVERRIDES },
});

function analysisOf(layoutId: string) {
  const result = builder({ layoutId, shapeId: 'row-staggered', fingerAssignmentId: 'default' }, MEASUREMENT_SENTENCES.join(''));
  assert.ok(result.ok, layoutId);
  return result.analysis;
}

function stepDurations(layoutId: string, calibration: PlaybackCalibration): number[] {
  const analysis = analysisOf(layoutId);
  return analysis.strokes.map((_, index) => playbackStepDurationMs(analysis, index, 1, true, calibration, 1));
}

test('同時押しを持たない配列は、同時押しの上乗せを保存しても再生の時間が変わらない', () => {
  for (const layoutId of ['qwerty', 'tsuki-2-263']) {
    const analysis = analysisOf(layoutId);
    assert.ok(
      analysis.strokes.every((stroke) => strokeSimultaneousKind(stroke) === undefined),
      layoutId,
    );
    assert.deepEqual(stepDurations(layoutId, WITH_C), stepDurations(layoutId, BASE), layoutId);
  }
});

test('同時押しを持つ配列は、同時押しのストロークのステップだけ種類の上乗せ分が延びる', () => {
  const expected = { 'both-hands': 30, 'one-hand': 40, thumb: 50 } as const;
  for (const layoutId of ['nicola', 'shingeta', 'naginata-v18']) {
    const analysis = analysisOf(layoutId);
    const before = stepDurations(layoutId, BASE);
    const after = stepDurations(layoutId, WITH_C);
    let chords = 0;
    analysis.strokes.forEach((stroke, index) => {
      const kind = strokeSimultaneousKind(stroke);
      const diff = after[index] - before[index];
      if (kind === undefined) {
        assert.equal(diff, 0, `${layoutId} ${index}`);
        return;
      }
      chords++;
      // 同指連続の押下を含むステップは、移動の時間（続け打ちの時間 + 距離 × 1uあたりの時間）が律速してcが入らない。
      if (stroke.presses.some((press) => press.sfb)) {
        assert.ok(diff >= -1e-9 && diff <= expected[kind] + 1e-9, `${layoutId} ${index} ${kind}`);
        return;
      }
      assert.ok(Math.abs(diff - expected[kind]) < 1e-9, `${layoutId} ${index} ${kind}`);
    });
    assert.ok(chords > 0, layoutId);
  }
});

test('解析の遷移から選ぶ基準の時間は、ストロークの指から選ぶ時と一致する', () => {
  for (const layoutId of ['qwerty', 'nicola', 'shingeta', 'naginata-v18', 'oonishi-custom']) {
    const analysis = analysisOf(layoutId);
    const fromStrokes = { strokes: analysis.strokes, transitions: [] };
    analysis.strokes.forEach((_, index) => {
      assert.ok(Math.abs(playbackNormalMs(analysis, index, BASE) - playbackNormalMs(fromStrokes, index, BASE)) < 1e-9, `${layoutId} ${index}`);
    });
  }
});
