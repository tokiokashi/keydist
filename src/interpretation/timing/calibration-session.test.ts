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
  fingerRepeatMs: { LI: 1000 / 5, RI: 1000 / 5 },
  fingerMoveMsPerUnit: { LI: 1000 / 8, RI: 1000 / 9 },
  fallbackRepeatMs: 1000 / 5,
  fallbackMoveMsPerUnit: 1000 / 7,
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

function playAllBy(run: CalibrationRun, intervalOf: (task: CalibrationTask) => number): CalibrationRun {
  let current = run;
  let atMs = 1000;
  while (!calibrationRunFinished(current)) {
    const played = playCurrentTask(current, atMs, intervalOf(currentCalibrationTask(current)!));
    current = played.run;
    atMs = played.atMs + 1000;
  }
  return current;
}

function playAll(run: CalibrationRun, intervalMs: number): CalibrationRun {
  return playAllBy(run, () => intervalMs);
}

/** 指ごとの測定項目（続け打ちと往復）。 */
const FINGER_TASKS = PLAN.normal!.filter((task) => task.item.kind === 'finger-repeat' || task.item.kind === 'finger');
/** 1本の指の測定項目を、続け打ちの間隔`repeatMs`・往復の間隔`moveMs`で打つ。 */
const playFinger = (finger: string, repeatMs: number, moveMs: number) =>
  playAllBy(startCalibrationRun('item', PLAN.byField.get(`finger:${finger}`)!), (task) => (task.item.kind === 'finger-repeat' ? repeatMs : moveMs));

test('row-staggeredの測定は通常速度・8指の続け打ちと往復・同手12組、方向別は2方向・24組になる', () => {
  assert.equal(PLAN.normal?.length, 1 + 8 * 2 + 12);
  assert.equal(PLAN.directional?.length, 2 + 24);
  assert.deepEqual(PLAN.normal?.[0]?.keys, ['f', 'j']);
  assert.equal(PLAN.normal?.[0]?.required, 9);
  // 指ごとに、ホームキーを続けて打つ項目、ホームと同じ列の下段のキーを交互に打つ項目の順に並ぶ。
  assert.deepEqual(
    PLAN.normal?.slice(0, 5).map((task) => calibrationItemId(task.item)),
    ['actions', 'finger-repeat:LP', 'finger:LP', 'finger-repeat:LR', 'finger:LR'],
  );
  assert.deepEqual(PLAN.byItem.get('finger-repeat:LI')?.keys, ['f', 'f']);
  assert.equal(PLAN.byItem.get('finger-repeat:LI')?.required, 9);
  assert.deepEqual(PLAN.byItem.get('finger:LI')?.keys, ['f', 'v']);
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
  assert.equal(calibrationItemId({ kind: 'finger-repeat', finger: 'RI' }), 'finger-repeat:RI');
  assert.equal(calibrationItemId({ kind: 'direction', direction: 'L→R' }), 'direction:L→R');
  assert.equal(calibrationItemId({ kind: 'finger', finger: 'LI' }), 'finger:LI');
});

test('案内に出すキーの名前は刻印を使い、無ければキーidにする', () => {
  const legends = new Map([
    ['f', 'と'],
    ['j', ' '],
  ]);
  assert.equal(calibrationKeyLabel(legends, 'f'), 'と');
  assert.equal(calibrationKeyLabel(legends, 'j'), 'J');
  assert.equal(calibrationKeyLabel(legends, 'k'), 'K');
  assert.equal(calibrationKeyLabel(legends, ';'), ';');
});

const ALTERNATING: CalibrationTask = { item: { kind: 'actions' }, keys: ['f', 'j'], required: 3, oneWay: false };
const ONE_WAY: CalibrationTask = { item: { kind: 'direction', direction: 'L→R' }, keys: ['f', 'j'], required: 2, oneWay: true };

