import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGeometry } from '#input/shapes/geometry.ts';
import type { PlaybackCalibration } from './calibration.ts';
import {
  applyCalibrationRun,
  calibrationItemId,
  calibrationKeyLabel,
  calibrationRunFinished,
  currentCalibrationTask,
  expectedCalibrationKey,
  planCalibration,
  pressCalibrationKey,
  remainingCalibrationIntervals,
  startCalibrationRun,
  type CalibrationBasis,
  type CalibrationRun,
  type CalibrationTask,
} from './calibration-session.ts';

const GEOMETRY = buildGeometry('row-staggered');
const LEGENDS = new Map([...GEOMETRY.keys.values()].map((key) => [key.id, key.id] as const));
const BASIS: CalibrationBasis = { geometry: GEOMETRY, legends: LEGENDS };
const PLAN = planCalibration(BASIS);
const label = (keyId: string) => keyId;

const SAVED: PlaybackCalibration = {
  actionsPerSecond: 5,
  actionsPerSecondByDirection: { 'L→R': 5.5 },
  sameHandDifferentFingerActionsPerSecond: 4,
  sameHandDifferentFingerActionsPerSecondByPair: { 'LM:LI': 3.5, 'LP:LR': 2 },
  sameHandDifferentFingerActionsPerDirectedPair: { 'LM>LI': 3.2 },
  fingerSpeedUnitsPerSecond: { LI: 8, RI: 9 },
  fallbackFingerSpeedUnitsPerSecond: 7,
  measuredAt: 1,
};

function event(keyId: string) {
  return { key: keyId, code: '' };
}

/** 今の項目を、一定の間隔で最後まで打つ。 */
function playCurrentTask(run: CalibrationRun, startMs: number, intervalMs: number): { run: CalibrationRun; atMs: number } {
  const task = currentCalibrationTask(run)!;
  const index = run.index;
  let current = run;
  let atMs = startMs;
  while (current.index === index) {
    const expected = expectedCalibrationKey(current)!;
    current = pressCalibrationKey(current, event(expected), atMs, label).run;
    atMs += intervalMs;
  }
  assert.ok(task);
  return { run: current, atMs };
}

function playAll(run: CalibrationRun, intervalMs: number): CalibrationRun {
  let current = run;
  let atMs = 1000;
  while (!calibrationRunFinished(current)) {
    const played = playCurrentTask(current, atMs, intervalMs);
    current = played.run;
    atMs = played.atMs + 1000;
  }
  return current;
}

test('row-staggeredの測定は通常速度・左右の続け打ち・8指・同手12組、方向別は2方向・24組になる', () => {
  assert.equal(PLAN.normal?.length, 1 + 2 + 8 + 12);
  assert.equal(PLAN.directional?.length, 2 + 24);
  assert.deepEqual(PLAN.normal?.[0]?.keys, ['f', 'j']);
  assert.equal(PLAN.normal?.[0]?.required, 9);
  assert.deepEqual(PLAN.normal?.slice(0, 3).map((task) => calibrationItemId(task.item)), ['actions', 'same-key:L', 'same-key:R']);
  assert.equal(PLAN.byItem.get('finger:LI')?.required, 6);
  assert.equal(PLAN.byItem.get('same-hand-pair:LM:LI')?.required, 12);
  assert.equal(PLAN.byItem.get('same-hand-pair:LM:LI')?.oneWay, false);
  assert.equal(PLAN.byItem.get('directed-pair:LM>LI')?.required, 6);
  assert.equal(PLAN.byItem.get('directed-pair:LM>LI')?.oneWay, true);
  assert.deepEqual(PLAN.byItem.get('direction:R→L')?.keys, ['j', 'f']);
});

test('刻印の無いキーしか無い配列では、測るキーを作れない', () => {
  const plan = planCalibration({ geometry: GEOMETRY, legends: new Map() });
  assert.equal(plan.normal, undefined);
  assert.equal(plan.directional, undefined);
  assert.equal(plan.byItem.size, 0);
});

