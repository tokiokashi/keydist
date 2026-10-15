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
  fingerRepeatMs: { LI: 1000 / 5 },
  fingerMoveMsPerUnit: { LI: 1000 / 8 },
  fallbackRepeatMs: 1000 / 5,
  fallbackMoveMsPerUnit: 1000 / 7,
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

test('指ごとの値と、続け打ち・同指連続の差は、書き出して読み直すと同じ値になる', () => {
  const full: PlaybackCalibration = { ...CALIBRATION, keystrokeOverheadMs: { repeat: 4, sfb: 33.5, other: -10 } };
  const decoded = PERSONAL_SPEED_CODEC.decode(JSON.parse(JSON.stringify(PERSONAL_SPEED_CODEC.encode({ calibration: full }))));
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.value, { calibration: full });
  assert.equal(PERSONAL_SPEED_CODEC.decode({ version: 1, calibration: CALIBRATION }).ok, true);
});

test('同じキーを続けて打つ時間と移動の時間が範囲外なら、保存値ごと捨てる', () => {
  for (const patch of [
    { fingerRepeatMs: { LI: 24.9 } },
    { fingerRepeatMs: { LI: 10001 } },
    { fallbackRepeatMs: 24.9 },
    { fallbackRepeatMs: 10001 },
    { fingerMoveMsPerUnit: { LI: -1 } },
    { fingerMoveMsPerUnit: { LI: 10001 } },
    { fallbackMoveMsPerUnit: -0.1 },
    { fallbackMoveMsPerUnit: 10001 },
  ]) {
    const decoded = PERSONAL_SPEED_CODEC.decode({ version: 1, calibration: { ...CALIBRATION, ...patch } });
    assert.ok(decoded.ok);
    assert.equal(decoded.value.calibration, undefined, JSON.stringify(patch));
    assert.equal(decoded.diagnostics.length, 1);
  }
});

test('移動の時間が0の指と、範囲の端の値は読み込める', () => {
  const edge: PlaybackCalibration = {
    ...CALIBRATION,
    fingerRepeatMs: { LI: 25, RI: 10000 },
    fingerMoveMsPerUnit: { LI: 0, RI: 10000 },
    fallbackRepeatMs: 25,
    fallbackMoveMsPerUnit: 0,
  };
  const decoded = PERSONAL_SPEED_CODEC.decode(JSON.parse(JSON.stringify(PERSONAL_SPEED_CODEC.encode({ calibration: edge }))));
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.value, { calibration: edge });
});

test('同じキーを続けて打つ時間と移動の時間で、持つ指の組が違う保存値は捨てる', () => {
  for (const patch of [
    { fingerRepeatMs: { LI: 200 }, fingerMoveMsPerUnit: {} },
    { fingerRepeatMs: { LI: 200 }, fingerMoveMsPerUnit: { RI: 50 } },
    { fingerRepeatMs: {}, fingerMoveMsPerUnit: { LI: 50 } },
  ]) {
    const decoded = PERSONAL_SPEED_CODEC.decode({ version: 1, calibration: { ...CALIBRATION, ...patch } });
    assert.ok(decoded.ok);
    assert.equal(decoded.value.calibration, undefined, JSON.stringify(patch));
    assert.equal(decoded.diagnostics.length, 1);
  }
});

test('指ごとの移動速度と同じキーを続けて打つ速さを持つ旧い形の保存値は、変換せず捨てて診断を出す', () => {
  const old = {
    actionsPerSecond: 5,
    sameHandDifferentFingerActionsPerSecond: 4,
    sameHandDifferentFingerActionsPerSecondByPair: {},
    fingerSpeedUnitsPerSecond: { LI: 8 },
    fallbackFingerSpeedUnitsPerSecond: 7,
    sameKeyActionsPerSecond: 6,
    measuredAt: 1,
  };
  const decoded = PERSONAL_SPEED_CODEC.decode({ version: 1, calibration: old });
  assert.ok(decoded.ok);
  assert.equal(decoded.value.calibration, undefined);
  assert.equal(decoded.diagnostics.length, 1);
  assert.match(decoded.diagnostics[0].message, /個人速度を捨てました/);
});

test('かなの中・かなの境目の値は、分けない値を持たない保存値でも、書き出して読み直すと同じ値になる', () => {
  for (const keystrokeOverheadMs of [
    { 'other-within': 20.5, 'other-boundary': 90, 'chain-boundary': -3 },
    { arpeggio: 10, 'arpeggio-within': 5, 'arpeggio-boundary': 15, other: 60, 'other-within': 40, 'other-boundary': 80, repeat: 4, sfb: 9 },
  ]) {
    const value: PlaybackCalibration = { ...CALIBRATION, keystrokeOverheadMs };
    const decoded = PERSONAL_SPEED_CODEC.decode(JSON.parse(JSON.stringify(PERSONAL_SPEED_CODEC.encode({ calibration: value }))));
    assert.ok(decoded.ok);
    assert.deepEqual(decoded.value, { calibration: value });
    assert.deepEqual(decoded.diagnostics, []);
  }
});

