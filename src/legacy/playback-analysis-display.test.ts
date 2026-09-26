import test from 'node:test';
import assert from 'node:assert/strict';
import type { Finger, Key } from '#input/shapes/geometry.ts';
import type { Press, Stroke, StrokeParticipation } from '#trace/evaluate.ts';
import { analyzeStrokeStructure } from '#interpretation/structure/aggregate.ts';
import { DEFAULT_CHAIN_POLICY } from '#interpretation/structure/chain.ts';
import { DEFAULT_ARPEGGIO_POLICY } from '#interpretation/structure/arpeggio.ts';
import {
  playbackAnalysisArpeggioMotions,
  playbackAnalysisArpeggioOrders,
  playbackAnalysisChainMotions,
  playbackAnalysisChainOrders,
  playbackRedirectWindows,
  playbackStrokeAnnotation,
} from './playback-analysis-display.ts';

const key = (id: string, finger: Finger, x: number): Key => ({
  id, finger, x, y: 2, row: 2, col: 0,
});
const press = (finger: Finger, id: string, x: number, sfb = false): Press => ({
  finger,
  keys: [key(id, finger, x)],
  target: { x, y: 2 },
  gap: 1,
  distance: 0,
  sfb,
});
const participation = (p: Press): StrokeParticipation => ({
  hand: p.finger.startsWith('L') ? 'left' : 'right',
  finger: p.finger,
  keys: p.keys,
  roles: ['output'],
});
const stroke = (index: number, p: Press): Stroke => ({
  index,
  char: String(index),
  inputChar: String(index),
  inputIndex: index,
  aggregationGroupId: 'single',
  classifications: [],
  triggerKeys: [],
  pairedTriggerKeys: [],
  participations: [participation(p)],
  presses: [p],
  distance: 0,
  positions: {} as Stroke['positions'],
});
const keepSameFinger = { ...DEFAULT_CHAIN_POLICY, breakOnSameFinger: false };

const simultaneousThumbShiftStroke = (
  index: number,
  output: Press,
  thumb: Press,
): Stroke => ({
  ...stroke(index, output),
  triggerKeys: [thumb.keys[0].id],
  participations: [
    participation(output),
    {
      hand: 'left',
      finger: thumb.finger,
      keys: thumb.keys,
      roles: ['trigger'],
    },
  ],
  presses: [output, thumb],
});

test('Analysis Chainを再分類せず表示順とmotionへ投影する', () => {
  const analysis = analyzeStrokeStructure([
    stroke(0, press('LP', 'a', 1)),
    stroke(1, press('LR', 's', 2)),
    stroke(2, press('LM', 'd', 3)),
  ], keepSameFinger);

  const displays = playbackAnalysisChainOrders(analysis, 2);
  assert.equal(displays.length, 1);
  assert.equal(displays[0].sourceIndex, analysis.chains[0].chainIndex);
  assert.deepEqual([...displays[0].orders], [['a', 1], ['s', 2], ['d', 3]]);
  assert.deepEqual(playbackAnalysisChainMotions(analysis, 2), [{
    fromKey: 'a',
    toKeys: ['s'],
    finger: 'LR',
  }]);
});

test('Chain動的表示はsimultaneous親指triggerを順序・motionから除外する', () => {
  const analysis = analyzeStrokeStructure([
    stroke(0, press('LP', 'a', 1)),
    simultaneousThumbShiftStroke(
      1,
      press('LR', 's', 2),
      press('LT', 'thumb-l', 0),
    ),
    stroke(2, press('LM', 'd', 3)),
  ], keepSameFinger);

  const displays = playbackAnalysisChainOrders(analysis, 2);
  assert.equal(displays.length, 1);
  assert.deepEqual([...displays[0].orders], [['a', 1], ['s', 2], ['d', 3]]);
  assert.equal(displays[0].orders.has('thumb-l'), false);
  assert.deepEqual(playbackAnalysisChainMotions(analysis, 2), [{
    fromKey: 'a',
    toKeys: ['s'],
    finger: 'LR',
  }]);
});

test('overlapするArpeggioSpanは表示projectionでも別sourceのまま保持する', () => {
  const analysis = analyzeStrokeStructure([
    stroke(0, press('LP', 'a', 1)),
    stroke(1, press('LR', 's', 2)),
    stroke(2, press('LR', 'w', 2, true)),
    stroke(3, press('LP', 'q', 1)),
  ], keepSameFinger, {
    ...DEFAULT_ARPEGGIO_POLICY,
    bridgeSameFinger: true,
  });

  assert.equal(analysis.arpeggioSpans.length, 2);
  const displays = playbackAnalysisArpeggioOrders(analysis, 3);
  assert.equal(displays.length, 2);
  assert.deepEqual(displays.map((entry) => entry.sourceIndex), [0, 1]);
  assert.ok(displays.every((entry) => entry.orders.size > 0));
  assert.equal(playbackAnalysisArpeggioMotions(analysis, 3).length, 2);
});

test('adjacentなArpeggioSpanはprojectionでも別sourceのまま切り替わる', () => {
  const analysis = analyzeStrokeStructure([
    stroke(0, press('LP', 'a', 1)),
    stroke(1, press('LR', 's', 2)),
    stroke(2, press('LM', 'd', 3)),
    stroke(3, press('LM', 'e', 3, true)),
    stroke(4, press('LP', 'q', 1)),
  ], keepSameFinger);

  assert.deepEqual(
    analysis.arpeggioSpans.map((span) => [
      span.startStrokeIndex,
      span.endStrokeIndex,
      span.direction,
    ]),
    [
      [0, 3, 'inward'],
      [3, 5, 'outward'],
    ],
  );

  const beforeBoundary = playbackAnalysisArpeggioOrders(analysis, 3);
  const afterBoundary = playbackAnalysisArpeggioOrders(analysis, 4);
  assert.deepEqual(beforeBoundary.map((entry) => entry.sourceIndex), [0]);
  assert.deepEqual(afterBoundary.map((entry) => entry.sourceIndex), [1]);
  assert.equal(
    analysis.arpeggioSpans.some((span) =>
      span.startStrokeIndex === 0 && span.endStrokeIndex === 5),
    false,
  );
});

test('RedirectEventはpivotを中心に3 Stroke windowとして参照する', () => {
  const analysis = analyzeStrokeStructure([
    stroke(0, press('LP', 'a', 1)),
    stroke(1, press('LM', 'd', 3)),
    stroke(2, press('LR', 's', 2)),
  ], keepSameFinger);

  assert.equal(analysis.redirects.length, 1);
  assert.deepEqual(playbackRedirectWindows(analysis, 2), [{
    redirectIndex: 0,
    startStrokeIndex: 0,
    endStrokeIndex: 3,
    pivotStrokeIndex: 1,
  }]);
});

test('Stroke単位の簡易表示はAnnotationをそのまま参照する', () => {
  const analysis = analyzeStrokeStructure([
    stroke(0, press('LP', 'a', 1)),
    stroke(1, press('LM', 'd', 3)),
    stroke(2, press('LR', 's', 2)),
  ], keepSameFinger);

  assert.equal(playbackStrokeAnnotation(analysis, 2), analysis.annotations[1]);
  assert.equal(playbackStrokeAnnotation(analysis, 2)?.inRedirect, true);
});