test('項目の識別子は種類と対象で決まる', () => {
  assert.equal(calibrationItemId({ kind: 'actions' }), 'actions');
  assert.equal(calibrationItemId({ kind: 'same-key', hand: 'R' }), 'same-key:R');
  assert.equal(calibrationItemId({ kind: 'direction', direction: 'L→R' }), 'direction:L→R');
  assert.equal(calibrationItemId({ kind: 'finger', finger: 'LI' }), 'finger:LI');
});

test('案内に出すキーの名前は刻印を使い、無ければキーidにする', () => {
  const legends = new Map([['f', 'と'], ['j', ' ']]);
  assert.equal(calibrationKeyLabel(legends, 'f'), 'と');
  assert.equal(calibrationKeyLabel(legends, 'j'), 'J');
  assert.equal(calibrationKeyLabel(legends, 'k'), 'K');
  assert.equal(calibrationKeyLabel(legends, ';'), ';');
});

const ALTERNATING: CalibrationTask = { item: { kind: 'actions' }, keys: ['f', 'j'], required: 3, oneWay: false };
const ONE_WAY: CalibrationTask = { item: { kind: 'direction', direction: 'L→R' }, keys: ['f', 'j'], required: 2, oneWay: true };

test('交互に打つ項目は、最初の打鍵の後の打鍵ごとに間隔を数える', () => {
  let run = startCalibrationRun('item', [ALTERNATING]);
  const presses: [string, number][] = [['f', 100], ['j', 300], ['f', 600]];
  for (const [key, at] of presses) run = pressCalibrationKey(run, event(key), at, label).run;
  assert.deepEqual(run.intervalsMs, [200, 300]);
  assert.equal(remainingCalibrationIntervals(run), 1);
  const last = pressCalibrationKey(run, event('j'), 1000, label);
  assert.equal(last.outcome.kind, 'run-finished');
  assert.deepEqual(last.run.results[0]?.intervalsMs, [200, 300, 400]);
  assert.equal(calibrationRunFinished(last.run), true);
});

test('片道だけ数える項目は、戻りの間隔を捨てる', () => {
  let run = startCalibrationRun('item', [ONE_WAY]);
  const presses: [string, number][] = [['f', 0], ['j', 100], ['f', 150], ['j', 300], ['f', 320]];
  for (const [key, at] of presses) run = pressCalibrationKey(run, event(key), at, label).run;
  assert.deepEqual(run.results[0]?.intervalsMs, [100, 150]);
});

test('次に打つキーと違えば進行は変わらず、期待するキーを返す', () => {
  const run = startCalibrationRun('item', [ALTERNATING]);
  const first = pressCalibrationKey(run, event('f'), 100, label).run;
  const wrong = pressCalibrationKey(first, event('f'), 200, label);
  assert.deepEqual(wrong.outcome, { kind: 'wrong-key', expectedKey: 'j' });
  assert.equal(wrong.run, first);
  const other = pressCalibrationKey(first, event('k'), 200, label);
  assert.equal(other.run, first);
});

test('時刻が進まない打鍵は無視する', () => {
  const run = startCalibrationRun('item', [ALTERNATING]);
  const first = pressCalibrationKey(run, event('f'), 100, label).run;
  const same = pressCalibrationKey(first, event('j'), 100, label);
  assert.equal(same.outcome.kind, 'ignored');
  assert.equal(same.run, first);
  assert.equal(pressCalibrationKey(first, event('j'), 50, label).run, first);
});

test('刻印と物理コードのどちらでも次のキーとして受け付ける', () => {
  const run = startCalibrationRun('item', [ALTERNATING]);
  const byCode = pressCalibrationKey(run, { key: 'ん', code: 'KeyF' }, 100, label);
  assert.equal(byCode.outcome.kind, 'counted');
  assert.equal(byCode.run.expected, 1);
});

