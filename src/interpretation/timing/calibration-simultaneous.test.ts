import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { SIMULTANEOUS_KINDS, calibrationKeyMatches, type PlaybackCalibration, type SimultaneousKind } from './calibration.ts';
import {
  SIMULTANEOUS_PRESS_WINDOW_MS,
  applyCalibrationRun,
  calibrationItemId,
  calibrationKeyLabel,
  calibrationRunFinished,
  calibrationTaskAcceptsSpace,
  planCalibration,
  pressCalibrationKey,
  startCalibrationRun,
  type CalibrationBasis,
  type CalibrationRun,
  type CalibrationTask,
} from './calibration-session.ts';
import { playbackSimultaneousBaseMs } from './playback.ts';

const GEOMETRY = buildGeometry('row-staggered');
const LEGENDS = new Map([...GEOMETRY.keys.values()].map((key) => [key.id, key.id] as const));
const BASIS: CalibrationBasis = { geometry: GEOMETRY, legends: LEGENDS };
const PLAN = planCalibration(BASIS);
const label = (keyId: string) => keyId;
const THUMB = GEOMETRY.thumbs.RT.id;

const SAVED: PlaybackCalibration = {
  actionsPerSecond: 5,
  actionsPerSecondByDirection: { 'L→R': 5.5, 'R→L': 4 },
  sameHandDifferentFingerActionsPerSecond: 4,
  sameHandDifferentFingerActionsPerSecondByPair: { 'RI:RM': 3.5 },
  sameHandDifferentFingerActionsPerDirectedPair: { 'RI>RM': 2.5 },
  fingerSpeedUnitsPerSecond: { LI: 8, RI: 9 },
  fallbackFingerSpeedUnitsPerSecond: 7,
  measuredAt: 1,
};

function event(keyId: string) {
  return keyId === THUMB ? { key: ' ', code: 'Space' } : { key: keyId, code: '' };
}

function taskOf(kind: SimultaneousKind): CalibrationTask {
  const task = PLAN.byItem.get(`simultaneous:${kind}`);
  assert.ok(task);
  return task;
}

/** 2つのキーを、`gapMs`の間をおいて続けて押す。押した結果の進行を返す。 */
function press(run: CalibrationRun, first: string, second: string, atMs: number, gapMs: number): CalibrationRun {
  const one = pressCalibrationKey(run, event(first), atMs, label).run;
  return pressCalibrationKey(one, event(second), atMs + gapMs, label).run;
}

test('row-staggeredでは、同時押しの測定は両手・片手・親指の3項目で、どれも9間隔', () => {
  assert.deepEqual(PLAN.simultaneous?.map((task) => calibrationItemId(task.item)), [
    'simultaneous:both-hands',
    'simultaneous:one-hand',
    'simultaneous:thumb',
  ]);
  for (const task of PLAN.simultaneous ?? []) {
    assert.equal(task.required, 9);
    assert.equal(task.oneWay, false);
  }
  assert.deepEqual(taskOf('both-hands').keys, ['f', 'j']);
  assert.deepEqual(taskOf('one-hand').keys, ['j', 'k']);
  assert.deepEqual(taskOf('thumb').keys, [THUMB, 'j']);
  assert.equal(PLAN.byField.get('simultaneous:thumb')?.length, 1);
});

test('Spaceは右手の親指のキーで、親指との同時押しの項目だけがSpaceを受け付ける', () => {
  assert.equal(calibrationKeyLabel(LEGENDS, THUMB), 'Space');
  assert.equal(calibrationTaskAcceptsSpace(taskOf('thumb')), true);
  assert.equal(calibrationTaskAcceptsSpace(taskOf('one-hand')), false);
  assert.equal(calibrationTaskAcceptsSpace(PLAN.byItem.get('actions')), false);
  assert.equal(calibrationTaskAcceptsSpace(undefined), false);
  assert.equal(calibrationKeyMatches({ key: ' ', code: 'Space' }, THUMB), true);
  assert.equal(calibrationKeyMatches({ key: ' ', code: '' }, THUMB), true);
  assert.equal(calibrationKeyMatches({ key: 'j', code: 'KeyJ' }, THUMB), false);
});

test('測るキーを組めない項目は、同時押しの測定に入らない', () => {
  // 刻印がFとJだけの配列。片手の同時押しのKに刻印が無い。
  const sparse = planCalibration({ geometry: GEOMETRY, legends: new Map([['f', 'F'], ['j', 'J']]) });
  assert.deepEqual(sparse.simultaneous?.map((task) => calibrationItemId(task.item)), ['simultaneous:both-hands', 'simultaneous:thumb']);
  // 刻印が1つも無ければ測れない。
  assert.equal(planCalibration({ geometry: GEOMETRY, legends: new Map() }).simultaneous, undefined);
});

