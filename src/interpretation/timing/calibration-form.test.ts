import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlaybackCalibration } from './calibration.ts';
import {
  applyCalibrationField,
  calibrationFormValues,
  calibrationOverheadFieldId,
  calibrationFingerRepeatFieldId,
  CALIBRATION_FALLBACK_MOVE_FIELD,
  CALIBRATION_FALLBACK_REPEAT_FIELD,
  CALIBRATION_SAME_HAND_FIELD,
} from './calibration-form.ts';

const SAVED: PlaybackCalibration = {
  actionsPerSecond: 5,
  actionsPerSecondByDirection: { 'L→R': 5.5, 'R→L': 4.5 },
  sameHandDifferentFingerActionsPerSecond: 4,
  sameHandDifferentFingerActionsPerSecondByPair: { 'LM:LI': 3.5 },
  sameHandDifferentFingerActionsPerDirectedPair: { 'LM>LI': 3.2 },
  fingerRepeatMs: { LI: 200, RP: 160 },
  fingerMoveMsPerUnit: { LI: 125, RP: 160 },
  fallbackRepeatMs: 250,
  fallbackMoveMsPerUnit: 140,
  measuredAt: 1,
};

test('保存値は欄の値に写る。同じキーを続けて打つ速さはアクション/秒（小数第2位まで）、移動の時間はミリ秒/u（小数第1位まで）になる', () => {
  assert.deepEqual(calibrationFormValues(SAVED), {
    actions: '5.00',
    [CALIBRATION_SAME_HAND_FIELD]: '4.00',
    [CALIBRATION_FALLBACK_REPEAT_FIELD]: '4.00',
    [CALIBRATION_FALLBACK_MOVE_FIELD]: '140.0',
    'direction:L→R': '5.50',
    'direction:R→L': '4.50',
    'same-hand-pair:LM:LI': '3.50',
    'directed-pair:LM>LI': '3.20',
    'finger-repeat:LI': '5.00',
    'finger-repeat:RP': '6.25',
    'finger:LI': '125.0',
    'finger:RP': '160.0',
  });
});

test('欄の値を書き換えても、他の欄は保存値のまま変わらず、更新時刻だけが入る', () => {
  const precise: PlaybackCalibration = { ...SAVED, actionsPerSecond: 5.123, fingerMoveMsPerUnit: { LI: 118.4567, RP: 160 } };
  const applied = applyCalibrationField(precise, 'actions', '6.5', 99);
  assert.ok(applied.ok);
  assert.deepEqual(applied.calibration, { ...precise, actionsPerSecond: 6.5, measuredAt: 99 });
  const other = applyCalibrationField(precise, 'direction:L→R', ' 9 ', 2);
  assert.ok(other.ok);
  assert.equal(other.calibration.actionsPerSecond, 5.123);
  assert.equal(other.calibration.fingerMoveMsPerUnit.LI, 118.4567);
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
  // 指ごとの値は2つで1組なので、どちらの欄を空にしても、その指の2つとも無くなる。
  for (const field of ['finger:RP', calibrationFingerRepeatFieldId('RP')]) {
    const finger = applyCalibrationField(SAVED, field, '', 2);
    assert.ok(finger.ok, field);
    assert.deepEqual(finger.calibration.fingerMoveMsPerUnit, { LI: 125 }, field);
    assert.deepEqual(finger.calibration.fingerRepeatMs, { LI: 200 }, field);
  }
  const pair = applyCalibrationField(SAVED, 'same-hand-pair:LM:LI', '', 2);
  assert.ok(pair.ok);
  assert.deepEqual(pair.calibration.sameHandDifferentFingerActionsPerSecondByPair, {});
});