test('項目が終わると次の項目の最初のキーから始め、前の項目の時刻を持ち越さない', () => {
  let run = startCalibrationRun('directional', [ONE_WAY, ALTERNATING]);
  const presses: [string, number][] = [['f', 0], ['j', 100], ['f', 150], ['j', 300]];
  let outcome = '';
  for (const [key, at] of presses) {
    const pressed = pressCalibrationKey(run, event(key), at, label);
    run = pressed.run;
    outcome = pressed.outcome.kind;
  }
  assert.equal(outcome, 'task-finished');
  assert.equal(run.index, 1);
  assert.equal(run.expected, 0);
  assert.equal(run.lastAtMs, undefined);
  assert.deepEqual(run.intervalsMs, []);
  assert.equal(expectedCalibrationKey(run), 'f');
  // 前の項目の最後の時刻から数えると300msの間隔が入ってしまう。
  const next = pressCalibrationKey(run, event('f'), 310, label).run;
  assert.deepEqual(next.intervalsMs, []);
});

test('済んだ進行へ打鍵しても何も変わらない', () => {
  const run = playAll(startCalibrationRun('item', [ALTERNATING]), 200);
  assert.equal(pressCalibrationKey(run, event('f'), 99999, label).run, run);
  assert.equal(expectedCalibrationKey(run), undefined);
});

test('通常速度・移動速度の測定は、通常速度・指ごと・同手別指の値を測った間隔から作る', () => {
  const run = playAll(startCalibrationRun('normal', PLAN.normal!), 250);
  const applied = applyCalibrationRun(undefined, run, 777);
  assert.ok(applied.ok);
  const { calibration } = applied;
  assert.equal(calibration.actionsPerSecond, 4);
  assert.equal(calibration.sameHandDifferentFingerActionsPerSecond, 4);
  assert.equal(Object.keys(calibration.sameHandDifferentFingerActionsPerSecondByPair).length, 12);
  assert.equal(calibration.sameHandDifferentFingerActionsPerSecondByPair['LM:LI'], 4);
  assert.equal(Object.keys(calibration.fingerSpeedUnitsPerSecond).length, 8);
  const liDistance = PLAN.byItem.get('finger:LI')!.distance!;
  assert.equal(calibration.fingerSpeedUnitsPerSecond.LI, liDistance / 0.25);
  assert.equal(calibration.fallbackFingerSpeedUnitsPerSecond > 0, true);
  assert.equal(calibration.actionsPerSecondByDirection, undefined);
  assert.equal(calibration.measuredAt, 777);
});

test('通常速度の測定は、保存値の方向別の値を残して他を置き換える', () => {
  const run = playAll(startCalibrationRun('normal', PLAN.normal!), 250);
  const applied = applyCalibrationRun(SAVED, run, 777);
  assert.ok(applied.ok);
  assert.deepEqual(applied.calibration.actionsPerSecondByDirection, SAVED.actionsPerSecondByDirection);
  assert.deepEqual(
    applied.calibration.sameHandDifferentFingerActionsPerDirectedPair,
    SAVED.sameHandDifferentFingerActionsPerDirectedPair,
  );
  assert.equal(applied.calibration.actionsPerSecond, 4);
  assert.equal(applied.calibration.fingerSpeedUnitsPerSecond.RI === SAVED.fingerSpeedUnitsPerSecond.RI, false);
  assert.equal(SAVED.actionsPerSecond, 5);
});

