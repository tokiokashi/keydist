import assert from 'node:assert/strict';
import test from 'node:test';
import type { SentenceTap } from '../timing/sentence-measurement.ts';
import {
  recordGapPoints,
  recordPhraseGapTable,
  differingConditionKeys,
  recordTargetMatches,
  scalarRecordMismatches,
  strokeGaps,
  type RecordCurrentFacts,
  type RecordStrokeFact,
} from './keystroke-gaps.ts';
import type { KeystrokeRecord } from './keystroke-record.ts';

function taps(times: readonly number[], extra: { readonly unclean?: readonly number[]; readonly completed?: readonly number[] } = {}): SentenceTap[] {
  return times.map((atMs, index) => ({
    atMs,
    clean: !(extra.unclean ?? []).includes(index),
    ...((extra.completed ?? []).includes(index) ? { outputCompleted: true } : {}),
  }));
}

function fact(end: number, kanaStart = end, kanaEnd = end, adjoinsPunctuation = false): RecordStrokeFact {
  return { end, kanaStart, kanaEnd, adjoinsPunctuation };
}

test('最初のストロークは間隔を持たず、次からは直前との時刻の差になる', () => {
  assert.deepEqual(strokeGaps(taps([0, 100, 250, 260])), [null, 100, 150, 10]);
});

test('違うキーを押したストロークの間隔は数えず、欠けにする', () => {
  assert.deepEqual(strokeGaps(taps([0, 100, 250, 400], { unclean: [2] })), [null, 100, null, 150]);
});

test('出力の文字の読み方で完了したストロークは、そのストロークと直後のストロークの間隔を数えない', () => {
  assert.deepEqual(strokeGaps(taps([0, 100, 250, 400, 520], { completed: [2] })), [null, 100, null, null, 120]);
  // 最初のストロークが完了していても、直後の間隔を数えない
  assert.deepEqual(strokeGaps(taps([0, 100, 250], { completed: [0] })), [null, null, 150]);
});

test('eごとの値は、そのeを最初に持つストロークの間隔になる', () => {
  // 位置3は2打（ka）で、2打目の間隔は値に入れない
  const points = recordGapPoints([fact(2), fact(3), fact(3), fact(4)], taps([0, 300, 380, 430]));
  assert.deepEqual(points.positions, [2, 3, 4]);
  assert.deepEqual(points.values, [null, 300, 50]);
});

test('eの最初のストロークの間隔が欠けなら、そのeの値も欠けにする（2打目の間隔があっても使わない）', () => {
  const points = recordGapPoints([fact(2), fact(3), fact(3)], taps([0, 300, 380], { unclean: [1] }));
  assert.deepEqual(points.positions, [2, 3]);
  assert.deepEqual(points.values, [null, null]);
});

test('同じeが離れて再び出ても、値は最初の出現のものだけで、点は1つ', () => {
  const points = recordGapPoints([fact(2), fact(3), fact(2), fact(4)], taps([0, 100, 250, 400]));
  assert.deepEqual(points.positions, [2, 3, 4]);
  assert.deepEqual(points.values, [null, 100, 150]);
});

test('句読点を打つストロークとその直後のストロークの間隔は、図では欠けにせず数える', () => {
  const points = recordGapPoints([fact(0), fact(1, 1, 1, true), fact(2, 2, 2, true), fact(3)], taps([0, 400, 900, 1000]));
  assert.deepEqual(points.values, [null, 400, 500, 100]);
});

test('文節の区切りの直後とそれ以外の表は、かなを打ち始めるストロークの生の間隔だけを数える', () => {
  // かな0の1打目(0)、かな0の2打目(0)、かな1(1)、かな2(2)=区切り直後、かな3(3)
  const facts = [fact(0, 0, 0), fact(0, 0, 0), fact(1, 1, 1), fact(2, 2, 2), fact(3, 3, 3)];
  const table = recordPhraseGapTable(facts, taps([0, 60, 200, 700, 800]), [2]);
  // かなの中の2打目(60)は数えない。区切り直後は700-200=500、それ以外は200-60=140と100
  assert.deepEqual(table.after, { count: 1, quartileMeanMs: 500, meanMs: 500 });
  assert.equal(table.others.count, 2);
  assert.equal(table.others.meanMs, 120);
  assert.equal(table.others.quartileMeanMs, 120);
});

