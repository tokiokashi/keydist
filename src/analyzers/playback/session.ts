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

/** 先頭にいて止まっている再生位置。時間の設定は`spec/playback-timing.md` §2の項目から求めた値を渡す。 */
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

/** Workspaceで全部のペインに伝える操作。「再生／一時停止」は押したペインの状態で再生か一時停止かが決まる。 */
export type PlaybackBroadcastAction = 'play' | 'pause' | 'stop';

/** 押せる条件を決めるための、ペイン1枚の状態。再生位置そのものは含めない。 */
export interface PlaybackPaneStatus {
  /** 先頭にいて、今のステップの経過時間も0。止めたあとに揃って始められる状態 */
  readonly atStart: boolean;
  readonly playing: boolean;
  /** 最後まで再生した */
  readonly atEnd: boolean;
}

export function playbackPaneStatus(state: PlaybackState, total: number): PlaybackPaneStatus {
  return {
    atStart: state.cursor === 0 && state.elapsedMs === 0,
    playing: state.playing,
    atEnd: state.cursor >= total,
  };
}

/** 全部のペインへ報告する状態。打鍵が無いペインは加わらないので`undefined`（進んだあとに打鍵が0件になった時に古い状態を残さない）。 */
export function playbackPaneReport(state: PlaybackState, total: number): PlaybackPaneStatus | undefined {
  return total === 0 ? undefined : playbackPaneStatus(state, total);
}

/** 「再生／一時停止」を押したペインの状態から、全部のペインに伝える操作を決める。 */
export function playbackToggleAction(pressed: Pick<PlaybackPaneStatus, 'playing'>): 'play' | 'pause' {
  return pressed.playing ? 'pause' : 'play';
}

/**
 * 伝えられた操作を、ペイン1枚の再生位置に当てた結果。
 * 再生は止まっていて最後まで再生していないペインだけを今の位置から始め（再生中のペインは続ける）、
 * 一時停止は再生中のペインだけを止め、停止は先頭へ戻して止める。
 */
export function applyPlaybackAction(state: PlaybackState, action: PlaybackBroadcastAction, total: number): PlaybackState {
  switch (action) {
    case 'play': return startPlayback(state, total);
    case 'pause': return pausePlayback(state);
    case 'stop': return stopPlayback(state);
  }
}

/** 全部のペインの状態から、ボタンを押せるか。先頭で止まったペインからも、他のペインの停止・再生ができる。 */
export function playbackBroadcastAvailability(statuses: Iterable<PlaybackPaneStatus>): { readonly canPlay: boolean; readonly canStop: boolean } {
  let canPlay = false;
  let canStop = false;
  for (const status of statuses) {
    if (!status.playing && !status.atEnd) canPlay = true;
    if (!status.atStart || status.playing) canStop = true;
  }
  return { canPlay, canStop };
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
