import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '../src/geometry.ts';
import { evaluate } from '../src/evaluate.ts';
import { LAYOUT_BY_ID } from '../src/layouts/index.ts';
import { analyzeStrokeStructure } from '../src/analysis-aggregate.ts';
import {
  playbackFingerPositionKeys,
  playbackPreparedFingerPositionKeys,
  playbackTimingSchedule,
} from '../src/playback.ts';

const geometry = buildGeometry('row-staggered');
const layout = LAYOUT_BY_ID.get('qwerty')!;

test('準備時間0では従来の指位置表示と一致する', () => {
  const trace = evaluate('fjg', layout, geometry);
  const analysis = analyzeStrokeStructure(trace.strokes);
  const current = playbackFingerPositionKeys(trace.strokes[1], geometry);
  const prepared = playbackPreparedFingerPositionKeys(
    analysis,
    2,
    0,
    geometry,
    0,
    1,
    true,
  );

  assert.deepEqual([...prepared], [...current]);
});

test('空き時間があれば次の実Press位置へ打鍵前に到着する', () => {
  const trace = evaluate('fjg', layout, geometry);
  const analysis = analyzeStrokeStructure(trace.strokes);
  const schedule = playbackTimingSchedule(analysis, 1, true);

  assert.deepEqual(schedule.map((step) => step.endMs), [1000, 2000, 3000]);

  const prepared = playbackPreparedFingerPositionKeys(
    analysis,
    2,
    0,
    geometry,
    1,
    1,
    true,
  );

  // LIは1打目fのあと2打目では空いている。gまで1uなので、
  // T=3000ms, π=1000ms, move=1000ms => arrival=2000msとなり先行到着できる。
  assert.equal(prepared.get('g'), 'LI');
  assert.equal(prepared.has('f'), false);
});

test('held-trigger継続だけのparticipationは次のPressとして扱わない', () => {
  const trace = evaluate('fjg', layout, geometry);
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

  const prepared = playbackPreparedFingerPositionKeys(
    analysis,
    2,
    0,
    geometry,
    10,
    1,
    true,
  );

  assert.equal(prepared.get('f'), 'LI');
  assert.equal(prepared.has('g'), false);
});
