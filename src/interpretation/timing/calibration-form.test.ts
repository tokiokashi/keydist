import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlaybackCalibration } from './calibration.ts';
import {
  calibrationFormValues,
  calibrationOverheadFieldId,
  CALIBRATION_FALLBACK_FINGER_FIELD,
  CALIBRATION_SAME_HAND_FIELD,
  CALIBRATION_SAME_KEY_FIELD,
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

const WITH_OVERHEAD: PlaybackCalibration = { ...SAVED, keystrokeOverheadMs: { arpeggio: 12.34, other: 80 } };

test('連打との差は、種類ごとの欄に小数第1位までの文字列で写る', () => {
  const values = calibrationFormValues(WITH_OVERHEAD);
  assert.equal(values[calibrationOverheadFieldId('arpeggio')], '12.3');
  assert.equal(values[calibrationOverheadFieldId('other')], '80.0');
  assert.equal(calibrationOverheadFieldId('chain') in values, false);
});

test('連打との差の欄を編集して保存値に入れられ、空欄にすると項目ごと消える', () => {
  const added = parseCalibrationForm({ ...calibrationFormValues(SAVED), [calibrationOverheadFieldId('chain')]: '45' }, 2);
  assert.ok(added.ok);
  assert.deepEqual(added.calibration.keystrokeOverheadMs, { chain: 45 });

  const cleared = parseCalibrationForm({
    ...calibrationFormValues(WITH_OVERHEAD),
    [calibrationOverheadFieldId('arpeggio')]: '',
    [calibrationOverheadFieldId('other')]: '',
  }, 2);
  assert.ok(cleared.ok);
  assert.equal('keystrokeOverheadMs' in cleared.calibration, false);
});

test('連打との差の欄は0から1000までで、範囲の外の欄を返す', () => {
  const values = calibrationFormValues(WITH_OVERHEAD);
  const field = calibrationOverheadFieldId('other');
  assert.deepEqual(
    parseCalibrationForm({ ...values, [field]: '1000.1' }, 2),
    { ok: false, fieldId: field, problem: 'invalid', min: 0, max: 1000 },
  );
  assert.ok(parseCalibrationForm({ ...values, [field]: '0' }, 2).ok);
  assert.ok(parseCalibrationForm({ ...values, [field]: '1000' }, 2).ok);
  assert.equal(parseCalibrationForm({ ...values, [field]: '-1' }, 2).ok, false);
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
  const parsed = parseCalibrationForm(values, 3);
  assert.ok(parsed.ok);
  assert.equal(parsed.calibration.sameKeyActionsPerSecond, 6.5);
  assert.deepEqual(parsed.calibration.keystrokeOverheadMs, { repeat: 12.3, sfb: 40 });
  const cleared = parseCalibrationForm({
    ...values,
    [CALIBRATION_SAME_KEY_FIELD]: '',
    [calibrationOverheadFieldId('repeat')]: '',
    [calibrationOverheadFieldId('sfb')]: '',
  }, 3);
  assert.ok(cleared.ok);
  assert.equal('sameKeyActionsPerSecond' in cleared.calibration, false);
  assert.equal('keystrokeOverheadMs' in cleared.calibration, false);
  // 持たない保存値の欄は含まない。
  assert.equal(CALIBRATION_SAME_KEY_FIELD in calibrationFormValues(SAVED), false);
});

test('同じキーを続けて打つ速さの欄は他の速度と同じ0.1から40までで、範囲の外の欄を返す', () => {
  const values = calibrationFormValues({ ...SAVED, sameKeyActionsPerSecond: 6 });
  for (const bad of ['0.09', '40.1', 'x']) {
    assert.deepEqual(
      parseCalibrationForm({ ...values, [CALIBRATION_SAME_KEY_FIELD]: bad }, 2),
      { ok: false, fieldId: CALIBRATION_SAME_KEY_FIELD, problem: 'invalid', min: 0.1, max: 40 },
    );
  }
  assert.ok(parseCalibrationForm({ ...values, [CALIBRATION_SAME_KEY_FIELD]: '0.1' }, 2).ok);
  assert.ok(parseCalibrationForm({ ...values, [CALIBRATION_SAME_KEY_FIELD]: '40' }, 2).ok);
});
