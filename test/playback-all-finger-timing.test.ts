import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_FINGERS,
  buildGeometry,
  type Finger,
  type Key,
  type Point,
} from '../src/geometry.ts';
import type { Press, Stroke, StrokeParticipation } from '../src/evaluate.ts';
import { analyzeStrokeStructure } from '../src/analysis-aggregate.ts';
import {
  advancePlayback,
  createPlaybackState,
  playbackRecentActionsPerSecond,
  playbackTimingSchedule,
} from '../src/playback.ts';

const geometry = buildGeometry('row-staggered');

const at = (finger: Finger, dx = 0, dy = 0): Point => ({
  x: geometry.homes[finger].x + dx,
  y: geometry.homes[finger].y + dy,
});

const key = (id: string, finger: Finger, point: Point): Key => ({
  id,
  finger,
  x: point.x,
  y: point.y,
  row: 2,
  col: 0,
});

const press = (
  finger: Finger,
  point: Point,
  options: { id?: string; sfb?: boolean; distance?: number } = {},
): Press => ({
  finger,
  keys: [key(options.id ?? `k-${finger}`, finger, point)],
  target: point,
  gap: 1,
  distance: options.distance ?? 0,
  sfb: options.sfb ?? false,
});

const positions = (
  presses: readonly Press[],
  extra: readonly StrokeParticipation[] = [],
): Stroke['positions'] => {
  const result = Object.fromEntries(
    ALL_FINGERS.map((finger) => [finger, { ...geometry.homes[finger] }]),
  ) as Stroke['positions'];
  for (const p of presses) result[p.finger] = { ...p.target };
  for (const participation of extra) {
    const first = participation.keys[0];
    if (first) result[participation.finger] = { x: first.x, y: first.y };
  }
  return result;
};

const stroke = (
  index: number,
  presses: Press[],
  extra: StrokeParticipation[] = [],
): Stroke => ({
  index,
  char: String(index),
  inputChar: String(index),
  inputIndex: index,
  layerId: 'single',
  classifications: [],
  triggerKeys: [],
  pairedTriggerKeys: [],
  participations: [
    ...presses.map((p): StrokeParticipation => ({
      hand: p.finger.startsWith('L') ? 'left' : 'right',
      finger: p.finger,
      keys: p.keys,
      roles: ['output'],
    })),
    ...extra,
  ],
  presses,
  distance: presses.reduce((sum, p) => sum + p.distance, 0),
  positions: positions(presses, extra),
});

const ends = (schedule: ReturnType<typeof playbackTimingSchedule>) =>
  schedule.map((step) => Math.round(step.endMs));

test('全指律速OFFは従来のbase scheduleと完全一致する', () => {
  const analysis = analyzeStrokeStructure([
    stroke(0, [press('LI', at('LI'))]),
    stroke(1, [press('RI', at('RI'))]),
    stroke(2, [press('LI', at('LI', 3))]),
  ]);

  const base = playbackTimingSchedule(analysis, 10, false);
  const explicitOff = playbackTimingSchedule(
    analysis,
    10,
    false,
    undefined,
    1,
    { allFingerMovementDelay: false, geometry },
  );

  assert.deepEqual(explicitOff, base);
  assert.deepEqual(ends(base), [100, 200, 300]);
});

test('全指律速ONは物理的に間に合わない移動だけ必要量を延長する', () => {
  const analysis = analyzeStrokeStructure([
    stroke(0, [press('LI', at('LI'))]),
    stroke(1, [press('RI', at('RI'))]),
    stroke(2, [press('LI', at('LI', 3))]),
  ]);

  const schedule = playbackTimingSchedule(
    analysis,
    10,
    false,
    undefined,
    1,
    { allFingerMovementDelay: true, geometry },
  );

  // baseは各100ms。LIは1打目終了(100ms)から3uを10u/sで移動するため、
  // 3打目は300msでは間に合わず400msまで延びる。
  assert.deepEqual(ends(schedule), [100, 200, 400]);
  assert.equal(
    playbackRecentActionsPerSecond(analysis, 3, 10, false, 3, undefined, 1, schedule),
    7.5,
  );

  const state = {
    ...createPlaybackState(10, false),
    cursor: 2,
    playing: true,
    elapsedMs: 150,
  };
  assert.equal(advancePlayback(state, 0, analysis).cursor, 3);
  assert.equal(advancePlayback(state, 0, analysis, schedule).cursor, 2);
});

test('同時押しの複数指移動は直列加算せず最も遅い指だけで律速する', () => {
  const analysis = analyzeStrokeStructure([
    stroke(0, [
      press('LI', at('LI', 3)),
      press('RI', at('RI', 2)),
    ]),
  ]);

  const schedule = playbackTimingSchedule(
    analysis,
    10,
    false,
    undefined,
    1,
    { allFingerMovementDelay: true, geometry },
  );

  // 3u=300ms と 2u=200ms は並列移動。合計500msではなくmaxの300ms。
  assert.deepEqual(ends(schedule), [300]);
});

test('sameFingerDelayと全指律速は加算せず同じ移動制約のmaxを取る', () => {
  const analysis = analyzeStrokeStructure([
    stroke(0, [press('LI', at('LI'))]),
    stroke(1, [press('LI', at('LI', 3), { sfb: true, distance: 3 })]),
  ]);

  const base = playbackTimingSchedule(analysis, 10, true);
  const constrained = playbackTimingSchedule(
    analysis,
    10,
    true,
    undefined,
    1,
    { allFingerMovementDelay: true, geometry },
  );

  // 2打目は既存sameFingerDelayだけで300ms必要。全指制約を足し算しない。
  assert.deepEqual(ends(base), [100, 400]);
  assert.deepEqual(constrained, base);
});

test('held-trigger継続中の指はStroke終了まで空いたとみなさない', () => {
  const liHomeKey = key('held-li', 'LI', at('LI'));
  const held: StrokeParticipation = {
    hand: 'left',
    finger: 'LI',
    keys: [liHomeKey],
    roles: ['held-trigger'],
    holdPhase: 'continue',
  };
  const analysis = analyzeStrokeStructure([
    stroke(0, [press('LI', at('LI'))]),
    stroke(1, [press('RI', at('RI'))], [held]),
    stroke(2, [press('LI', at('LI', 1))]),
  ]);
  const withoutHoldAnalysis = analyzeStrokeStructure([
    stroke(0, [press('LI', at('LI'))]),
    stroke(1, [press('RI', at('RI'))]),
    stroke(2, [press('LI', at('LI', 1))]),
  ]);
  const calibration = {
    actionsPerSecond: 10,
    sameHandDifferentFingerActionsPerSecond: 10,
    sameHandDifferentFingerActionsPerSecondByPair: {},
    fingerSpeedUnitsPerSecond: { LI: 5 },
    fallbackFingerSpeedUnitsPerSecond: 10,
    measuredAt: 1,
  };

  const heldSchedule = playbackTimingSchedule(
    analysis,
    10,
    false,
    calibration,
    1,
    { allFingerMovementDelay: true, geometry },
  );
  const freeSchedule = playbackTimingSchedule(
    withoutHoldAnalysis,
    10,
    false,
    calibration,
    1,
    { allFingerMovementDelay: true, geometry },
  );

  // LIが2打目まで保持される場合、1u/5u/s=200msの移動開始は200ms以降。
  assert.deepEqual(ends(freeSchedule), [100, 200, 300]);
  assert.deepEqual(ends(heldSchedule), [100, 200, 400]);
});
