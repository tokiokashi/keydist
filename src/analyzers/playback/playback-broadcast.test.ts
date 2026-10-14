import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlaybackState, type PlaybackState } from '#interpretation/timing/playback.ts';
import { createPlaybackBroadcast } from './playback-broadcast.ts';
import {
  applyPlaybackAction,
  playbackBroadcastAvailability,
  playbackPaneReport,
  playbackPaneStatus,
  playbackToggleAction,
  type PlaybackBroadcastAction,
  type PlaybackPaneStatus,
} from './session.ts';

const TOTAL = 10;
const base = createPlaybackState();
const at = (cursor: number, playing = false, elapsedMs = 0): PlaybackState => ({ ...base, cursor, playing, elapsedMs });

const stopped = at(0);
const middle = at(4);
const playingMid = at(5, true, 30);
const finished = at(TOTAL);

function apply(action: PlaybackBroadcastAction, panes: readonly PlaybackState[]): PlaybackState[] {
  return panes.map((state) => applyPlaybackAction(state, action, TOTAL));
}

test('再生: 止まっているペインを今の位置から始め、再生中のペインは続け、最後まで再生したペインは始めない', () => {
  const next = apply('play', [stopped, middle, playingMid, finished]);
  assert.deepEqual(next.map((state) => [state.cursor, state.playing]), [[0, true], [4, true], [5, true], [TOTAL, false]]);
  // 再生中のペインは始め直さない（経過時間をそのまま残す）
  assert.equal(next[2], playingMid);
  assert.equal(next[1]?.elapsedMs, 0);
});

test('一時停止: 再生中のペインだけをその位置で止める', () => {
  const next = apply('pause', [stopped, middle, playingMid, at(7, true, 10)]);
  assert.deepEqual(next.map((state) => [state.cursor, state.playing]), [[0, false], [4, false], [5, false], [7, false]]);
  assert.equal(next[2]?.elapsedMs, 30);
  assert.equal(next[0], stopped);
});

test('停止: 全部のペインを先頭へ戻して止める。そのあとの再生は全部のペインが同じ位置から始まる', () => {
  const stoppedAll = apply('stop', [stopped, middle, playingMid, finished]);
  assert.ok(stoppedAll.every((state) => state.cursor === 0 && state.elapsedMs === 0 && !state.playing));
  const started = apply('play', stoppedAll);
  assert.ok(started.every((state) => state.cursor === 0 && state.elapsedMs === 0 && state.playing));
});

test('再生／一時停止のボタンは、押したペインが再生中なら一時停止、止まっていれば再生を伝える', () => {
  assert.equal(playbackToggleAction({ playing: true }), 'pause');
  assert.equal(playbackToggleAction({ playing: false }), 'play');
});

test('ペインの状態: 先頭かどうかは経過時間も見る。最後まで再生したかは位置で決まる', () => {
  assert.deepEqual(playbackPaneStatus(stopped, TOTAL), { atStart: true, playing: false, atEnd: false });
  assert.equal(playbackPaneStatus(at(0, false, 12), TOTAL).atStart, false);
  assert.deepEqual(playbackPaneStatus(finished, TOTAL), { atStart: false, playing: false, atEnd: true });
});

const status = (state: PlaybackState): PlaybackPaneStatus => playbackPaneStatus(state, TOTAL);

test('押せる条件: 停止は、どれかが先頭以外にあるか再生中なら押せる。先頭で止まったペインしか無ければ押せない', () => {
  assert.equal(playbackBroadcastAvailability([status(stopped), status(stopped)]).canStop, false);
  assert.equal(playbackBroadcastAvailability([status(stopped), status(middle)]).canStop, true);
  assert.equal(playbackBroadcastAvailability([status(stopped), status(playingMid)]).canStop, true);
  assert.equal(playbackBroadcastAvailability([status(stopped), status(finished)]).canStop, true);
  assert.equal(playbackBroadcastAvailability([]).canStop, false);
});

test('押せる条件: 再生は、止まっていて最後まで再生していないペインがどれかにあれば押せる', () => {
  assert.equal(playbackBroadcastAvailability([status(finished), status(stopped)]).canPlay, true);
  assert.equal(playbackBroadcastAvailability([status(finished), status(playingMid)]).canPlay, false);
  assert.equal(playbackBroadcastAvailability([status(finished), status(finished)]).canPlay, false);
  assert.equal(playbackBroadcastAvailability([]).canPlay, false);
});

test('伝える所: 操作は番号を増やして購読者へ知らせ、ペインの状態の報告で押せる条件が変わる', () => {
  const broadcast = createPlaybackBroadcast();
  let notified = 0;
  const unsubscribe = broadcast.subscribe(() => { notified += 1; });
  const initial = broadcast.command();
  assert.equal(initial.revision, 0);
  assert.equal(broadcast.canStop(), false);

  broadcast.report('a', status(stopped));
  broadcast.report('b', status(middle));
  assert.equal(broadcast.canStop(), true);
  assert.equal(broadcast.canPlay(), true);
  const reported = notified;
  broadcast.report('b', status(middle));
  assert.equal(notified, reported, '同じ状態の報告では知らせない');

  broadcast.dispatch('stop');
  assert.deepEqual(broadcast.command(), { revision: 1, action: 'stop' });
  assert.equal(broadcast.command(), broadcast.command());

  broadcast.report('b', undefined);
  assert.equal(broadcast.canStop(), false);
  unsubscribe();
  broadcast.dispatch('play');
  assert.equal(notified, reported + 1 + 1);
});

test('打鍵の無いペインは報告に加わらず、進んだあとに打鍵が0件になったペインの古い状態は外れる', () => {
  assert.equal(playbackPaneReport(stopped, 0), undefined);
  assert.equal(playbackPaneReport(middle, 0), undefined);
  assert.deepEqual(playbackPaneReport(stopped, TOTAL), { atStart: true, playing: false, atEnd: false });

  const broadcast = createPlaybackBroadcast();
  const sync = (owner: string, state: PlaybackState, total: number) => broadcast.report(owner, playbackPaneReport(state, total));
  sync('a', stopped, TOTAL);
  sync('b', middle, TOTAL);
  assert.equal(broadcast.canStop(), true);
  // bの打鍵が0件になる（テキストを空にした時）。残るaは先頭で止まっているので停止は押せない
  sync('b', middle, 0);
  assert.equal(broadcast.canStop(), false);
  // 打鍵の無いペインだけの時は、再生も押せない
  sync('a', stopped, 0);
  assert.equal(broadcast.canPlay(), false);
  // 計算が終わって打鍵が出たペインは、先頭で止まった状態から加わる
  sync('c', stopped, TOTAL);
  assert.equal(broadcast.canPlay(), true);
  assert.equal(broadcast.canStop(), false);
});