test('かなの中・かなの境目の値が範囲外なら、他の値が範囲の中でも保存値ごと捨てる', () => {
  for (const keystrokeOverheadMs of [
    { 'other-within': 1001 },
    { other: 80, 'other-boundary': -1001 },
    { 'chain-within': 5, 'arpeggio-boundary': 2000 },
  ]) {
    const decoded = PERSONAL_SPEED_CODEC.decode({ version: 1, calibration: { ...CALIBRATION, keystrokeOverheadMs } });
    assert.ok(decoded.ok);
    assert.equal(decoded.value.calibration, undefined);
    assert.equal(decoded.diagnostics.length, 1);
  }
});

test('同時押しの上乗せを持つ個人速度は、書き出して読み直すと同じ値になる', () => {
  const withSimultaneous: PlaybackCalibration = {
    ...CALIBRATION,
    simultaneousOverheadMs: { 'both-hands': 35.5, 'one-hand': -20, thumb: 1000 },
  };
  const decoded = PERSONAL_SPEED_CODEC.decode(JSON.parse(JSON.stringify(PERSONAL_SPEED_CODEC.encode({ calibration: withSimultaneous }))));
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.value, { calibration: withSimultaneous });
  assert.deepEqual(decoded.diagnostics, []);
});

test('同時押しの上乗せを持たない個人速度は、持たないまま読み込める', () => {
  const decoded = PERSONAL_SPEED_CODEC.decode({ version: 1, calibration: CALIBRATION });
  assert.ok(decoded.ok);
  assert.equal(decoded.value.calibration?.simultaneousOverheadMs, undefined);
  assert.equal('simultaneousOverheadMs' in (decoded.value.calibration ?? {}), false);
});

test('同時押しの上乗せが範囲外、または知らない分け方のキーを持つ個人速度は、一部だけ残さず捨てる', () => {
  for (const simultaneousOverheadMs of [{ thumb: 1000.1 }, { 'one-hand': -1001 }, { 'both-hands': Number.NaN }, { 'three-fingers': 10 }]) {
    const decoded = PERSONAL_SPEED_CODEC.decode({ version: 1, calibration: { ...CALIBRATION, simultaneousOverheadMs } });
    assert.ok(decoded.ok);
    assert.equal(decoded.value.calibration, undefined, JSON.stringify(simultaneousOverheadMs));
    assert.equal(decoded.diagnostics.length, 1);
  }
});

test('文章に入った同時押しの分け方は、持つ値も空の値も持たない値も、そのまま書き出して読み直せる', () => {
  for (const kinds of [[], ['both-hands', 'thumb']] as const) {
    const calibration: PlaybackCalibration = { ...CALIBRATION, keystrokeOverheadMs: { other: 3 }, sentenceSimultaneousKinds: kinds };
    const encoded = PERSONAL_SPEED_CODEC.encode({ calibration });
    const decoded = PERSONAL_SPEED_CODEC.decode(JSON.parse(JSON.stringify(encoded)));
    assert.ok(decoded.ok);
    assert.deepEqual(decoded.value.calibration, calibration);
  }
  const without = PERSONAL_SPEED_CODEC.encode({ calibration: CALIBRATION });
  assert.equal('sentenceSimultaneousKinds' in (without.calibration as object), false);
});

test('文章に入った同時押しの分け方は、読み込みで知らない分け方・重複・並びでない値を持つと保存値ごと捨てる', () => {
  for (const kinds of [['both-hands', 'palm'], ['thumb', 'thumb'], 'thumb', [1]]) {
    const decoded = PERSONAL_SPEED_CODEC.decode({ version: 1, calibration: { ...CALIBRATION, sentenceSimultaneousKinds: kinds } });
    assert.ok(decoded.ok);
    assert.equal(decoded.value.calibration, undefined);
    assert.equal(decoded.diagnostics.length, 1);
  }
});

test('文章に入った同時押しの分け方は、読み込みでは並びを問わず、書き出しは決まった順にする', () => {
  const decoded = PERSONAL_SPEED_CODEC.decode({ version: 1, calibration: { ...CALIBRATION, sentenceSimultaneousKinds: ['thumb', 'both-hands'] } });
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.value.calibration?.sentenceSimultaneousKinds, ['both-hands', 'thumb']);
});