test('2つのキーが受け付ける時間以内に揃えば1つのストロークで、押す順は問わない', () => {
  const task = taskOf('both-hands');
  let run = startCalibrationRun('item', [task]);
  // f→jの順、j→fの順を混ぜて、受け付ける時間ちょうどの差でも受け付ける。
  run = press(run, 'f', 'j', 1000, 10);
  assert.deepEqual(run.intervalsMs, []);
  assert.equal(run.lastAtMs, 1000);
  run = press(run, 'j', 'f', 1200, SIMULTANEOUS_PRESS_WINDOW_MS);
  assert.deepEqual(run.intervalsMs, [200]);
  assert.equal(run.lastAtMs, 1200);
  run = press(run, 'f', 'j', 1500, 0);
  assert.deepEqual(run.intervalsMs, [200, 300]);
});

test('受け付ける時間を超えて揃った押下の組は、ストロークとして受け付けず、その後の最初のストロークの間隔を数えない', () => {
  const task = taskOf('both-hands');
  let run = startCalibrationRun('item', [task]);
  run = press(run, 'f', 'j', 1000, 5);
  // 受け付ける時間を1ミリ秒超える。fは捨てられ、jが1つ目の押下になる。
  run = press(run, 'f', 'j', 1100, SIMULTANEOUS_PRESS_WINDOW_MS + 1);
  assert.deepEqual(run.intervalsMs, []);
  assert.equal(run.lastAtMs, undefined);
  assert.deepEqual(run.pending.map((pending) => pending.key), ['j']);
  // jを待たせたまま、fが揃うと、そのストロークは受け付けるが、直前のストロークとの間隔は数えない。
  run = pressCalibrationKey(run, event('f'), 1100 + SIMULTANEOUS_PRESS_WINDOW_MS + 1 + 20, label).run;
  assert.deepEqual(run.intervalsMs, []);
  assert.equal(run.lastAtMs, 1151);
  // 次のストロークからは、間隔を数える。
  run = press(run, 'f', 'j', 1251, 3);
  assert.deepEqual(run.intervalsMs, [100]);
});

test('片方しか押さない押下と、同じキーの2回目の押下は、待たせていた押下を捨てる', () => {
  const task = taskOf('one-hand');
  let run = startCalibrationRun('item', [task]);
  run = press(run, 'j', 'k', 1000, 4);
  // jを押して、jをもう一度押す。先の押下を捨て、後の押下を1つ目とする。
  run = pressCalibrationKey(run, event('j'), 1100, label).run;
  run = pressCalibrationKey(run, event('j'), 1120, label).run;
  assert.deepEqual(run.pending, [{ key: 'j', atMs: 1120 }]);
  assert.equal(run.lastAtMs, undefined);
  // kが揃うと、ストロークの時刻は後のjの時刻。
  run = pressCalibrationKey(run, event('k'), 1130, label).run;
  assert.equal(run.lastAtMs, 1120);
  assert.deepEqual(run.intervalsMs, []);
});

test('測る2つ以外のキーは、進行を変えない', () => {
  const task = taskOf('both-hands');
  const run = startCalibrationRun('item', [task]);
  const pressed = pressCalibrationKey(run, event('x'), 1000, label);
  assert.equal(pressed.run, run);
  assert.equal(pressed.outcome.kind, 'wrong-key');
  // 1つ目を待たせている間に別のキーを押しても、待たせている押下は残る。
  const waiting = pressCalibrationKey(run, event('f'), 1000, label).run;
  assert.equal(pressCalibrationKey(waiting, event('x'), 1010, label).run, waiting);
});

test('9間隔を数えると、その項目が済む', () => {
  const task = taskOf('thumb');
  let run = startCalibrationRun('item', [task]);
  for (let index = 0; index < 10; index++) run = press(run, THUMB, 'j', 1000 + index * 300, 12);
  assert.equal(calibrationRunFinished(run), true);
  assert.deepEqual(run.results[0].intervalsMs, Array(9).fill(300));
});

/** 項目ごとに一定の間隔を数え終えた進行。 */
function finishedRun(scope: CalibrationRun['scope'], tasks: readonly CalibrationTask[], intervalOf: (task: CalibrationTask) => number): CalibrationRun {
  return {
    ...startCalibrationRun(scope, tasks),
    index: tasks.length,
    results: tasks.map((task) => ({ task, intervalsMs: Array(task.required).fill(intervalOf(task)) })),
  };
}

