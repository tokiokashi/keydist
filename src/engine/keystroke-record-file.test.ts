import assert from 'node:assert/strict';
import test from 'node:test';
import { textDigest, type KeystrokeRecord } from '#interpretation/record/keystroke-record.ts';
import { KEYSTROKE_RECORD_FILE_FORMAT, keystrokeRecordFileText, readKeystrokeRecordFile } from './keystroke-record-file.ts';

const RECORD: KeystrokeRecord = {
  id: 'a',
  recordedAt: '2026-11-15T00:00:00.000Z',
  appVersion: 'test',
  modelVersion: 1,
  target: { kind: 'layout', id: 'qwerty' },
  targetName: 'QWERTY',
  shapeId: 'row-staggered',
  fingerAssignmentId: 'default',
  conditions: {
    windowSize: 3,
    sfbHomeCost: true,
    centerShiftThumb: 'right',
    spaceThumb: 'right',
    chainInterpretation: { a: 1 } as never,
    arpeggioInterpretation: { b: true } as never,
    triggerRealizationPolicy: {} as never,
    actionRealizationPolicy: {} as never,
    romajiRuleId: 'kunrei',
    keepSymbols: false,
    keepAlphanumerics: false,
  },
  text: { identity: 'builtin:x', name: 'x', chars: 10, digest: textDigest('x') },
  range: { start: 0, end: 10, digest: textDigest('x') },
  typed: ['a'],
  ends: [0, 3],
  taps: [
    { atMs: 0, clean: true },
    { atMs: 80.5, clean: false },
  ],
};

test('書き出したファイルを読み込み直すと、同じ記録に戻る', () => {
  const text = keystrokeRecordFileText([RECORD]);
  assert.deepEqual(readKeystrokeRecordFile(text), { ok: true, records: [RECORD], dropped: 0 });
});

test('別の種類のファイル・JSONでない文字列・未来の版は読み込まない', () => {
  assert.equal(readKeystrokeRecordFile('{').ok, false);
  assert.equal(readKeystrokeRecordFile(JSON.stringify({ version: 1, records: [] })).ok, false);
  assert.equal(readKeystrokeRecordFile(JSON.stringify({ format: 'keydist-user-assets', version: 1 })).ok, false);
  assert.equal(readKeystrokeRecordFile(JSON.stringify({ format: KEYSTROKE_RECORD_FILE_FORMAT, version: 9, records: [] })).ok, false);
});
