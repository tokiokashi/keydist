import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlaybackCalibration } from './calibration.ts';
import {
  applyCalibrationField,
  calibrationFormValues,
  calibrationOverheadFieldId,
  CALIBRATION_FALLBACK_FINGER_FIELD,
  CALIBRATION_SAME_HAND_FIELD,
  CALIBRATION_SAME_KEY_FIELD,
} from './calibration-form.ts';

const SAVED: PlaybackCalibration = {
  actionsPerSecond: 5,
  actionsPerSecondByDirection: { 'L→R': 5.5, 'R→L': 4.5 },
  sameHandDifferentFingerActionsPerSecond: 4,
  sameHandDifferentFingerActionsPerSecondByPair: { 'LM:LI': 3.5 },
  sameHandDifferentFingerActionsPerDirectedPair: { 'LM>LI': 3.2 },
  fingerSpeedUnitsPerSecond: { LI: 8, RP: 6.25 },
  fallbackFingerSpeedUnitsPerSecond: 7,
  measuredAt: 1,
};

test('保存値は欄の値に写り、小数第2位までの文字列になる', () => {
  assert.deepEqual(calibrationFormValues(SAVED), {
    actions: '5.00',
    [CALIBRATION_SAME_HAND_FIELD]: '4.00',
    [CALIBRATION_FALLBACK_FINGER_FIELD]: '7.00',
    'direction:L→R': '5.50',
    'direction:R→L': '4.50',
    'same-hand-pair:LM:LI': '3.50',
    'directed-pair:LM>LI': '3.20',
    'finger:LI': '8.00',
    'finger:RP': '6.25',
  });
});

test('欄の値を書き換えても、他の欄は保存値のまま変わらず、更新時刻だけが入る', () => {
  const precise: PlaybackCalibration = { ...SAVED, actionsPerSecond: 5.123, fingerSpeedUnitsPerSecond: { LI: 8.4567 } };
  const applied = applyCalibrationField(precise, 'actions', '6.5', 99);
  assert.ok(applied.ok);
  assert.deepEqual(applied.calibration, { ...precise, actionsPerSecond: 6.5, measuredAt: 99 });
  const other = applyCalibrationField(precise, 'direction:L→R', ' 9 ', 2);
  assert.ok(other.ok);
  assert.equal(other.calibration.actionsPerSecond, 5.123);
  assert.equal(other.calibration.fingerSpeedUnitsPerSecond.LI, 8.4567);
  assert.equal(other.calibration.actionsPerSecondByDirection?.['L→R'], 9);
});

test('任意の欄を空にすると、その項目が無くなり、表が空になれば表ごと無くなる', () => {
  const direction = applyCalibrationField(SAVED, 'direction:L→R', '', 2);
  assert.ok(direction.ok);
  assert.deepEqual(direction.calibration.actionsPerSecondByDirection, { 'R→L': 4.5 });
  const both = applyCalibrationField(direction.ok ? direction.calibration : SAVED, 'direction:R→L', '  ', 2);
  assert.ok(both.ok);
  assert.equal('actionsPerSecondByDirection' in both.calibration, false);
  const directed = applyCalibrationField(SAVED, 'directed-pair:LM>LI', '', 2);
  assert.ok(directed.ok);
  assert.equal('sameHandDifferentFingerActionsPerDirectedPair' in directed.calibration, false);
  const finger = applyCalibrationField(SAVED, 'finger:RP', '', 2);
  assert.ok(finger.ok);
  assert.deepEqual(finger.calibration.fingerSpeedUnitsPerSecond, { LI: 8 });
  const pair = applyCalibrationField(SAVED, 'same-hand-pair:LM:LI', '', 2);
  assert.ok(pair.ok);
  assert.deepEqual(pair.calibration.sameHandDifferentFingerActionsPerSecondByPair, {});
});

test('必須の欄が空なら、その欄を返して保存値は作らない', () => {
  for (const field of ['actions', CALIBRATION_SAME_HAND_FIELD, CALIBRATION_FALLBACK_FINGER_FIELD]) {
    const applied = applyCalibrationField(SAVED, field, '', 2);
    assert.equal(applied.ok, false);
    if (!applied.ok) {
      assert.equal(applied.fieldId, field);
      assert.equal(applied.problem, 'empty');
    }
  }
});

test('数値でない欄と範囲の外の欄は、範囲を添えて返す', () => {
  assert.deepEqual(applyCalibrationField(SAVED, 'actions', '40.01', 2), { ok: false, fieldId: 'actions', problem: 'invalid', min: 0.1, max: 40 });
  assert.deepEqual(applyCalibrationField(SAVED, 'finger:LI', '0.05', 2), { ok: false, fieldId: 'finger:LI', problem: 'invalid', min: 0.1, max: 100 });
  for (const text of ['abc', '1e1', '0x10', '-3', '5,5', 'Infinity']) {
    assert.equal(applyCalibrationField(SAVED, 'actions', text, 2).ok, false, text);
  }
  assert.ok(applyCalibrationField(SAVED, 'actions', '40', 2).ok);
  assert.ok(applyCalibrationField(SAVED, 'finger:LI', '100', 2).ok);
});

