import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { generateTrace } from '#trace/generate.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { analyzeStrokeStructure } from '../structure/aggregate.ts';
import {
  playbackFingerPositionKeys,
  playbackPreparedFingerPositionKeys,
  playbackTimingSchedule,
} from './playback.ts';

const geometry = buildGeometry('row-staggered');
const layout = LAYOUT_BY_ID.get('qwerty')!;

test('準備時間0では従来の指位置表示と一致する', () => {
  const trace = generateTrace('fjg', layout, geometry);
  const analysis = analyzeStrokeStructure(trace.strokes);
  const current = playbackFingerPositionKeys(trace.strokes[1], geometry);
  const schedule = playbackTimingSchedule(analysis, 1, true);
  const prepared = playbackPreparedFingerPositionKeys(
    analysis,
    schedule,
    2,
    0,
    geometry,
    0,
    1,
  );

  assert.deepEqual([...prepared], [...current]);
});

test('空き時間があれば次の実Press位置へ打鍵前に到着する', () => {
  const trace = generateTrace('fjg', layout, geometry);
  const analysis = analyzeStrokeStructure(trace.strokes);
  const schedule = playbackTimingSchedule(analysis, 1, true);

  assert.deepEqual(schedule.map((step) => step.endMs), [1000, 2000, 3000]);

  const prepared = playbackPreparedFingerPositionKeys(
    analysis,
    schedule,
    2,
    0,
    geometry,
    1,
    1,
  );

  // LIは1打目fのあと2打目では空いている。gまで1uなので、
  // T=3000ms, π=1000ms, move=1000ms => arrival=2000msとなり先行到着できる。
  assert.equal(prepared.get('g'), 'LI');
  assert.equal(prepared.has('f'), false);
});

test('held-trigger継続だけのparticipationは次のPressとして扱わない', () => {
  const trace = generateTrace('fjg', layout, geometry);
  const strokes = trace.strokes.map((stroke) => ({
    ...stroke,
    participations: stroke.participations.map((participation) => ({ ...participation })),
  }));
  strokes[2] = {
    ...strokes[2],
    participations: strokes[2].participations.map((participation) =>
      participation.finger === 'LI'
        ? { ...participation, roles: ['held-trigger'] as const }
        : participation),
  };
  const analysis = analyzeStrokeStructure(strokes);
  const schedule = playbackTimingSchedule(analysis, 1, true);

  const prepared = playbackPreparedFingerPositionKeys(
    analysis,
    schedule,
    2,
    0,
    geometry,
    10,
    1,
  );

  assert.equal(prepared.get('f'), 'LI');
  assert.equal(prepared.has('g'), false);
});


test('held-trigger継続中は前動作が空いたとみなさず、間に合わなければPress時刻まで保持する', () => {
  const trace = generateTrace('fjg', layout, geometry);
  const strokes = trace.strokes.map((stroke) => ({
    ...stroke,
    positions: { ...stroke.positions },
    participations: stroke.participations.map((participation) => ({ ...participation })),
  }));
  const liParticipation = strokes[0].participations.find((participation) => participation.finger === 'LI');
  assert.ok(liParticipation);

  // 2打目の間もLIがfを保持している状況を作る。
  // 次の実Pressは3打目のgだが、LIが空くのは2打目終了時なので、
  // f→gの1u移動はT=3000msちょうどまで掛かり、先行到着できない。
  strokes[1] = {
    ...strokes[1],
    positions: { ...strokes[1].positions, LI: strokes[0].positions.LI },
    participations: [
      ...strokes[1].participations,
      { ...liParticipation, roles: ['held-trigger'] as const, holdPhase: 'continue' as const },
    ],
  };
  const analysis = analyzeStrokeStructure(strokes);
  const schedule = playbackTimingSchedule(analysis, 1, true);

  const justBeforePress = playbackPreparedFingerPositionKeys(
    analysis,
    schedule,
    2,
    999,
    geometry,
    10,
    1,
  );
  assert.equal(justBeforePress.get('f'), 'LI');
  assert.equal(justBeforePress.has('g'), false);

  const atPress = playbackPreparedFingerPositionKeys(
    analysis,
    schedule,
    3,
    0,
    geometry,
    10,
    1,
  );
  assert.equal(atPress.get('g'), 'LI');
  assert.equal(atPress.has('f'), false);
});
