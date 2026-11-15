import assert from 'node:assert/strict';
import test from 'node:test';
import type { KeystrokeRecord } from '#interpretation/record/keystroke-record.ts';
import { keystrokeRecordTexts } from './keystroke-record-texts.ts';

const NAMES = { shapes: new Map([['recorded-shape', { name: '記録した物理配列' }]]) };

function record(shapeId: string, romajiRuleId: string | null): KeystrokeRecord {
  return {
    shapeId,
    fingerAssignmentId: 'standard',
    conditions: { windowSize: 3, romajiRuleId, keepSymbols: false, keepAlphanumerics: false },
  } as unknown as KeystrokeRecord;
}

test('記録の物理配列は、今の入力の値ではなく記録が持つidから名前を引く', () => {
  const texts = keystrokeRecordTexts(record('recorded-shape', 'kunrei'), NAMES);
  const rows = new Map(texts.rows.map((row) => [row.label, row.value]));
  assert.equal(rows.get('物理配列'), '記録した物理配列');
});