test('保存値の欄でない識別子と、指の組として成り立たないキーは保存しない', () => {
  assert.equal(applyCalibrationField(SAVED, 'finger:XX', '5', 2).ok, false);
  assert.equal(applyCalibrationField(SAVED, 'unknown', '5', 2).ok, false);
  assert.equal(applyCalibrationField(SAVED, 'same-hand-pair:LM:RI', '5', 2).ok, false);
});

const WITH_OVERHEAD: PlaybackCalibration = { ...SAVED, keystrokeOverheadMs: { arpeggio: 12.34, other: 80 } };

test('打鍵の上乗せは、種類ごとの欄に小数第1位までの文字列で写る', () => {
  const values = calibrationFormValues(WITH_OVERHEAD);
  assert.equal(values[calibrationOverheadFieldId('arpeggio')], '12.3');
  assert.equal(values[calibrationOverheadFieldId('other')], '80.0');
  assert.equal(calibrationOverheadFieldId('chain') in values, false);
});

test('打鍵の上乗せの欄を編集して保存値に入れられ、空欄にすると項目ごと消える', () => {
  const added = applyCalibrationField(SAVED, calibrationOverheadFieldId('chain'), '45', 2);
  assert.ok(added.ok);
  assert.deepEqual(added.calibration.keystrokeOverheadMs, { chain: 45 });

  const first = applyCalibrationField(WITH_OVERHEAD, calibrationOverheadFieldId('arpeggio'), '', 2);
  assert.ok(first.ok);
  assert.deepEqual(first.calibration.keystrokeOverheadMs, { other: 80 });
  const second = applyCalibrationField(first.calibration, calibrationOverheadFieldId('other'), '', 2);
  assert.ok(second.ok);
  assert.equal('keystrokeOverheadMs' in second.calibration, false);
});

test('打鍵の上乗せの欄は0から1000までで、範囲の外の欄を返す', () => {
  const field = calibrationOverheadFieldId('other');
  assert.deepEqual(
    applyCalibrationField(WITH_OVERHEAD, field, '1000.1', 2),
    { ok: false, fieldId: field, problem: 'invalid', min: 0, max: 1000 },
  );
  assert.ok(applyCalibrationField(WITH_OVERHEAD, field, '0', 2).ok);
  assert.ok(applyCalibrationField(WITH_OVERHEAD, field, '1000', 2).ok);
  assert.equal(applyCalibrationField(WITH_OVERHEAD, field, '-1', 2).ok, false);
});

test('続け打ち・同指連続の差と同じキーを続けて打つ速さを、欄に写して編集・空欄にできる', () => {
  const full: PlaybackCalibration = {
    ...SAVED,
    sameKeyActionsPerSecond: 6.5,
    keystrokeOverheadMs: { repeat: 12.34, sfb: 40 },
  };
  const values = calibrationFormValues(full);
  assert.equal(values[CALIBRATION_SAME_KEY_FIELD], '6.50');
  assert.equal(values[calibrationOverheadFieldId('repeat')], '12.3');
  assert.equal(values[calibrationOverheadFieldId('sfb')], '40.0');
  const edited = applyCalibrationField(full, CALIBRATION_SAME_KEY_FIELD, '7', 3);
  assert.ok(edited.ok);
  assert.equal(edited.calibration.sameKeyActionsPerSecond, 7);
  const cleared = applyCalibrationField(full, CALIBRATION_SAME_KEY_FIELD, '', 3);
  assert.ok(cleared.ok);
  assert.equal('sameKeyActionsPerSecond' in cleared.calibration, false);
  // 持たない保存値の欄は含まない。
  assert.equal(CALIBRATION_SAME_KEY_FIELD in calibrationFormValues(SAVED), false);
});

test('同じキーを続けて打つ速さの欄は他の速度と同じ0.1から40までで、範囲の外の欄を返す', () => {
  const base = { ...SAVED, sameKeyActionsPerSecond: 6 };
  for (const bad of ['0.09', '40.1', 'x']) {
    assert.deepEqual(
      applyCalibrationField(base, CALIBRATION_SAME_KEY_FIELD, bad, 2),
      { ok: false, fieldId: CALIBRATION_SAME_KEY_FIELD, problem: 'invalid', min: 0.1, max: 40 },
    );
  }
  assert.ok(applyCalibrationField(base, CALIBRATION_SAME_KEY_FIELD, '0.1', 2).ok);
  assert.ok(applyCalibrationField(base, CALIBRATION_SAME_KEY_FIELD, '40', 2).ok);
});
