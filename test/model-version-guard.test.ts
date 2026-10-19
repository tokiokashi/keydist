import assert from 'node:assert/strict';
import test from 'node:test';
import { changedCaseIds, modelVersionBumpError } from '../scripts/model-version-guard.ts';

// fixtureを作り直す時に MODEL_VERSION の上げ忘れを拒む判定の検査。

type Cases = Parameters<typeof changedCaseIds>[0]['cases'];

function caseOf(id: string, totalUnits: number): Cases[number] {
  return { id, metrics: { totalUnits }, analysis: {} };
}

test('同じidで数値が違うケースだけを返す。追加・削除は数えない', () => {
  const previous = { cases: [caseOf('a', 1), caseOf('b', 2), caseOf('gone', 3)] };
  const next = { cases: [caseOf('a', 1), caseOf('b', 9), caseOf('new', 4)] };
  assert.deepEqual(changedCaseIds(previous, next), ['b']);
});

test('数値が動いて版が同じなら拒み、版が上がっていれば通す', () => {
  const previous = { modelVersion: 3, cases: [caseOf('a', 1)] };
  assert.match(modelVersionBumpError(previous, { modelVersion: 3, cases: [caseOf('a', 2)] }) ?? '', /MODEL_VERSION/);
  assert.equal(modelVersionBumpError(previous, { modelVersion: 4, cases: [caseOf('a', 2)] }), null);
});

test('数値が動かない作り直しは版が同じでも通す', () => {
  const previous = { modelVersion: 3, cases: [caseOf('a', 1)] };
  assert.equal(modelVersionBumpError(previous, { modelVersion: 3, cases: [caseOf('a', 1), caseOf('b', 5)] }), null);
});