test('方向別の測定は、測った方向と組だけを置き換える', () => {
  const tasks = [PLAN.byItem.get('direction:R→L')!, PLAN.byItem.get('directed-pair:LI>LM')!];
  const run = playAll(startCalibrationRun('directional', tasks), 200);
  const applied = applyCalibrationRun(SAVED, run, 900);
  assert.ok(applied.ok);
  assert.deepEqual(applied.calibration.actionsPerSecondByDirection, { 'L→R': 5.5, 'R→L': 5 });
  assert.deepEqual(applied.calibration.sameHandDifferentFingerActionsPerDirectedPair, { 'LM>LI': 3.2, 'LI>LM': 5 });
  assert.equal(applied.calibration.actionsPerSecond, SAVED.actionsPerSecond);
  assert.deepEqual(applied.calibration.fingerSpeedUnitsPerSecond, SAVED.fingerSpeedUnitsPerSecond);
  assert.equal(applied.calibration.measuredAt, 900);
});

test('方向別の測定と1項目の測り直しは、保存値が無いと反映できない', () => {
  const directional = playAll(startCalibrationRun('directional', [PLAN.byItem.get('direction:L→R')!]), 200);
  assert.deepEqual(applyCalibrationRun(undefined, directional, 1), { ok: false, reason: 'no-saved-value' });
  const item = playAll(startCalibrationRun('item', [PLAN.byItem.get('actions')!]), 200);
  assert.deepEqual(applyCalibrationRun(undefined, item, 1), { ok: false, reason: 'no-saved-value' });
});

test('1項目の測り直しは、その項目だけを置き換え、代表値を計算し直さない', () => {
  const finger = playAll(startCalibrationRun('item', [PLAN.byItem.get('finger:LI')!]), 500);
  const fingerApplied = applyCalibrationRun(SAVED, finger, 5);
  assert.ok(fingerApplied.ok);
  const distance = PLAN.byItem.get('finger:LI')!.distance!;
  assert.deepEqual(fingerApplied.calibration.fingerSpeedUnitsPerSecond, { LI: distance / 0.5, RI: 9 });
  assert.equal(fingerApplied.calibration.fallbackFingerSpeedUnitsPerSecond, 7);

  const pair = playAll(startCalibrationRun('item', [PLAN.byItem.get('same-hand-pair:LM:LI')!]), 125);
  const pairApplied = applyCalibrationRun(SAVED, pair, 5);
  assert.ok(pairApplied.ok);
  assert.deepEqual(pairApplied.calibration.sameHandDifferentFingerActionsPerSecondByPair, { 'LM:LI': 8, 'LP:LR': 2 });
  assert.equal(pairApplied.calibration.sameHandDifferentFingerActionsPerSecond, 4);

  const actions = playAll(startCalibrationRun('item', [PLAN.byItem.get('actions')!]), 100);
  const actionsApplied = applyCalibrationRun(SAVED, actions, 5);
  assert.ok(actionsApplied.ok);
  assert.equal(actionsApplied.calibration.actionsPerSecond, 10);
});

const ALL_OVERHEADS = { arpeggio: 10, chain: 20, other: 60, repeat: 5, sfb: 15 } as const;

test('通常速度・移動速度の測定は、保存値の連打との差を全て消して知らせる', () => {
  const withOverhead: PlaybackCalibration = { ...SAVED, sameKeyActionsPerSecond: 6, keystrokeOverheadMs: ALL_OVERHEADS };
  const run = playAll(startCalibrationRun('normal', PLAN.normal!), 250);
  const applied = applyCalibrationRun(withOverhead, run, 5);
  assert.ok(applied.ok);
  assert.equal('keystrokeOverheadMs' in applied.calibration, false);
  assert.deepEqual(applied.clearedOverheads, ['arpeggio', 'chain', 'other', 'repeat', 'sfb']);
});