test('同時押しの上乗せは、間隔の中央値から、再生がそのステップに選ぶ基準の時間を引いた差になる', () => {
  const run = finishedRun('simultaneous', PLAN.simultaneous ?? [], (task) => ({
    'simultaneous:both-hands': 330,
    'simultaneous:one-hand': 520,
    'simultaneous:thumb': 190,
  })[calibrationItemId(task.item)] ?? 0);
  const result = applyCalibrationRun(SAVED, run, 10);
  assert.ok(result.ok);
  // 両手: R→Lの方向別の値4/秒で250。片手: 右手の人差し指から中指の方向別の値2.5/秒で400。親指: 代表値4/秒で250。
  assert.deepEqual(result.calibration.simultaneousOverheadMs, {
    'both-hands': 330 - 250,
    'one-hand': 520 - 400,
    thumb: 190 - 250,
  });
  for (const kind of SIMULTANEOUS_KINDS) {
    assert.equal(
      (result.calibration.simultaneousOverheadMs?.[kind] ?? 0) + playbackSimultaneousBaseMs(kind, SAVED),
      { 'both-hands': 330, 'one-hand': 520, thumb: 190 }[kind],
    );
  }
  assert.equal(result.calibration.measuredAt, 10);
  assert.deepEqual(result.clearedSimultaneous, []);
});

test('外れた間隔が混ざっても、中央値で求める', () => {
  const task = taskOf('both-hands');
  const run: CalibrationRun = {
    ...startCalibrationRun('item', [task]),
    index: 1,
    results: [{ task, intervalsMs: [240, 250, 260, 270, 280, 900, 290, 300, 310] }],
  };
  const result = applyCalibrationRun(SAVED, run, 10);
  assert.ok(result.ok);
  // 並べた中央値は280。
  assert.equal(result.calibration.simultaneousOverheadMs?.['both-hands'], 280 - 250);
});

test('1項目の測り直しは、測った分け方だけを置き換え、他の分け方と他の項目は残す', () => {
  const base: PlaybackCalibration = { ...SAVED, simultaneousOverheadMs: { 'both-hands': 11, thumb: 22 } };
  const run = finishedRun('item', [taskOf('one-hand')], () => 450);
  const result = applyCalibrationRun(base, run, 10);
  assert.ok(result.ok);
  assert.deepEqual(result.calibration.simultaneousOverheadMs, { 'both-hands': 11, thumb: 22, 'one-hand': 50 });
  assert.equal(result.calibration.actionsPerSecond, 5);
});

test('同時押しの測定は、同時押しのストロークが入りうる打鍵の上乗せを消し、続け打ちの打鍵の上乗せは消さない', () => {
  const base: PlaybackCalibration = {
    ...SAVED,
    keystrokeOverheadMs: { arpeggio: 1, 'arpeggio-within': 2, chain: 3, 'chain-boundary': 4, other: 5, 'other-within': 6, repeat: 7, sfb: 8 },
  };
  const result = applyCalibrationRun(base, finishedRun('simultaneous', PLAN.simultaneous ?? [], () => 300), 10);
  assert.ok(result.ok);
  assert.deepEqual(result.calibration.keystrokeOverheadMs, { repeat: 7 });
  assert.deepEqual(result.clearedOverheads, ['arpeggio', 'arpeggio-within', 'chain', 'chain-boundary', 'other', 'other-within', 'sfb']);
  assert.deepEqual(result.replacedOverheads, []);
});

test('1つの分け方だけを測り直しても、打鍵の上乗せを消す', () => {
  const base: PlaybackCalibration = { ...SAVED, keystrokeOverheadMs: { other: 5, repeat: 7 } };
  const result = applyCalibrationRun(base, finishedRun('item', [taskOf('thumb')], () => 300), 10);
  assert.ok(result.ok);
  assert.deepEqual(result.calibration.keystrokeOverheadMs, { repeat: 7 });
});

test('保存値が無ければ、同時押しの測定は反映先が無い', () => {
  assert.deepEqual(
    applyCalibrationRun(undefined, finishedRun('simultaneous', PLAN.simultaneous ?? [], () => 300), 10),
    { ok: false, reason: 'no-saved-value' },
  );
});

test('測った上乗せが保存できる範囲を外れたら、保存せずにやり直させる', () => {
  // 基準の時間250に対して、間隔が1500ミリ秒なら上乗せは1250。
  assert.deepEqual(
    applyCalibrationRun(SAVED, finishedRun('item', [taskOf('thumb')], () => 1500), 10),
    { ok: false, reason: 'invalid-measurement' },
  );
  // 負の側も範囲を外れる。
  assert.deepEqual(
    applyCalibrationRun({ ...SAVED, sameHandDifferentFingerActionsPerSecond: 0.5 }, finishedRun('item', [taskOf('thumb')], () => 10), 10),
    { ok: false, reason: 'invalid-measurement' },
  );
});

const WITH_SIMULTANEOUS: PlaybackCalibration = { ...SAVED, simultaneousOverheadMs: { 'both-hands': 10, 'one-hand': 20, thumb: 30 } };

function applied(base: PlaybackCalibration, run: CalibrationRun) {
  const result = applyCalibrationRun(base, run, 10);
  assert.ok(result.ok);
  return result;
}

