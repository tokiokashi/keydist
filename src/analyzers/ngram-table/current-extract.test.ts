import assert from 'node:assert/strict';
import test from 'node:test';
import { analysisTargetKey } from '#input/setup/index.ts';
import { DISCIPLINE_FAILURES, DISCIPLINE_TARGET_A, DISCIPLINE_TRACE, disciplineMember, disciplineMetrics } from '../set-discipline-material.ts';
import { computeCurrentAnalysisExtraction } from './current-extract.ts';
import { sideBySideResultsModel, type NgramDisplayRow } from './figure-model.ts';

test('今の解析の行は、Metricsの総移動距離・入力1かなあたり・入力かな数・先読みNをそのまま読む', () => {
  const metrics = disciplineMetrics(12, { inputChars: 4, perCharUnits: 3, skipped: 1 });
  const { rows } = computeCurrentAnalysisExtraction([disciplineMember(DISCIPLINE_TARGET_A, { trace: DISCIPLINE_TRACE, metrics })], DISCIPLINE_FAILURES);
  const ok = rows[0];
  assert.equal(ok?.kind, 'ok');
  if (ok?.kind === 'ok') {
    assert.deepEqual([ok.totalDistance, ok.perChar, ok.chars, ok.skipped, ok.lookahead], [12, 3, 4, 1, metrics.conditions.windowSize]);
  }
  assert.equal(rows[1]?.kind, 'failed');
});

test('入力かな数が0なら、入力1かなあたりは値を持たない', () => {
  const metrics = disciplineMetrics(0, { inputChars: 0, perCharUnits: 0 });
  const { rows } = computeCurrentAnalysisExtraction([disciplineMember(DISCIPLINE_TARGET_A, { trace: DISCIPLINE_TRACE, metrics })], []);
  const row = rows[0];
  assert.equal(row?.kind, 'ok');
  if (row?.kind === 'ok') assert.equal(row.perChar, undefined);
});

test('並べる表は、表による解析の行に今の解析の値と失敗の理由を添え、表による解析の値を変えない', () => {
  const targetKey = analysisTargetKey(DISCIPLINE_TARGET_A);
  const row = {
    targetKey,
    label: 'A',
    fullName: 'A',
    row: { kind: 'ok', targetKey, analysis: { totalDistance: 100, chars: 50, skipped: 2, perChar: 2 } },
  } as unknown as NgramDisplayRow;
  const ready = sideBySideResultsModel(
    [row],
    {
      lookaheads: new Map([[targetKey, 3]]),
      status: 'ready',
      extracted: { rows: [{ kind: 'ok', targetKey, totalDistance: 90, perChar: 1.5, chars: 60, skipped: 0, lookahead: 3 }] },
    },
    2,
  );
  assert.deepEqual(
    ready.groups[0]?.lines.map((line) => line.cells),
    [
      ['100.0', '2.00', '50', '2'],
      ['90.0', '1.50', '60', '0'],
    ],
  );
  assert.deepEqual(
    ready.groups[0]?.lines.map((line) => line.lookahead),
    ['先読み2文節', '先読み3かな'],
  );
  const failed = sideBySideResultsModel(
    [row],
    { lookaheads: new Map([[targetKey, 3]]), status: 'ready', extracted: { rows: [{ kind: 'failed', targetKey, message: '長すぎます' }] } },
    2,
  );
  assert.deepEqual(failed.groups[0]?.lines[0]?.cells, ['100.0', '2.00', '50', '2']);
  assert.equal(failed.groups[0]?.lines[1]?.cells, undefined);
  assert.equal(failed.groups[0]?.lines[1]?.message, '長すぎます');
});
