import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlaybackCalibration } from './calibration.ts';
import { EMPTY_PERSONAL_SPEED, PERSONAL_SPEED_CODEC } from './calibration-codec.ts';

const CALIBRATION: PlaybackCalibration = {
  actionsPerSecond: 5,
  actionsPerSecondByDirection: { 'L→R': 5.5 },
  sameHandDifferentFingerActionsPerSecond: 4,
  sameHandDifferentFingerActionsPerSecondByPair: { 'LM:LI': 3.5 },
  sameHandDifferentFingerActionsPerDirectedPair: { 'LM>LI': 3.2 },
  fingerSpeedUnitsPerSecond: { LI: 8 },
  fallbackFingerSpeedUnitsPerSecond: 7,
  measuredAt: 1,
};

test('個人速度は書き出して読み直すと同じ値になる', () => {
  const encoded = PERSONAL_SPEED_CODEC.encode({ calibration: CALIBRATION });
  assert.equal(encoded.version, 1);
  const decoded = PERSONAL_SPEED_CODEC.decode(JSON.parse(JSON.stringify(encoded)));
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.value, { calibration: CALIBRATION });
  assert.deepEqual(decoded.diagnostics, []);
});

test('個人速度が無い状態も書き出して読み直せる', () => {
  const encoded = PERSONAL_SPEED_CODEC.encode(EMPTY_PERSONAL_SPEED);
  assert.deepEqual(encoded, { version: 1 });
  const decoded = PERSONAL_SPEED_CODEC.decode(encoded);
  assert.ok(decoded.ok);
  assert.equal(decoded.value.calibration, undefined);
});

test('範囲外の個人速度は一部だけ残さず捨て、理由を診断に積む', () => {
  const decoded = PERSONAL_SPEED_CODEC.decode({ version: 1, calibration: { ...CALIBRATION, actionsPerSecond: 99 } });
  assert.ok(decoded.ok);
  assert.equal(decoded.value.calibration, undefined);
  assert.equal(decoded.diagnostics.length, 1);
  assert.equal(decoded.diagnostics[0]?.path, 'calibration');
});

test('必須の項目が欠けた個人速度は捨てる', () => {
  const { sameHandDifferentFingerActionsPerSecondByPair: _drop, ...partial } = CALIBRATION;
  const decoded = PERSONAL_SPEED_CODEC.decode({ version: 1, calibration: partial });
  assert.ok(decoded.ok);
  assert.equal(decoded.value.calibration, undefined);
  assert.equal(decoded.diagnostics.length, 1);
});

test('知らない項目は読み込まず、書き出しにも出さない', () => {
  const decoded = PERSONAL_SPEED_CODEC.decode({ version: 1, calibration: { ...CALIBRATION, extra: 1 } });
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.value.calibration, CALIBRATION);
});

test('版が無い・未来の版・オブジェクトでない値は読み込めない', () => {
  assert.equal(PERSONAL_SPEED_CODEC.decode({ calibration: CALIBRATION }).ok, false);
  assert.equal(PERSONAL_SPEED_CODEC.decode({ version: 2, calibration: CALIBRATION }).ok, false);
  assert.equal(PERSONAL_SPEED_CODEC.decode('x').ok, false);
});

const WITH_OVERHEAD: PlaybackCalibration = { ...CALIBRATION, keystrokeOverheadMs: { arpeggio: 20, other: 80.5 } };

test('打鍵の上乗せを持つ個人速度は、書き出して読み直すと同じ値になる', () => {
  const encoded = PERSONAL_SPEED_CODEC.encode({ calibration: WITH_OVERHEAD });
  const decoded = PERSONAL_SPEED_CODEC.decode(JSON.parse(JSON.stringify(encoded)));
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.value, { calibration: WITH_OVERHEAD });
});

test('打鍵の上乗せを持たない保存値は、そのまま読み込める', () => {
  const decoded = PERSONAL_SPEED_CODEC.decode({ version: 1, calibration: CALIBRATION });
  assert.ok(decoded.ok);
  assert.equal(decoded.value.calibration?.keystrokeOverheadMs, undefined);
  assert.deepEqual(decoded.diagnostics, []);
});

test('打鍵の上乗せだけが範囲外・知らない種類でも、他の任意の項目と同じく保存値ごと捨てる', () => {
  for (const keystrokeOverheadMs of [{ other: 1001 }, { other: -1001 }, { unknown: 5 }]) {
    const decoded = PERSONAL_SPEED_CODEC.decode({ version: 1, calibration: { ...CALIBRATION, keystrokeOverheadMs } });
    assert.ok(decoded.ok);
    assert.equal(decoded.value.calibration, undefined);
    assert.equal(decoded.diagnostics.length, 1);
  }
});

test('同じキーを続けて打つ速さと、続け打ち・同指連続の差は、書き出して読み直すと同じ値になる', () => {
  const full: PlaybackCalibration = { ...CALIBRATION, sameKeyActionsPerSecond: 7.5, keystrokeOverheadMs: { repeat: 4, sfb: 33.5, other: -10 } };
  const decoded = PERSONAL_SPEED_CODEC.decode(JSON.parse(JSON.stringify(PERSONAL_SPEED_CODEC.encode({ calibration: full }))));
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.value, { calibration: full });
  assert.equal(PERSONAL_SPEED_CODEC.decode({ version: 1, calibration: CALIBRATION }).ok, true);
});

test('同じキーを続けて打つ速さが範囲外なら、保存値ごと捨てる', () => {
  for (const sameKeyActionsPerSecond of [0.05, 41]) {
    const decoded = PERSONAL_SPEED_CODEC.decode({ version: 1, calibration: { ...CALIBRATION, sameKeyActionsPerSecond } });
    assert.ok(decoded.ok);
    assert.equal(decoded.value.calibration, undefined);
    assert.equal(decoded.diagnostics.length, 1);
  }
});