test('基準の時間を求めるのに読む値が変わると、その分け方の同時押しの上乗せを消す', () => {
  // 異手のR→Lの値は両手の同時押しの基準。L→Rの値は読まない。
  const rl = applied(WITH_SIMULTANEOUS, finishedRun('item', [PLAN.byItem.get('direction:R→L')!], () => 500));
  assert.deepEqual(rl.calibration.simultaneousOverheadMs, { 'one-hand': 20, thumb: 30 });
  assert.deepEqual(rl.clearedSimultaneous, ['both-hands']);
  const lr = applied(WITH_SIMULTANEOUS, finishedRun('item', [PLAN.byItem.get('direction:L→R')!], () => 500));
  assert.deepEqual(lr.calibration.simultaneousOverheadMs, WITH_SIMULTANEOUS.simultaneousOverheadMs);
  assert.deepEqual(lr.clearedSimultaneous, []);
  // 右手の人差し指から中指の方向別の値は片手の同時押しの基準。
  const directed = applied(WITH_SIMULTANEOUS, finishedRun('item', [PLAN.byItem.get('directed-pair:RI>RM')!], () => 500));
  assert.deepEqual(directed.calibration.simultaneousOverheadMs, { 'both-hands': 10, thumb: 30 });
  // 読まない方向別の値を測っても残る。
  const other = applied(WITH_SIMULTANEOUS, finishedRun('item', [PLAN.byItem.get('directed-pair:LM>LI')!], () => 500));
  assert.deepEqual(other.clearedSimultaneous, []);
});

test('通常速度が変わると、通常速度を基準にしていない同時押しの上乗せは残る', () => {
  // SAVEDは両手の基準がR→Lの値、片手の基準が方向別の値、親指の基準が代表値。通常速度は読まれない。
  const normal = applied(WITH_SIMULTANEOUS, finishedRun('item', [PLAN.byItem.get('actions')!], () => 100));
  assert.deepEqual(normal.calibration.simultaneousOverheadMs, WITH_SIMULTANEOUS.simultaneousOverheadMs);
  // 方向別の値が無い保存値では、両手の同時押しの基準が通常速度になる。
  const { actionsPerSecondByDirection: _directions, ...withoutDirections } = WITH_SIMULTANEOUS;
  const changed = applied(withoutDirections, finishedRun('item', [PLAN.byItem.get('actions')!], () => 100));
  assert.deepEqual(changed.calibration.simultaneousOverheadMs, { 'one-hand': 20, thumb: 30 });
  assert.deepEqual(changed.clearedSimultaneous, ['both-hands']);
});

test('同手・別指の代表値が変わると、親指との同時押しの上乗せを消す', () => {
  const normal = applied(
    WITH_SIMULTANEOUS,
    finishedRun('normal', PLAN.normal ?? [], (task) => (task.item.kind === 'same-hand-pair' ? 500 : 200)),
  );
  // 代表値は同手・別指の全組を通した中央値で変わる。親指との同時押しの基準が変わる。
  assert.equal(normal.calibration.sameHandDifferentFingerActionsPerSecond, 2);
  assert.ok(normal.clearedSimultaneous.includes('thumb'));
  assert.equal(normal.calibration.simultaneousOverheadMs?.thumb, undefined);
});

test('通常速度・移動速度の測定は、基準の時間が変わらなければ同時押しの上乗せを残す', () => {
  // 保存値と同じ速さ（通常速度5/秒=200ミリ秒、代表値4/秒=250ミリ秒）を測る。方向別の値は測定の対象外で残る。
  const sameValues = applied(
    WITH_SIMULTANEOUS,
    finishedRun('normal', PLAN.normal ?? [], (task) => (task.item.kind === 'same-hand-pair' ? 250 : 200)),
  );
  assert.equal(sameValues.calibration.sameHandDifferentFingerActionsPerSecond, 4);
  assert.deepEqual(sameValues.clearedSimultaneous, []);
  assert.deepEqual(sameValues.calibration.simultaneousOverheadMs, WITH_SIMULTANEOUS.simultaneousOverheadMs);
});

test('指の移動速度の測定と、同じキーを続けて打つ速さの測定は、同時押しの上乗せを消さない', () => {
  const finger = applied(WITH_SIMULTANEOUS, finishedRun('item', [PLAN.byItem.get('finger:LI')!], () => 100));
  assert.deepEqual(finger.clearedSimultaneous, []);
  const sameKey = applied(WITH_SIMULTANEOUS, finishedRun('item', PLAN.byField.get('same-key') ?? [], () => 100));
  assert.deepEqual(sameKey.clearedSimultaneous, []);
  assert.deepEqual(sameKey.calibration.simultaneousOverheadMs, WITH_SIMULTANEOUS.simultaneousOverheadMs);
});
