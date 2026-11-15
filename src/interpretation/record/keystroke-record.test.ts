import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_METRIC_CONDITIONS } from '../metrics.ts';
import { KEYSTROKE_RECORDS_CODEC, textDigest, type KeystrokeRecord, type RecordConditions } from './keystroke-record.ts';

const { reading: _reading, ...BASE_CONDITIONS } = DEFAULT_METRIC_CONDITIONS;
const CONDITIONS: RecordConditions = {
  ...BASE_CONDITIONS,
  romajiRuleId: 'kunrei',
  comboSet: { name: '組', romajiRuleId: 'kunrei', combos: [{ keys: ['s', 't'], output: 'ta' }], dropped: 1 },
};

function record(overrides: Partial<KeystrokeRecord> = {}): KeystrokeRecord {
  return {
    id: 'a',
    recordedAt: '2026-11-15T01:02:03.456Z',
    appVersion: '1.6.0',
    modelVersion: 12,
    target: { kind: 'setup', id: 's1' },
    targetName: '試すSetup',
    shapeId: 'row-staggered',
    fingerAssignmentId: 'default',
    conditions: CONDITIONS,
    text: { identity: 'user:t1', name: '本文', chars: 2300, digest: textDigest('x') },
    range: { start: 1100, end: 1200, digest: textDigest('y') },
    typed: ['si', 'ka', 'nn'],
    ends: [1100, 1101, 1101, 1102, 1105],
    taps: [
      { atMs: 0, clean: true },
      { atMs: 112.3, clean: false },
      { atMs: 230, clean: true, outputCompleted: true },
      { atMs: 230.1, clean: true },
      { atMs: 1000.5, clean: true },
    ],
    ...overrides,
  };
}

function roundTrip(records: readonly KeystrokeRecord[]) {
  const text = JSON.stringify(KEYSTROKE_RECORDS_CODEC.encode(records));
  const decoded = KEYSTROKE_RECORDS_CODEC.decode(JSON.parse(text));
  assert.ok(decoded.ok);
  return decoded;
}

test('書き出して読み込み直すと、同じ記録に戻る', () => {
  const { typed: _typed, ...withoutTyped } = record({ id: 'b', target: { kind: 'layout', id: 'qwerty' } });
  const input = [record(), withoutTyped];
  const decoded = roundTrip(input);
  assert.deepEqual(decoded.value, input);
  assert.deepEqual(decoded.diagnostics, []);
});

test('空の手持ちも往復できる', () => {
  assert.deepEqual(roundTrip([]).value, []);
});

test('時刻の間隔が負・最初の間隔が0でない・eが範囲の外・数が合わない記録は、診断を積んで捨てる', () => {
  const decodedWith = (patch: (value: Record<string, unknown>) => void) => {
    const payload = KEYSTROKE_RECORDS_CODEC.encode([record()]) as { records: Record<string, unknown>[] };
    patch(payload.records[0]!);
    return KEYSTROKE_RECORDS_CODEC.decode(JSON.parse(JSON.stringify(payload)));
  };
  const rejected = [
    decodedWith((value) => {
      value.gaps = [0, 100, -10, 100, 100];
    }),
    decodedWith((value) => {
      value.gaps = [5, 100, 100, 100, 100];
    }),
    decodedWith((value) => {
      value.deltas = [0, 0, 0, 0, 500];
    }),
    decodedWith((value) => {
      value.deltas = [0, 0, 0];
    }),
    decodedWith((value) => {
      value.unclean = [9];
    }),
    decodedWith((value) => {
      value.range = { start: 1100, end: 3000, digest: 'x' };
    }),
  ];
  for (const decoded of rejected) {
    assert.ok(decoded.ok);
    assert.deepEqual(decoded.value, []);
    assert.equal(decoded.diagnostics.length, 1);
  }
});

test('idが重複する記録は、後のものを捨てる', () => {
  const decoded = KEYSTROKE_RECORDS_CODEC.decode(KEYSTROKE_RECORDS_CODEC.encode([record(), record()]));
  assert.ok(decoded.ok);
  assert.equal(decoded.value.length, 1);
  assert.equal(decoded.diagnostics.length, 1);
});

test('未来の版・版が無いファイルは読まない', () => {
  assert.equal(KEYSTROKE_RECORDS_CODEC.decode({ version: 2, records: [] }).ok, false);
  assert.equal(KEYSTROKE_RECORDS_CODEC.decode({ records: [] }).ok, false);
});

test('本文の照合値は、同じ文字列で同じ値、1文字違うと別の値になる', () => {
  assert.equal(textDigest('しゃしん'), textDigest('しゃしん'));
  assert.notEqual(textDigest('しゃしん'), textDigest('しゃじん'));
  assert.match(textDigest(''), /^[0-9a-f]{16}$/);
});
