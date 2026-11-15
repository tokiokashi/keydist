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

test('記録の物理配列とローマ字規則は、記録が持つidを名前に引き、idをそのまま出さない', () => {
  const texts = keystrokeRecordTexts(record('recorded-shape', 'kunrei'), NAMES);
  const rows = new Map(texts.rows.map((row) => [row.label, row.value]));
  assert.equal(rows.get('物理配列'), '記録した物理配列');
  assert.ok(![...rows.values()].includes('kunrei'));
  assert.ok(rows.get('ローマ字規則') !== undefined && rows.get('ローマ字規則') !== 'kunrei');
  assert.equal(rows.get('先読みN'), '3');
  assert.ok(rows.get('指の割当') !== undefined && rows.get('指の割当') !== 'standard');
});

test('手持ちに無い物理配列は、見つからない旨の名前にする。ローマ字規則が無い記録は「なし」', () => {
  const texts = keystrokeRecordTexts(record('gone', null), NAMES);
  const rows = new Map(texts.rows.map((row) => [row.label, row.value]));
  assert.ok(!rows.get('物理配列')?.includes('gone'));
  assert.equal(rows.get('ローマ字規則'), 'なし');
});

test('条件の項目名は、条件の要約と同じ名前になる', () => {
  const { conditionLabel } = keystrokeRecordTexts(record('x', null), NAMES);
  assert.equal(conditionLabel('windowSize'), '先読みN');
  assert.equal(conditionLabel('romajiRuleId'), 'ローマ字規則');
  assert.equal(conditionLabel('comboSet'), 'コンボの組');
});