test('交互に打つ項目は、最初の打鍵の後の打鍵ごとに間隔を数える', () => {
  let run = startCalibrationRun('item', [ALTERNATING]);
  const presses: [string, number][] = [
    ['f', 100],
    ['j', 300],
    ['f', 600],
  ];
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
  const presses: [string, number][] = [
    ['f', 0],
    ['j', 100],
    ['f', 150],
    ['j', 300],
    ['f', 320],
  ];
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
  const presses: [string, number][] = [
    ['f', 0],
    ['j', 100],
    ['f', 150],
    ['j', 300],
  ];
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

test('通常の測定は、通常速度・指ごとの続け打ちと移動の時間・同手別指の値を測った間隔から作る', () => {
  // 続け打ちの間隔200ms、往復の間隔450ms。
  const run = playAllBy(startCalibrationRun('normal', PLAN.normal!), (task) => {
    if (task.item.kind === 'finger-repeat') return 200;
    return task.item.kind === 'finger' ? 450 : 250;
  });
  const applied = applyCalibrationRun(undefined, run, 777);
  assert.ok(applied.ok);
  const { calibration } = applied;
  assert.equal(calibration.actionsPerSecond, 4);
  assert.equal(calibration.sameHandDifferentFingerActionsPerSecond, 4);
  assert.equal(Object.keys(calibration.sameHandDifferentFingerActionsPerSecondByPair).length, 12);
  assert.equal(calibration.sameHandDifferentFingerActionsPerSecondByPair['LM:LI'], 4);
  assert.equal(Object.keys(calibration.fingerRepeatMs).length, 8);
  assert.equal(Object.keys(calibration.fingerMoveMsPerUnit).length, 8);
  const liDistance = PLAN.byItem.get('finger:LI')!.distance!;
  assert.equal(calibration.fingerRepeatMs.LI, 200);
  // m(f) = (I - r) / 距離
  assert.equal(calibration.fingerMoveMsPerUnit.LI, 250 / liDistance);
  // 測れた指の中央値が代表値。
  assert.equal(calibration.fallbackRepeatMs, 200);
  assert.equal(calibration.fallbackMoveMsPerUnit, 250 / liDistance);
  assert.equal(calibration.actionsPerSecondByDirection, undefined);
  assert.equal(calibration.measuredAt, 777);
});

test('往復の間隔が続け打ちの間隔以下の指は、移動の時間が0になり、測定として受け付ける', () => {
  const run = playAllBy(startCalibrationRun('normal', PLAN.normal!), (task) => (task.item.kind === 'finger' ? 150 : 200));
  const applied = applyCalibrationRun(undefined, run, 1);
  assert.ok(applied.ok);
  assert.equal(applied.calibration.fingerMoveMsPerUnit.LI, 0);
  assert.equal(applied.calibration.fallbackMoveMsPerUnit, 0);
  assert.equal(applied.zeroMoveFingers.length, 8);
});

test('往復の間隔が続け打ちの間隔より長い指は、移動の時間が0になった指に数えない', () => {
  const run = playAllBy(startCalibrationRun('normal', PLAN.normal!), (task) => {
    if (task.item.kind === 'finger-repeat') return 200;
    return task.item.kind === 'finger' ? 450 : 250;
  });
  const applied = applyCalibrationRun(undefined, run, 1);
  assert.ok(applied.ok);
  assert.deepEqual(applied.zeroMoveFingers, []);
});

test('往復の間隔が続け打ちの間隔と等しい指も、移動の時間が0になった指に数える', () => {
  const applied = applyCalibrationRun(SAVED, playFinger('LI', 300, 300), 5);
  assert.ok(applied.ok);
  assert.deepEqual(applied.zeroMoveFingers, ['LI']);
  const longer = applyCalibrationRun(SAVED, playFinger('LI', 300, 301), 5);
  assert.ok(longer.ok);
  assert.deepEqual(longer.zeroMoveFingers, []);
});

test('往復の測定を作れない指は測定項目を持たず、代表値を使う。続け打ちの上乗せは代表値の分も含めた平均でずらす', () => {
  // LIの下段（v）に刻印が無ければ、LIの項目は作らない。別の指のキーで代用しない。
  const legends = new Map(LEGENDS);
  legends.delete('v');
  const plan = planCalibration({ geometry: GEOMETRY, legends });
  assert.equal(plan.byItem.has('finger-repeat:LI'), false);
  assert.equal(plan.byItem.has('finger:LI'), false);
  assert.equal(plan.byField.has('finger:LI'), false);
  assert.equal(plan.normal?.length, 1 + 7 * 2 + 12);
  // RPだけ続け打ちの間隔400ms、他は200ms。往復は同じ間隔。
  const run = playAllBy(startCalibrationRun('normal', plan.normal!), (task) => {
    if (task.item.kind === 'finger-repeat') return task.item.finger === 'RP' ? 400 : 200;
    return task.item.kind === 'finger' ? 300 : 250;
  });
  const applied = applyCalibrationRun({ ...SAVED, keystrokeOverheadMs: { repeat: 5 } }, run, 5);
  assert.ok(applied.ok);
  const { calibration } = applied;
  assert.equal('LI' in calibration.fingerRepeatMs, false);
  assert.equal(calibration.fingerRepeatMs.RP, 400);
  // 測れた7本（400が1本、200が6本）の中央値200が代表値で、LIはそれを使う。
  assert.equal(calibration.fallbackRepeatMs, 200);
  // 8本の平均は(400 + 200 × 7) / 8 = 225。保存値の平均は200。o' = 5 - 25。
  assert.deepEqual(calibration.keystrokeOverheadMs, { repeat: -20 });
  assert.deepEqual(applied.replacedOverheads, ['repeat']);
});

test('通常速度の測定は、保存値の方向別の値を残して他を置き換える', () => {
  const run = playAll(startCalibrationRun('normal', PLAN.normal!), 250);
  const applied = applyCalibrationRun(SAVED, run, 777);
  assert.ok(applied.ok);
  assert.deepEqual(applied.calibration.actionsPerSecondByDirection, SAVED.actionsPerSecondByDirection);
  assert.deepEqual(applied.calibration.sameHandDifferentFingerActionsPerDirectedPair, SAVED.sameHandDifferentFingerActionsPerDirectedPair);
  assert.equal(applied.calibration.actionsPerSecond, 4);
  assert.equal(applied.calibration.fingerMoveMsPerUnit.RI === SAVED.fingerMoveMsPerUnit.RI, false);
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
  assert.deepEqual(applied.calibration.fingerRepeatMs, SAVED.fingerRepeatMs);
  assert.deepEqual(applied.calibration.fingerMoveMsPerUnit, SAVED.fingerMoveMsPerUnit);
  assert.equal(applied.calibration.measuredAt, 900);
});

test('方向別の測定と1項目の測り直しは、保存値が無いと反映できない', () => {
  const directional = playAll(startCalibrationRun('directional', [PLAN.byItem.get('direction:L→R')!]), 200);
  assert.deepEqual(applyCalibrationRun(undefined, directional, 1), { ok: false, reason: 'no-saved-value' });
  const item = playAll(startCalibrationRun('item', [PLAN.byItem.get('actions')!]), 200);
  assert.deepEqual(applyCalibrationRun(undefined, item, 1), { ok: false, reason: 'no-saved-value' });
});

test('1項目の測り直しは、その項目だけを置き換え、代表値を計算し直さない', () => {
  // LIを、続け打ちの間隔400ms・往復の間隔700msで測り直す。
  const finger = playFinger('LI', 400, 700);
  const fingerApplied = applyCalibrationRun(SAVED, finger, 5);
  assert.ok(fingerApplied.ok);
  const distance = PLAN.byItem.get('finger:LI')!.distance!;
  assert.deepEqual(fingerApplied.calibration.fingerRepeatMs, { LI: 400, RI: 200 });
  assert.deepEqual(fingerApplied.calibration.fingerMoveMsPerUnit, { LI: 300 / distance, RI: 1000 / 9 });
  assert.equal(fingerApplied.calibration.fallbackRepeatMs, 200);
  assert.equal(fingerApplied.calibration.fallbackMoveMsPerUnit, 1000 / 7);

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

test('通常の測定は、続け打ちを除く打鍵の上乗せを消して知らせ、続け打ちは基準の平均の変化を引いた値に置き換える', () => {
  // 続け打ちの基準は、8本の指とも200ms。測り直すと250ms。
  const withOverhead: PlaybackCalibration = { ...SAVED, keystrokeOverheadMs: ALL_OVERHEADS };
  const run = playAll(startCalibrationRun('normal', PLAN.normal!), 250);
  const applied = applyCalibrationRun(withOverhead, run, 5);
  assert.ok(applied.ok);
  assert.equal(applied.calibration.fallbackRepeatMs, 250);
  assert.deepEqual(applied.calibration.keystrokeOverheadMs, { repeat: -45 });
  assert.deepEqual(applied.clearedOverheads, ['arpeggio', 'chain', 'other', 'sfb']);
  assert.deepEqual(applied.replacedOverheads, ['repeat']);
});

test('通常の測定は、続け打ちの上乗せを持たない保存値には何も足さない', () => {
  const run = playAll(startCalibrationRun('normal', PLAN.normal!), 250);
  const applied = applyCalibrationRun({ ...SAVED, keystrokeOverheadMs: { other: 60 } }, run, 5);
  assert.ok(applied.ok);
  assert.equal('keystrokeOverheadMs' in applied.calibration, false);
  assert.deepEqual(applied.clearedOverheads, ['other']);
  assert.deepEqual(applied.replacedOverheads, []);
});

test('続け打ちの上乗せは、置き換えた値が保存値の範囲を外れる時だけ消え、測定は保存される', () => {
  const run = playAll(startCalibrationRun('normal', PLAN.normal!), 250);
  // 基準は200msから250msへ50ms遅くなるので、置き換えた値は上乗せより50小さい。
  const below = applyCalibrationRun({ ...SAVED, keystrokeOverheadMs: { repeat: -960, other: 7 } }, run, 5);
  assert.ok(below.ok);
  assert.equal(below.calibration.fallbackRepeatMs, 250);
  assert.equal('keystrokeOverheadMs' in below.calibration, false);
  assert.deepEqual(below.clearedOverheads, ['other', 'repeat']);
  assert.deepEqual(below.replacedOverheads, []);
  // 範囲の下限ちょうどには置き換えられる。
  const edge = applyCalibrationRun({ ...SAVED, keystrokeOverheadMs: { repeat: -950 } }, run, 5);
  assert.ok(edge.ok);
  assert.deepEqual(edge.calibration.keystrokeOverheadMs, { repeat: -1000 });
  // 基準が速くなると置き換えた値は大きくなり、上限を外れる。
  const fast = playAll(startCalibrationRun('item', FINGER_TASKS), 125);
  const above = applyCalibrationRun({ ...SAVED, keystrokeOverheadMs: { repeat: 960, other: 7 } }, fast, 5);
  assert.ok(above.ok);
  assert.equal(above.calibration.fingerRepeatMs.LI, 125);
  assert.deepEqual(above.calibration.keystrokeOverheadMs, { other: 7 });
  assert.deepEqual(above.clearedOverheads, ['repeat']);
});

test('指ごとの測定項目は、続け打ちと往復を1本ずつ続けて測り、1本の指の2項目をまとめて測り直す', () => {
  const repeatTasks = PLAN.normal!.filter((task) => task.item.kind === 'finger-repeat');
  assert.equal(repeatTasks.length, 8);
  assert.ok(repeatTasks.every((task) => task.required === 9 && !task.oneWay && task.keys[0] === task.keys[1]));
  assert.deepEqual(
    PLAN.byField.get('finger:LI')?.map((task) => calibrationItemId(task.item)),
    ['finger-repeat:LI', 'finger:LI'],
  );
  assert.deepEqual(
    PLAN.byField.get('finger-repeat:LI')?.map((task) => calibrationItemId(task.item)),
    ['finger-repeat:LI', 'finger:LI'],
  );
  assert.equal(PLAN.byField.get('actions')?.length, 1);
  assert.equal(PLAN.byField.get('direction:L→R')?.length, 1);
});

test('指ごとの測定は、続け打ちの間隔の中央値をr、往復の間隔の中央値との差を距離で割った値をmにする', () => {
  const distance = PLAN.byItem.get('finger:LI')!.distance!;
  const run = playFinger('LI', 300, 800);
  const applied = applyCalibrationRun(SAVED, run, 1);
  assert.ok(applied.ok);
  assert.equal(applied.calibration.fingerRepeatMs.LI, 300);
  assert.equal(applied.calibration.fingerMoveMsPerUnit.LI, 500 / distance);
});

test('指ごとの測定は、続け打ちの上乗せを、測り直さなかった指の変化を0とした平均の変化の分だけずらす', () => {
  // LIの続け打ちを200msから120msへ。8本の平均は10ms速くなるので、上乗せは10大きくなる。
  const withOverhead: PlaybackCalibration = { ...SAVED, keystrokeOverheadMs: ALL_OVERHEADS };
  const applied = applyCalibrationRun(withOverhead, playFinger('LI', 120, 200), 5);
  assert.ok(applied.ok);
  assert.equal(applied.calibration.keystrokeOverheadMs?.repeat, 15);
  assert.deepEqual(applied.replacedOverheads, ['repeat']);
  // 続け打ちの時間が変わらなければ、置き換えたと知らせない。
  const same = applyCalibrationRun(withOverhead, playFinger('LI', 200, 450), 5);
  assert.ok(same.ok);
  assert.equal(same.calibration.keystrokeOverheadMs?.repeat, 5);
  assert.deepEqual(same.replacedOverheads, []);
});

test('指ごとの測定を全ての指で測り直すと、続け打ちの上乗せは平均の変化の分だけずれる', () => {
  const withOverhead: PlaybackCalibration = { ...SAVED, keystrokeOverheadMs: ALL_OVERHEADS };
  const run = playAll(startCalibrationRun('item', FINGER_TASKS), 125);
  const applied = applyCalibrationRun(withOverhead, run, 5);
  assert.ok(applied.ok);
  // 基準は200msから125msへ75ms速くなるので、置き換えた値は上乗せより75大きい。同指連続の差は消える。
  assert.deepEqual(applied.calibration.keystrokeOverheadMs, { arpeggio: 10, chain: 20, other: 60, repeat: 80 });
  assert.deepEqual(applied.clearedOverheads, ['sfb']);
  assert.deepEqual(applied.replacedOverheads, ['repeat']);
});

test('通常速度の測り直しは、続け打ちの基準を変えないので、続け打ちの差は残る', () => {
  const slow = playAll(startCalibrationRun('item', [PLAN.byItem.get('actions')!]), 400);
  const applied = applyCalibrationRun({ ...SAVED, keystrokeOverheadMs: ALL_OVERHEADS }, slow, 5);
  assert.ok(applied.ok);
  assert.deepEqual(applied.calibration.keystrokeOverheadMs, { repeat: 5 });
  assert.deepEqual(applied.clearedOverheads, ['arpeggio', 'chain', 'other', 'sfb']);
  assert.deepEqual(applied.replacedOverheads, []);
});

test('方向別・同手別指の測り直しは構造の種類と同指連続の差を消し、続け打ちの差は残す', () => {
  const withOverhead: PlaybackCalibration = { ...SAVED, keystrokeOverheadMs: ALL_OVERHEADS };
  for (const [scope, id] of [
    ['directional', 'direction:R→L'],
    ['item', 'same-hand-pair:LM:LI'],
    ['item', 'directed-pair:LI>LM'],
  ] as const) {
    const run = playAll(startCalibrationRun(scope, [PLAN.byItem.get(id)!]), 200);
    const applied = applyCalibrationRun(withOverhead, run, 5);
    assert.ok(applied.ok, id);
    assert.deepEqual(applied.calibration.keystrokeOverheadMs, { repeat: 5 }, id);
    assert.deepEqual(applied.clearedOverheads, ['arpeggio', 'chain', 'other', 'sfb'], id);
  }
});

test('指ごとの測り直しは、同指連続の差だけを消す', () => {
  const withOverhead: PlaybackCalibration = { ...SAVED, keystrokeOverheadMs: ALL_OVERHEADS };
  const applied = applyCalibrationRun(withOverhead, playFinger('LI', 200, 450), 5);
  assert.ok(applied.ok);
  assert.deepEqual(applied.calibration.keystrokeOverheadMs, { arpeggio: 10, chain: 20, other: 60, repeat: 5 });
  assert.deepEqual(applied.clearedOverheads, ['sfb']);
});

test('消す打鍵の上乗せを持たない保存値への測定は、消したと知らせない', () => {
  const run = playAll(startCalibrationRun('item', [PLAN.byItem.get('actions')!]), 200);
  const applied = applyCalibrationRun(SAVED, run, 5);
  assert.ok(applied.ok);
  assert.deepEqual(applied.clearedOverheads, []);
  // 指ごとの測り直しは、構造の種類の差を持つだけの保存値では何も消さない。
  const kept = applyCalibrationRun({ ...SAVED, keystrokeOverheadMs: { other: 60 } }, playFinger('LI', 200, 450), 5);
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

const SIDE_OVERHEADS = {
  arpeggio: 10,
  'arpeggio-within': 8,
  'arpeggio-boundary': 12,
  chain: 20,
  'chain-within': 18,
  'chain-boundary': 22,
  other: 60,
  'other-within': 40,
  'other-boundary': 70,
  repeat: 5,
  sfb: 15,
} as const;

test('通常速度・移動速度の測定は、かなの中・かなの境目の値も、分けない値と同じく消す', () => {
  const withOverhead: PlaybackCalibration = { ...SAVED, keystrokeOverheadMs: SIDE_OVERHEADS };
  const run = playAll(startCalibrationRun('normal', PLAN.normal!), 250);
  const applied = applyCalibrationRun(withOverhead, run, 5);
  assert.ok(applied.ok);
  assert.deepEqual(applied.calibration.keystrokeOverheadMs, { repeat: -45 });
  assert.deepEqual(applied.clearedOverheads, [
    'arpeggio',
    'arpeggio-within',
    'arpeggio-boundary',
    'chain',
    'chain-within',
    'chain-boundary',
    'other',
    'other-within',
    'other-boundary',
    'sfb',
  ]);
});

test('分けない値を持たず、かなの中・かなの境目の値だけを持つ保存値も、基準が変わる測定で消える', () => {
  const sidesOnly: PlaybackCalibration = { ...SAVED, keystrokeOverheadMs: { 'other-within': 40, 'other-boundary': 70 } };
  const run = playAll(startCalibrationRun('item', [PLAN.byItem.get('actions')!]), 100);
  const applied = applyCalibrationRun(sidesOnly, run, 5);
  assert.ok(applied.ok);
  assert.equal('keystrokeOverheadMs' in applied.calibration, false);
  assert.deepEqual(applied.clearedOverheads, ['other-within', 'other-boundary']);
});

test('指ごとの測り直しは、かなの中・かなの境目の値を消さない', () => {
  const withOverhead: PlaybackCalibration = { ...SAVED, keystrokeOverheadMs: SIDE_OVERHEADS };
  const run = playAll(startCalibrationRun('item', FINGER_TASKS), 125);
  const applied = applyCalibrationRun(withOverhead, run, 5);
  assert.ok(applied.ok);
  const { sfb: _sfb, ...others } = SIDE_OVERHEADS;
  assert.deepEqual(applied.calibration.keystrokeOverheadMs, { ...others, repeat: 80 });
  assert.deepEqual(applied.clearedOverheads, ['sfb']);
});
