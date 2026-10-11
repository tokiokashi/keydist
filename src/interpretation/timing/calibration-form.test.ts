import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlaybackCalibration } from './calibration.ts';
import {
  calibrationFormValues,
  CALIBRATION_FALLBACK_FINGER_FIELD,
  CALIBRATION_SAME_HAND_FIELD,
  parseCalibrationForm,
  sameCalibrationFormValues,
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

test('変えずに読み直した欄の値は、保存値と同じ値に戻る', () => {
  const parsed = parseCalibrationForm(calibrationFormValues(SAVED), 99);
  assert.ok(parsed.ok);
  assert.deepEqual({ ...parsed.calibration, measuredAt: 1 }, SAVED);
  assert.equal(parsed.calibration.measuredAt, 99);
});

test('編集した欄の値が保存値に入る', () => {
  const parsed = parseCalibrationForm({ ...calibrationFormValues(SAVED), actions: '6.5', 'finger:LI': ' 9 ' }, 2);
  assert.ok(parsed.ok);
  assert.equal(parsed.calibration.actionsPerSecond, 6.5);
  assert.equal(parsed.calibration.fingerSpeedUnitsPerSecond.LI, 9);
});

test('任意の欄を空にすると、その項目が無くなる', () => {
  const values = {
    ...calibrationFormValues(SAVED),
    'direction:L→R': '',
    'direction:R→L': '  ',
    'directed-pair:LM>LI': '',
    'finger:RP': '',
    'same-hand-pair:LM:LI': '',
  };
  const parsed = parseCalibrationForm(values, 2);
  assert.ok(parsed.ok);
  assert.equal('actionsPerSecondByDirection' in parsed.calibration, false);
  assert.equal('sameHandDifferentFingerActionsPerDirectedPair' in parsed.calibration, false);
  assert.deepEqual(parsed.calibration.fingerSpeedUnitsPerSecond, { LI: 8 });
  assert.deepEqual(parsed.calibration.sameHandDifferentFingerActionsPerSecondByPair, {});
});

test('必須の欄が空なら、その欄を返して保存値は作らない', () => {
  for (const field of ['actions', CALIBRATION_SAME_HAND_FIELD, CALIBRATION_FALLBACK_FINGER_FIELD]) {
    const parsed = parseCalibrationForm({ ...calibrationFormValues(SAVED), [field]: '' }, 2);
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.equal(parsed.fieldId, field);
      assert.equal(parsed.problem, 'empty');
    }
  }
});

test('数値でない欄と範囲の外の欄は、範囲を添えて返す', () => {
  const values = calibrationFormValues(SAVED);
  const over = parseCalibrationForm({ ...values, actions: '40.01' }, 2);
  assert.deepEqual(over, { ok: false, fieldId: 'actions', problem: 'invalid', min: 0.1, max: 40 });
  const under = parseCalibrationForm({ ...values, 'finger:LI': '0.05' }, 2);
  assert.deepEqual(under, { ok: false, fieldId: 'finger:LI', problem: 'invalid', min: 0.1, max: 100 });
  for (const text of ['abc', '1e1', '0x10', '-3', '5,5', 'Infinity']) {
    const parsed = parseCalibrationForm({ ...values, actions: text }, 2);
    assert.equal(parsed.ok, false, text);
  }
  const edge = parseCalibrationForm({ ...values, actions: '40', 'finger:LI': '100' }, 2);
  assert.ok(edge.ok);
});

test('複数の欄が不正なら、最初の欄を返す', () => {
  const parsed = parseCalibrationForm({ ...calibrationFormValues(SAVED), actions: 'x', [CALIBRATION_FALLBACK_FINGER_FIELD]: 'y' }, 2);
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.fieldId, 'actions');
});

test('欄の値の比較は、空の欄と欄が無いことを同じとみなす', () => {
  assert.equal(sameCalibrationFormValues({ a: '1.00' }, { a: '1.00' }), true);
  assert.equal(sameCalibrationFormValues({ a: '1.00', b: '' }, { a: '1.00' }), true);
  assert.equal(sameCalibrationFormValues({ a: '1.00' }, { a: '1.50' }), false);
  assert.equal(sameCalibrationFormValues({ a: '1.00', b: '2' }, { a: '1.00' }), false);
});