test('必須の欄が空なら、その欄を返して保存値は作らない', () => {
  for (const field of ['actions', CALIBRATION_SAME_HAND_FIELD, CALIBRATION_FALLBACK_REPEAT_FIELD, CALIBRATION_FALLBACK_MOVE_FIELD]) {
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
  assert.deepEqual(applyCalibrationField(SAVED, 'finger:LI', '-0.05', 2), { ok: false, fieldId: 'finger:LI', problem: 'invalid', min: 0, max: 10000 });
  for (const text of ['abc', '1e1', '0x10', '-3', '5,5', 'Infinity']) {
    assert.equal(applyCalibrationField(SAVED, 'actions', text, 2).ok, false, text);
  }
  assert.ok(applyCalibrationField(SAVED, 'actions', '40', 2).ok);
  assert.ok(applyCalibrationField(SAVED, 'finger:LI', '10000', 2).ok);
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

test('打鍵の上乗せの欄は-1000から1000までで、範囲の外の欄を返す', () => {
  const field = calibrationOverheadFieldId('other');
  assert.deepEqual(
    applyCalibrationField(WITH_OVERHEAD, field, '1000.1', 2),
    { ok: false, fieldId: field, problem: 'invalid', min: -1000, max: 1000 },
  );
  assert.deepEqual(
    applyCalibrationField(WITH_OVERHEAD, field, '-1000.1', 2),
    { ok: false, fieldId: field, problem: 'invalid', min: -1000, max: 1000 },
  );
  assert.ok(applyCalibrationField(WITH_OVERHEAD, field, '0', 2).ok);
  assert.ok(applyCalibrationField(WITH_OVERHEAD, field, '1000', 2).ok);
  assert.ok(applyCalibrationField(WITH_OVERHEAD, field, '-1000', 2).ok);
});

test('打鍵の上乗せの欄は、マイナス記号を含む入力を負の値として保存できる', () => {
  const field = calibrationOverheadFieldId('other');
  for (const [raw, expected] of [['-1', -1], ['-19.6', -19.6], ['−20', -20], [' -0.5 ', -0.5], ['-.5', -0.5]] as const) {
    const applied = applyCalibrationField(WITH_OVERHEAD, field, raw, 2);
    assert.ok(applied.ok, raw);
    assert.equal(applied.calibration.keystrokeOverheadMs?.other, expected, raw);
  }
  for (const raw of ['--1', '-', '1-', '- 1', '+1']) {
    assert.equal(applyCalibrationField(WITH_OVERHEAD, field, raw, 2).ok, false, raw);
  }
  // 負の値は、保存値を欄の文字列に写しても読み戻せる。
  const saved = applyCalibrationField(WITH_OVERHEAD, field, '-12.5', 2);
  assert.ok(saved.ok);
  assert.equal(calibrationFormValues(saved.calibration)[field], '-12.5');
});

test('マイナス記号は、打鍵の上乗せ以外の欄では受け付けない', () => {
  assert.equal(applyCalibrationField(WITH_OVERHEAD, calibrationFingerRepeatFieldId('LI'), '-5', 2).ok, false);
  assert.equal(applyCalibrationField(WITH_OVERHEAD, 'finger:LI', '-5', 2).ok, false);
  assert.equal(applyCalibrationField(WITH_OVERHEAD, 'actions', '-5', 2).ok, false);
});

test('同じキーを続けて打つ速さの欄はアクション/秒で編集し、保存はミリ秒の逆数になる', () => {
  const edited = applyCalibrationField(SAVED, calibrationFingerRepeatFieldId('LI'), '8', 2);
  assert.ok(edited.ok);
  assert.equal(edited.calibration.fingerRepeatMs.LI, 125);
  // 同じ指の移動の時間と、ほかの指の値は変わらない。
  assert.equal(edited.calibration.fingerMoveMsPerUnit.LI, 125);
  assert.equal(edited.calibration.fingerRepeatMs.RP, 160);
  const fallback = applyCalibrationField(SAVED, CALIBRATION_FALLBACK_REPEAT_FIELD, '5', 2);
  assert.ok(fallback.ok);
  assert.equal(fallback.calibration.fallbackRepeatMs, 200);
});

test('直接編集しても、続け打ちの上乗せは消えず置き換わらない', () => {
  const base: PlaybackCalibration = { ...SAVED, keystrokeOverheadMs: { repeat: 12, other: 3 } };
  const edited = applyCalibrationField(base, calibrationFingerRepeatFieldId('LI'), '8', 2);
  assert.ok(edited.ok);
  assert.deepEqual(edited.calibration.keystrokeOverheadMs, { repeat: 12, other: 3 });
});

test('値を持たない指の片方の欄に値を入れると、もう片方には代表値を入れて1組にする', () => {
  const repeat = applyCalibrationField(SAVED, calibrationFingerRepeatFieldId('LM'), '10', 2);
  assert.ok(repeat.ok);
  assert.equal(repeat.calibration.fingerRepeatMs.LM, 100);
  assert.equal(repeat.calibration.fingerMoveMsPerUnit.LM, 140);
  const move = applyCalibrationField(SAVED, 'finger:LM', '90', 2);
  assert.ok(move.ok);
  assert.equal(move.calibration.fingerMoveMsPerUnit.LM, 90);
  assert.equal(move.calibration.fingerRepeatMs.LM, 250);
});

test('移動の時間の欄は0を受け付け、0から10000ミリ秒/uの外を返す。同じキーを続けて打つ速さの欄は0.1から40まで', () => {
  const zero = applyCalibrationField(SAVED, 'finger:LI', '0', 2);
  assert.ok(zero.ok);
  assert.equal(zero.calibration.fingerMoveMsPerUnit.LI, 0);
  assert.deepEqual(
    applyCalibrationField(SAVED, 'finger:LI', '10000.1', 2),
    { ok: false, fieldId: 'finger:LI', problem: 'invalid', min: 0, max: 10000 },
  );
  assert.ok(applyCalibrationField(SAVED, 'finger:LI', '10000', 2).ok);
  for (const bad of ['0.09', '40.1', 'x']) {
    assert.deepEqual(
      applyCalibrationField(SAVED, calibrationFingerRepeatFieldId('LI'), bad, 2),
      { ok: false, fieldId: calibrationFingerRepeatFieldId('LI'), problem: 'invalid', min: 0.1, max: 40 },
    );
  }
  assert.ok(applyCalibrationField(SAVED, calibrationFingerRepeatFieldId('LI'), '0.1', 2).ok);
  assert.ok(applyCalibrationField(SAVED, calibrationFingerRepeatFieldId('LI'), '40', 2).ok);
});

test('続け打ち・同指連続の差を、欄に写して編集・空欄にできる', () => {
  const full: PlaybackCalibration = { ...SAVED, keystrokeOverheadMs: { repeat: 12.34, sfb: 40 } };
  const values = calibrationFormValues(full);
  assert.equal(values[calibrationOverheadFieldId('repeat')], '12.3');
  assert.equal(values[calibrationOverheadFieldId('sfb')], '40.0');
  const cleared = applyCalibrationField(full, calibrationOverheadFieldId('repeat'), '', 3);
  assert.ok(cleared.ok);
  assert.deepEqual(cleared.calibration.keystrokeOverheadMs, { sfb: 40 });
});

test('かなの中・かなの境目の欄は、分けない値を持たない保存値にも編集で足せ、空欄にすると消える', () => {
  const within = calibrationOverheadFieldId('other-within');
  const boundary = calibrationOverheadFieldId('other-boundary');
  const first = applyCalibrationField(SAVED, within, '12.5', 2);
  assert.ok(first.ok);
  assert.deepEqual(first.calibration.keystrokeOverheadMs, { 'other-within': 12.5 });
  const second = applyCalibrationField(first.calibration, boundary, '-30', 3);
  assert.ok(second.ok);
  assert.deepEqual(second.calibration.keystrokeOverheadMs, { 'other-within': 12.5, 'other-boundary': -30 });
  assert.equal(calibrationFormValues(second.calibration)[within], '12.5');
  assert.equal(calibrationFormValues(second.calibration)[boundary], '-30.0');
  const cleared = applyCalibrationField(second.calibration, within, '', 4);
  assert.ok(cleared.ok);
  assert.deepEqual(cleared.calibration.keystrokeOverheadMs, { 'other-boundary': -30 });
  const none = applyCalibrationField(cleared.calibration, boundary, '', 5);
  assert.ok(none.ok);
  assert.equal('keystrokeOverheadMs' in none.calibration, false);
});

test('かなの中・かなの境目の欄は-1000から1000までで、範囲の外の欄を返す', () => {
  for (const kind of ['arpeggio-within', 'chain-boundary', 'other-within'] as const) {
    const field = calibrationOverheadFieldId(kind);
    assert.deepEqual(
      applyCalibrationField(WITH_OVERHEAD, field, '1000.1', 2),
      { ok: false, fieldId: field, problem: 'invalid', min: -1000, max: 1000 },
    );
    assert.ok(applyCalibrationField(WITH_OVERHEAD, field, '1000', 2).ok);
    assert.ok(applyCalibrationField(WITH_OVERHEAD, field, '-1000', 2).ok);
  }
});

test('同時押しの上乗せは、小数第1位までの欄の値になる', () => {
  const values = calibrationFormValues({ ...SAVED, simultaneousOverheadMs: { 'both-hands': 35.25, thumb: -20 } });
  assert.equal(values['simultaneous:both-hands'], '35.3');
  assert.equal(values['simultaneous:thumb'], '-20.0');
  assert.equal('simultaneous:one-hand' in values, false);
});

test('同時押しの上乗せの欄は、範囲内の値を保存し、空欄にすると分け方ごと消え、他の項目は残す', () => {
  const base: PlaybackCalibration = { ...SAVED, keystrokeOverheadMs: { other: 12 }, simultaneousOverheadMs: { thumb: 30 } };
  const applied = applyCalibrationField(base, 'simultaneous:both-hands', '−45.5', 99);
  assert.ok(applied.ok);
  assert.deepEqual(applied.calibration.simultaneousOverheadMs, { thumb: 30, 'both-hands': -45.5 });
  // 同時押しの上乗せを直接編集しても、打鍵の上乗せは消えない。
  assert.deepEqual(applied.calibration.keystrokeOverheadMs, { other: 12 });
  const cleared = applyCalibrationField(base, 'simultaneous:thumb', '', 99);
  assert.ok(cleared.ok);
  assert.equal(cleared.calibration.simultaneousOverheadMs, undefined);
  const outside = applyCalibrationField(base, 'simultaneous:thumb', '1001', 99);
  assert.ok(!outside.ok);
  assert.deepEqual([outside.problem, outside.min, outside.max], ['invalid', -1000, 1000]);
  assert.ok(!applyCalibrationField(base, 'simultaneous:fourth', '5', 99).ok);
});

test('基準になる値を直接編集しても、同時押しの上乗せと打鍵の上乗せは消えない', () => {
  const base: PlaybackCalibration = { ...SAVED, keystrokeOverheadMs: { other: 12 }, simultaneousOverheadMs: { 'both-hands': 30 } };
  const applied = applyCalibrationField(base, 'direction:R→L', '9', 99);
  assert.ok(applied.ok);
  assert.deepEqual(applied.calibration.simultaneousOverheadMs, { 'both-hands': 30 });
  assert.deepEqual(applied.calibration.keystrokeOverheadMs, { other: 12 });
});

test('打鍵の上乗せの欄を全部空にすると文章に入った同時押しの分け方も消え、それ以外の編集では変わらない', () => {
  const base: PlaybackCalibration = { ...SAVED, keystrokeOverheadMs: { other: 5, sfb: 8, repeat: 7 }, sentenceSimultaneousKinds: ['thumb'] };
  const edited = applyCalibrationField(base, calibrationOverheadFieldId('other'), '9', 2);
  assert.ok(edited.ok);
  assert.deepEqual(edited.calibration.sentenceSimultaneousKinds, ['thumb']);
  const unrelated = applyCalibrationField(base, calibrationOverheadFieldId('repeat'), '', 2);
  assert.ok(unrelated.ok);
  assert.deepEqual(unrelated.calibration.sentenceSimultaneousKinds, ['thumb']);
  const one = applyCalibrationField(base, calibrationOverheadFieldId('other'), '', 2);
  assert.ok(one.ok);
  const none = applyCalibrationField(one.calibration, calibrationOverheadFieldId('sfb'), '', 3);
  assert.ok(none.ok);
  assert.equal('sentenceSimultaneousKinds' in none.calibration, false);
  assert.deepEqual(none.calibration.keystrokeOverheadMs, { repeat: 7 });
  // 記録が消えた後に入れた打鍵の上乗せは、記録を持たない。
  const added = applyCalibrationField(none.calibration, calibrationOverheadFieldId('other'), '4', 4);
  assert.ok(added.ok);
  assert.equal('sentenceSimultaneousKinds' in added.calibration, false);
});
