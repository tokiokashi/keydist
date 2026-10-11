import type { Geometry } from '#input/shapes/geometry.ts';
import type { AggregatedAnalysisResult } from '#interpretation/structure/aggregate.ts';
import {
  advancePlayback,
  clampPlaybackCursor,
  createPlaybackState,
  playbackTimingSchedule,
  stepPlayback,
  type PlaybackState,
  type PlaybackTimingStep,
} from '#interpretation/timing/playback.ts';
import type { PlaybackTimingConditions } from './timing-conditions.ts';

/**
 * 再生位置の遷移（再生・一時停止・停止・1ステップの移動・シーク・時間の経過）。
 * 再生位置はペインの本体のメモリの上だけに置く値で、保存しない。ここは遷移の規則だけを持つ。
 */

/** 先頭にいて止まっている再生位置。時間の条件は`spec/playback-timing.md` §2の条件を渡す。 */
export function initialPlaybackState(timing: PlaybackTimingConditions): PlaybackState {
  return createPlaybackState(timing.stepsPerSecond, timing.sameFingerDelay, timing.calibration, timing.speedMultiplier);
}

/**
 * 各ステップの開始・終了時刻（確定した時間表）。再生・指位置の表示・動きの長さは、
 * いずれもこの時間表を読む。条件が変わらない限り作り直さない。
 */
export function playbackScheduleOf(
  analysis: AggregatedAnalysisResult,
  geometry: Geometry,
  timing: PlaybackTimingConditions,
): PlaybackTimingStep[] {
  return playbackTimingSchedule(
    analysis,
    timing.stepsPerSecond,
    timing.sameFingerDelay,
    timing.calibration,
    timing.speedMultiplier,
    { allFingerMovementDelay: timing.allFingerMovementDelay, geometry },
  );
}

/** 再生を始める。最後まで進んでいる時は始めない（先頭へ戻す操作は停止）。 */
export function startPlayback(state: PlaybackState, total: number): PlaybackState {
  if (state.playing || total === 0 || state.cursor >= total) return state;
  // 一時停止からの再開では今のステップの経過時間を残す。0へ戻すと、到着済みの指の表示が逆戻りする
  return { ...state, playing: true };
}

export function pausePlayback(state: PlaybackState): PlaybackState {
  return state.playing ? { ...state, playing: false } : state;
}

/** 停止。先頭へ戻して止める。 */
export function stopPlayback(state: PlaybackState): PlaybackState {
  return { ...state, cursor: 0, elapsedMs: 0, playing: false };
}

/** 再生中でない時の1ステップ戻る・進む。 */
export function stepPlaybackBy(state: PlaybackState, delta: -1 | 1, total: number): PlaybackState {
  return stepPlayback(state, delta, total);
}

/** 指定したステップへ移る。今のステップの経過時間は0へ戻す。再生中かどうかは変えない。 */
export function seekPlayback(state: PlaybackState, cursor: number, total: number): PlaybackState {
  return { ...state, cursor: clampPlaybackCursor(cursor, total), elapsedMs: 0 };
}

/** 描画フレームの経過時間ぶん再生を進める。 */
export function tickPlayback(
  state: PlaybackState,
  frameMs: number,
  analysis: AggregatedAnalysisResult,
  schedule: readonly PlaybackTimingStep[],
): PlaybackState {
  return advancePlayback(state, frameMs, analysis, schedule);
}