test('表は、違うキー・出力の文字の読み方で完了したストローク・句読点の前後を数えない', () => {
  const facts = [fact(0), fact(1), fact(2), fact(3), fact(4, 4, 4, true), fact(5, 5, 5, true), fact(6), fact(7)];
  const table = recordPhraseGapTable(facts, taps([0, 100, 250, 400, 700, 1300, 1400, 1500], { unclean: [1], completed: [3] }), [6]);
  // 1:違うキー、3と4:完了したストロークとその直後、4と5:句読点の前後 → 数えるのは2・6・7
  assert.equal(table.after.count, 1);
  assert.equal(table.after.meanMs, 100);
  assert.equal(table.others.count, 2);
  assert.equal(table.others.meanMs, (150 + 100) / 2);
});

test('群の打数が0なら、値を持たない。四分位平均は4で割った数だけ両端から除いた平均', () => {
  const none = recordPhraseGapTable([fact(0), fact(1)], taps([0, 100]), []);
  assert.deepEqual(none.after, { count: 0 });
  assert.equal(none.others.count, 1);
  const facts = [0, 1, 2, 3, 4].map((at) => fact(at));
  const table = recordPhraseGapTable(facts, taps([0, 10, 110, 130, 1130]), []);
  // 間隔は10・100・20・1000。両端を1つずつ除くと(20+100)/2
  assert.equal(table.others.quartileMeanMs, 60);
  assert.equal(table.others.meanMs, 282.5);
});

const RECORD = {
  target: { kind: 'setup', id: 's1' },
  shapeId: 'row-staggered',
  fingerAssignmentId: 'standard',
  modelVersion: 3,
  conditions: { n: 3 },
  text: { digest: 'aaaa' },
  range: { start: 0, end: 10, digest: 'bbbb' },
} as unknown as KeystrokeRecord;

const CURRENT: RecordCurrentFacts = {
  shapeId: 'row-staggered',
  fingerAssignmentId: 'standard',
  conditions: { n: 3 },
  modelVersion: 3,
  textDigest: 'aaaa',
  rangeDigestOf: () => 'bbbb',
};

test('食い違いの判定は、項目ごとに独立に違いを挙げる', () => {
  assert.deepEqual(scalarRecordMismatches(RECORD, CURRENT), []);
  assert.deepEqual(scalarRecordMismatches(RECORD, { ...CURRENT, shapeId: 'ortho' }), ['shape']);
  assert.deepEqual(scalarRecordMismatches(RECORD, { ...CURRENT, fingerAssignmentId: 'x' }), ['fingerAssignment']);
  assert.deepEqual(scalarRecordMismatches(RECORD, { ...CURRENT, conditions: { n: 4 } }), ['conditions']);
  assert.deepEqual(scalarRecordMismatches(RECORD, { ...CURRENT, modelVersion: 4 }), ['version']);
  assert.deepEqual(scalarRecordMismatches(RECORD, { ...CURRENT, shapeId: 'ortho', modelVersion: 4, conditions: { n: 4 } }), [
    'shape',
    'conditions',
    'version',
  ]);
});

test('テキストが違う時は範囲を重ねて挙げない。テキストが同じで範囲の本文が違う時だけ範囲を挙げる', () => {
  assert.deepEqual(scalarRecordMismatches(RECORD, { ...CURRENT, textDigest: 'zzzz', rangeDigestOf: () => 'other' }), ['text']);
  assert.deepEqual(scalarRecordMismatches(RECORD, { ...CURRENT, rangeDigestOf: () => 'other' }), ['range']);
  assert.deepEqual(scalarRecordMismatches(RECORD, { ...CURRENT, rangeDigestOf: () => undefined }), ['range']);
});

test('記録の対象は、配列はid、Setupはidで当てる', () => {
  assert.equal(recordTargetMatches(RECORD, { kind: 'setup', setupId: 's1' }), true);
  assert.equal(recordTargetMatches(RECORD, { kind: 'setup', setupId: 's2' }), false);
  assert.equal(recordTargetMatches(RECORD, { kind: 'layout', layoutId: 's1' }), false);
  const layout = { target: { kind: 'layout', id: 'qwerty' } } as unknown as KeystrokeRecord;
  assert.equal(recordTargetMatches(layout, { kind: 'layout', layoutId: 'qwerty' }), true);
  assert.equal(recordTargetMatches(layout, { kind: 'setup', setupId: 'qwerty' }), false);
});

test('値が違う条件の項目を挙げる。項目の並びと入れ子の並びは問わない', () => {
  assert.deepEqual(differingConditionKeys({ a: 1, b: { x: 1, y: 2 }, c: true }, { c: true, b: { y: 2, x: 1 }, a: 2 }), ['a']);
  assert.deepEqual(differingConditionKeys({ a: 1 }, { a: 1, comboSet: { name: 'x' } }), ['comboSet']);
  assert.deepEqual(differingConditionKeys({ a: 1 }, { a: 1 }), []);
});