test('通常速度・移動速度の測定は、同じキーを続けて打つ速さを左右の間隔を通した中央値で求める', () => {
  const sameKeyTasks = PLAN.normal!.filter((task) => task.item.kind === 'same-key');
  assert.deepEqual(sameKeyTasks.map((task) => calibrationItemId(task.item)), ['same-key:L', 'same-key:R']);
  assert.deepEqual(sameKeyTasks.map((task) => task.keys), [['f', 'f'], ['j', 'j']]);
  assert.ok(sameKeyTasks.every((task) => task.required === 9 && !task.oneWay));
  const run = playAll(startCalibrationRun('normal', PLAN.normal!), 250);
  const applied = applyCalibrationRun(undefined, run, 1);
  assert.ok(applied.ok);
  assert.equal(applied.calibration.sameKeyActionsPerSecond, 4);
  // 左の9間隔が100ms、右の9間隔が300msなら、18間隔の中央値は200msで5アクション/秒。
  let uneven = startCalibrationRun('normal', PLAN.normal!);
  let atMs = 1000;
  while (!calibrationRunFinished(uneven)) {
    const task = currentCalibrationTask(uneven)!;
    const interval = task.item.kind === 'same-key' ? (task.item.hand === 'L' ? 100 : 300) : 250;
    const expected = expectedCalibrationKey(uneven)!;
    uneven = pressCalibrationKey(uneven, event(expected), atMs, label).run;
    atMs += interval;
  }
  const unevenApplied = applyCalibrationRun(undefined, uneven, 1);
  assert.ok(unevenApplied.ok);
  assert.equal(unevenApplied.calibration.sameKeyActionsPerSecond, 5);
});

test('同じキーを続けて打つ速さの欄は、左右の2項目をまとめて測り直す', () => {
  assert.deepEqual(PLAN.byField.get('same-key')?.map((task) => calibrationItemId(task.item)), ['same-key:L', 'same-key:R']);
  assert.equal(PLAN.byField.get('actions')?.length, 1);
  assert.equal(PLAN.byField.get('direction:L→R')?.length, 1);
});

test('同じキーを続けて打つ速さの測り直しは、続け打ちの差だけを消して知らせる', () => {
  const withOverhead: PlaybackCalibration = { ...SAVED, sameKeyActionsPerSecond: 6, keystrokeOverheadMs: ALL_OVERHEADS };
  const run = playAll(startCalibrationRun('item', PLAN.byField.get('same-key')!), 125);
  const applied = applyCalibrationRun(withOverhead, run, 5);
  assert.ok(applied.ok);
  assert.equal(applied.calibration.sameKeyActionsPerSecond, 8);
  assert.deepEqual(applied.calibration.keystrokeOverheadMs, { arpeggio: 10, chain: 20, other: 60, sfb: 15 });
  assert.deepEqual(applied.clearedOverheads, ['repeat']);
});

test('同じキーを続けて打つ速さを持たない保存値で初めて測ると、通常速度を基準に求めた続け打ちの差も消す', () => {
  const run = playAll(startCalibrationRun('item', PLAN.byField.get('same-key')!), 125);
  const applied = applyCalibrationRun({ ...SAVED, keystrokeOverheadMs: ALL_OVERHEADS }, run, 5);
  assert.ok(applied.ok);
  assert.equal(applied.calibration.sameKeyActionsPerSecond, 8);
  assert.deepEqual(applied.calibration.keystrokeOverheadMs, { arpeggio: 10, chain: 20, other: 60, sfb: 15 });
  assert.deepEqual(applied.clearedOverheads, ['repeat']);
});

test('通常速度の測り直しは、同じキーを続けて打つ速さを持たない保存値では続け打ちの差も消す', () => {
  const run = playAll(startCalibrationRun('item', [PLAN.byItem.get('actions')!]), 200);
  const without = applyCalibrationRun({ ...SAVED, keystrokeOverheadMs: ALL_OVERHEADS }, run, 5);
  assert.ok(without.ok);
  assert.equal('keystrokeOverheadMs' in without.calibration, false);
  assert.deepEqual(without.clearedOverheads, ['arpeggio', 'chain', 'other', 'repeat', 'sfb']);
  // 同じキーを続けて打つ速さを持つ保存値では、続け打ちの差は基準が変わらないので残る。
  const withSameKey = applyCalibrationRun({ ...SAVED, sameKeyActionsPerSecond: 6, keystrokeOverheadMs: ALL_OVERHEADS }, run, 5);
  assert.ok(withSameKey.ok);
  assert.deepEqual(withSameKey.calibration.keystrokeOverheadMs, { repeat: 5 });
  assert.equal(withSameKey.calibration.sameKeyActionsPerSecond, 6);
  assert.deepEqual(withSameKey.clearedOverheads, ['arpeggio', 'chain', 'other', 'sfb']);
});

test('方向別・同手別指の測り直しは構造の種類と同指連続の差を消し、続け打ちの差は残す', () => {
  const withOverhead: PlaybackCalibration = { ...SAVED, keystrokeOverheadMs: ALL_OVERHEADS };
  for (const [scope, id] of [['directional', 'direction:R→L'], ['item', 'same-hand-pair:LM:LI'], ['item', 'directed-pair:LI>LM']] as const) {
    const run = playAll(startCalibrationRun(scope, [PLAN.byItem.get(id)!]), 200);
    const applied = applyCalibrationRun(withOverhead, run, 5);
    assert.ok(applied.ok, id);
    assert.deepEqual(applied.calibration.keystrokeOverheadMs, { repeat: 5 }, id);
    assert.deepEqual(applied.clearedOverheads, ['arpeggio', 'chain', 'other', 'sfb'], id);
  }
});

test('指の移動速度の測り直しは、同指連続の差だけを消す', () => {
  const withOverhead: PlaybackCalibration = { ...SAVED, keystrokeOverheadMs: ALL_OVERHEADS };
  const run = playAll(startCalibrationRun('item', [PLAN.byItem.get('finger:LI')!]), 500);
  const applied = applyCalibrationRun(withOverhead, run, 5);
  assert.ok(applied.ok);
  assert.deepEqual(applied.calibration.keystrokeOverheadMs, { arpeggio: 10, chain: 20, other: 60, repeat: 5 });
  assert.deepEqual(applied.clearedOverheads, ['sfb']);
});

test('消す連打との差を持たない保存値への測定は、消したと知らせない', () => {
  const run = playAll(startCalibrationRun('item', [PLAN.byItem.get('actions')!]), 200);
  const applied = applyCalibrationRun(SAVED, run, 5);
  assert.ok(applied.ok);
  assert.deepEqual(applied.clearedOverheads, []);
  // 指の移動速度の測り直しは、構造の種類の差を持つだけの保存値では何も消さない。
  const finger = playAll(startCalibrationRun('item', [PLAN.byItem.get('finger:LI')!]), 500);
  const kept = applyCalibrationRun({ ...SAVED, keystrokeOverheadMs: { other: 60 } }, finger, 5);
  assert.ok(kept.ok);
  assert.deepEqual(kept.calibration.keystrokeOverheadMs, { other: 60 });
  assert.deepEqual(kept.clearedOverheads, []);
});

test('測った値が保存できる範囲を外れたら、保存値を作らない', () => {
  // 1msごとの打鍵は1000アクション/秒で、上限の40を超える。
  const fast = playAll(startCalibrationRun('item', [PLAN.byItem.get('actions')!]), 1);
  assert.deepEqual(applyCalibrationRun(SAVED, fast, 5), { ok: false, reason: 'invalid-measurement' });
  const fastNormal = playAll(startCalibrationRun('normal', PLAN.normal!), 1);
  assert.deepEqual(applyCalibrationRun(undefined, fastNormal, 5), { ok: false, reason: 'invalid-measurement' });
});

test('途中で止めた進行は保存値に何も足さない', () => {
  let run = startCalibrationRun('normal', PLAN.normal!);
  run = pressCalibrationKey(run, event('f'), 100, label).run;
  run = pressCalibrationKey(run, event('j'), 300, label).run;
  assert.equal(run.results.length, 0);
  assert.deepEqual(applyCalibrationRun(SAVED, run, 5), { ok: false, reason: 'invalid-measurement' });
});
