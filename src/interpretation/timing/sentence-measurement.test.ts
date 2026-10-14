import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALL_FINGERS,
  buildGeometry,
  type Finger,
  type Key,
  type Point,
} from '#input/shapes/geometry.ts';
import type { Press, Stroke } from '#trace/generate.ts';
import type { PlaybackCalibration } from './calibration.ts';
import { playbackCrossHandDirection, type PlaybackTimingAnalysis } from './playback.ts';
import {
  SENTENCE_MIN_SAMPLES,
  applySentenceMeasurement as applyMeasurement,
  adjoinsPunctuation,
  interquartileMean,
  measureSentence,
  sentenceResultTable,
  type SentenceSample,
  type SentenceTap,
} from './sentence-measurement.ts';

const geometry = buildGeometry('row-staggered');

const home = (finger: Finger): Point => ({ ...geometry.homes[finger] });

function press(finger: Finger, sfb = false): Press {
  const point = home(finger);
  const key: Key = { id: `k-${finger}`, finger, x: point.x, y: point.y, row: 2, col: 0 };
  return { finger, keys: [key], target: point, origin: { at: point, from: 'home' }, gap: 1, distance: 0, sfb };
}

function stroke(index: number, p: Press): Stroke {
  return {
    index,
    char: String(index),
    inputChar: String(index),
    inputIndex: index,
    selectionIndex: index,
    aggregationGroupId: 'single',
    classifications: [],
    triggerKeys: [],
    pairedTriggerKeys: [],
    participations: [{ hand: p.finger.startsWith('L') ? 'left' : 'right', finger: p.finger, keys: p.keys, roles: ['output'] }],
    presses: [p],
    distance: 0,
    positions: Object.fromEntries(ALL_FINGERS.map((finger) => [finger, home(finger)])) as Stroke['positions'],
  };
}

const range = (startStrokeIndex: number, endStrokeIndex: number) => ({ startStrokeIndex, endStrokeIndex });

/** 左右の人差し指を交互に打つ列（すべて異手の遷移）。通常速度5/秒なら `normalMs` は200。 */
function alternating(count: number, chains: ReturnType<typeof range>[] = [], arpeggioSpans: ReturnType<typeof range>[] = [], sfbAt: readonly number[] = []): PlaybackTimingAnalysis {
  const strokes = Array.from({ length: count }, (_, index) =>
    stroke(index, press(index % 2 === 0 ? 'LI' : 'RI', sfbAt.includes(index))));
  return { strokes, transitions: [], chains, arpeggioSpans } as unknown as PlaybackTimingAnalysis;
}

/** 1本の文の1回分だけを数える測定。 */
function measureOne(analysis: PlaybackTimingAnalysis, calibration: PlaybackCalibration, taps: readonly SentenceTap[]) {
  return measureSentence([{ sentence: 0, analysis, taps }], calibration);
}

function applyWithCurrent(base: PlaybackCalibration | undefined, analysis: PlaybackTimingAnalysis, taps: readonly SentenceTap[], nowMs: number, current: PlaybackCalibration | undefined) {
  return applyMeasurement(base, [{ sentence: 0, analysis, taps }], nowMs, current);
}

/** 保存の時の保存値が、測定を始めた時の保存値と同じ場合。 */
function applySentenceMeasurement(base: PlaybackCalibration | undefined, analysis: PlaybackTimingAnalysis, taps: readonly SentenceTap[], nowMs: number) {
  return applyWithCurrent(base, analysis, taps, nowMs, base);
}

const NO_COUNTS = { arpeggio: 0, chain: 0, other: 0, repeat: 0, sfb: 0 };

const SAVED: PlaybackCalibration = {
  actionsPerSecond: 5,
  sameHandDifferentFingerActionsPerSecond: 5,
  sameHandDifferentFingerActionsPerSecondByPair: {},
  fingerSpeedUnitsPerSecond: {},
  fallbackFingerSpeedUnitsPerSecond: 10,
  measuredAt: 1,
};

/** ストローク `i` の直前からの間隔を `intervalOf(i)` にした記録。最初のストロークは時刻0。 */
function tapsFor(count: number, intervalOf: (index: number) => number, cleanAt: (index: number) => boolean = () => true): SentenceTap[] {
  const taps: SentenceTap[] = [];
  let atMs = 0;
  for (let index = 0; index < count; index++) {
    if (index > 0) atMs += intervalOf(index);
    taps.push({ atMs, clean: cleanAt(index) });
  }
  return taps;
}

test('間隔からnormalMsを引いた差の四分位平均を、その他の打鍵の上乗せにする', () => {
  const analysis = alternating(20);
  const taps = tapsFor(20, () => 260);
  const { counts, overheadMs } = measureOne(analysis, SAVED, taps);
  assert.deepEqual(counts, { ...NO_COUNTS, other: 19 });
  assert.deepEqual(overheadMs, { other: 60 });
});

test('四分位平均は、小さい方と大きい方からn/4個（切り捨て）ずつ除いた残りの平均である', () => {
  // n=4: 1個ずつ除いて中の2個。
  assert.equal(interquartileMean([100, 1, 3, 5]), 4);
  // n=5, 6, 7: 除く数の端数を切り捨てて1個ずつ。
  assert.equal(interquartileMean([1, 2, 4, 6, 100]), 4);
  assert.equal(interquartileMean([1, 2, 4, 6, 8, 100]), 5);
  assert.equal(interquartileMean([1, 2, 4, 6, 8, 10, 100]), 6);
  // n=3以下は除かず全部の平均。
  assert.equal(interquartileMean([2, 4, 9]), 5);
  assert.equal(interquartileMean([7]), 7);
  // 下限に届いた最小のn=10: 2個ずつ除いて中の6個。
  assert.equal(interquartileMean([-900, 0, 10, 20, 30, 40, 50, 60, 70, 5000]), 35);
});

test('下限に届いた最小の10打でも、四分位平均で打鍵の上乗せを求める', () => {
  // 11打から10の遷移。差は5,15,25,35,45,55,65,75の昇順に、-900と5000を足した10個。
  const diffs = [5000, 25, -900, 55, 15, 75, 35, 5, 65, 45];
  const analysis = alternating(11);
  const { counts, overheadMs } = measureOne(analysis, SAVED, tapsFor(11, (index) => 200 + diffs[index - 1]));
  assert.equal(counts.other, SENTENCE_MIN_SAMPLES);
  assert.deepEqual(overheadMs, { other: 40 });
});

test('大きい方と小さい方の25%に入る値は、より外れた値に替えても打鍵の上乗せが変わらない', () => {
  const base = tapsFor(41, (index) => 200 + (index <= 20 ? 10 : 80));
  const replaced = tapsFor(41, (index) => (index === 1 ? 200 - 5000 : index === 40 ? 200 + 9000 : 200 + (index <= 20 ? 10 : 80)));
  const before = measureOne(alternating(41), SAVED, base).overheadMs;
  assert.deepEqual(measureOne(alternating(41), SAVED, replaced).overheadMs, before);
});

test('差が大きく違う2つの群が混ざる時、四分位平均は群の割合に沿って動き、群の間で飛ばない', () => {
  const mixed = (lowCount: number) => measureOne(alternating(41), SAVED, tapsFor(41, (index) => 200 + (index <= lowCount ? 15 : 90))).overheadMs.other;
  // 40の遷移のうち、差15msが20個・差90msが20個: 除いた残りは両群10個ずつ。
  assert.equal(mixed(20), 52.5);
  // 21個と19個: 除いた残りは11個と9個。
  assert.equal(mixed(21), 48.75);
  assert.equal(mixed(19), 56.25);
});

test('負の値は、平均を取ってから0にする。先に0にした値の平均とは違う', () => {
  // 12個のうち下の3個と上の3個を除いた残りは-30,-10,10,30,50,70で、平均は20。
  const diffs = [-90, -70, -50, -30, -10, 10, 30, 50, 70, 90, 110, 130];
  assert.equal(interquartileMean(diffs), 20);
  // 先に0にしてから平均を取ると、残りが0,0,10,30,50,70になり値が変わる。
  assert.notEqual(interquartileMean(diffs.map((v) => Math.max(0, v))), 20);
  const { overheadMs } = measureOne(alternating(13), SAVED, tapsFor(13, (index) => 200 + diffs[index - 1]));
  assert.deepEqual(overheadMs, { other: 20 });
});

test('構造の種類ごとに別の打鍵の上乗せを求める', () => {
  // 遷移1〜13はArpeggio、15〜27はChain、0・14・28〜39はその他。
  const analysis = alternating(40, [range(14, 28)], [range(0, 14)]);
  const interval = (index: number) => (index <= 13 ? 230 : index >= 15 && index <= 27 ? 250 : 300);
  const { counts, overheadMs } = measureOne(analysis, SAVED, tapsFor(40, interval));
  assert.deepEqual(counts, { ...NO_COUNTS, arpeggio: 13, chain: 13, other: 13 });
  assert.deepEqual(overheadMs, { arpeggio: 30, chain: 50, other: 100 });
});

test('文節の切れ目のような長い間は、四分位平均で除かれる', () => {
  const analysis = alternating(30);
  const { overheadMs } = measureOne(analysis, SAVED, tapsFor(30, (index) => (index % 10 === 0 ? 3000 : 250)));
  assert.deepEqual(overheadMs, { other: 50 });
});

test('間隔がnormalMsより短くて四分位平均が負なら、負の値のまま持つ', () => {
  const { overheadMs } = measureOne(alternating(20), SAVED, tapsFor(20, () => 150));
  assert.deepEqual(overheadMs, { other: -50 });
});

test('normalMsは測定の時点の保存値で求める', () => {
  const slower = { ...SAVED, actionsPerSecond: 4 };
  const { overheadMs } = measureOne(alternating(20), slower, tapsFor(20, () => 300));
  assert.deepEqual(overheadMs, { other: 50 });
});

test('数えたストロークが10未満の種類は打鍵の上乗せを持たない', () => {
  const analysis = alternating(30, [], [range(0, 10)]);
  const { counts, overheadMs } = measureOne(analysis, SAVED, tapsFor(30, () => 250));
  assert.equal(counts.arpeggio, 9);
  assert.equal(counts.other, 20);
  assert.equal(SENTENCE_MIN_SAMPLES, 10);
  assert.deepEqual(overheadMs, { other: 50 });
});

test('最初のストロークと違うキーを押したストロークは数えず、同指連続を含むストロークは構造の種類に数えない', () => {
  const analysis = alternating(30, [], [], [5, 6]);
  const taps = tapsFor(30, () => 250, (index) => index !== 10 && index !== 11);
  const { counts } = measureOne(analysis, SAVED, taps);
  // 29の遷移から、違うキーを押した2つを除く。同指連続の2つは、構造の種類でなく同指連続として数える。
  assert.equal(counts.other, 25);
  assert.equal(counts.sfb, 2);
});

test('違うキーを押したストロークの間隔は、四分位平均に影響しない', () => {
  const analysis = alternating(30);
  const taps = tapsFor(30, (index) => (index === 12 ? 5000 : 250), (index) => index !== 12);
  assert.deepEqual(measureOne(analysis, SAVED, taps).overheadMs, { other: 50 });
});

test('反映は打鍵の上乗せだけを置き換え、他の項目と、持たない種類の古い値は残さない', () => {
  const base: PlaybackCalibration = { ...SAVED, keystrokeOverheadMs: { chain: 5, other: 5 } };
  const analysis = alternating(20);
  const result = applySentenceMeasurement(base, analysis, tapsFor(20, () => 260), 99);
  assert.ok(result.ok);
  assert.deepEqual(result.calibration, { ...SAVED, keystrokeOverheadMs: { other: 60 }, measuredAt: 99 });
});

test('保存の時の保存値が、測定を始めた時の保存値と違えば、保存せずに測り直させる', () => {
  const analysis = alternating(20);
  const taps = tapsFor(20, () => 260);
  const same = applyWithCurrent(SAVED, analysis, taps, 1, { ...SAVED });
  assert.ok(same.ok);
  for (const current of [
    { ...SAVED, actionsPerSecond: 6 },
    { ...SAVED, fingerSpeedUnitsPerSecond: { LI: 9 } },
    { ...SAVED, keystrokeOverheadMs: { other: 1 } },
    undefined,
  ]) {
    assert.deepEqual(applyWithCurrent(SAVED, analysis, taps, 1, current), { ok: false, reason: 'changed' });
  }
});

test('保存値が無い時は反映できない', () => {
  const result = applySentenceMeasurement(undefined, alternating(20), tapsFor(20, () => 260), 1);
  assert.deepEqual(result, { ok: false, reason: 'no-saved-value' });
});

test('どの種類も10未満なら、保存せずに測り直させる', () => {
  const result = applySentenceMeasurement(SAVED, alternating(8), tapsFor(8, () => 260), 1);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, 'too-few');
  assert.equal(!result.ok && result.reason === 'too-few' && result.measurement.counts.other, 7);
});

test('打鍵の上乗せが範囲を外れたら、保存せずに測り直させる', () => {
  const result = applySentenceMeasurement(SAVED, alternating(20), tapsFor(20, () => 1300), 1);
  assert.equal(!result.ok && result.reason, 'out-of-range');
  // 1000ミリ秒ちょうどは保存できる
  const edge = applySentenceMeasurement(SAVED, alternating(20), tapsFor(20, () => 1200), 1);
  assert.ok(edge.ok);
  assert.deepEqual(edge.calibration.keystrokeOverheadMs, { other: 1000 });
});

test('下限の数は、文ごとに数える回のうち最大の回の数で、同じ文の2回目と3回目で数え直さない', () => {
  const analysis = alternating(10);
  const taps = tapsFor(10, () => 260);
  const sample = (sentence: number): SentenceSample => ({ sentence, analysis, taps });
  // 1回分で数えるのは9打。同じ文の2回目と3回目を数えても、9打のまま。
  const sameSentence = measureSentence([sample(0), sample(0)], SAVED);
  assert.equal(sameSentence.counts.other, 9);
  assert.deepEqual(sameSentence.overheadMs, {});
  // 別の文は足す。
  const otherSentence = measureSentence([sample(0), sample(0), sample(1), sample(1)], SAVED);
  assert.equal(otherSentence.counts.other, 18);
  assert.deepEqual(otherSentence.overheadMs, { other: 60 });
});

test('文ごとの数は回の最大で、回ごとに数が違えば大きい回の数になる', () => {
  const short = alternating(6);
  const long = alternating(12);
  const result = measureSentence([
    { sentence: 0, analysis: short, taps: tapsFor(6, () => 260) },
    { sentence: 0, analysis: long, taps: tapsFor(12, () => 260) },
    { sentence: 1, analysis: long, taps: tapsFor(12, () => 260) },
    { sentence: 1, analysis: short, taps: tapsFor(6, () => 260) },
  ], SAVED);
  assert.equal(result.counts.other, 11 + 11);
});

test('数えるのは渡された回だけで、各回の最初のストロークは数えない', () => {
  const analysis = alternating(12);
  const result = measureSentence([
    { sentence: 0, analysis, taps: tapsFor(12, () => 260) },
    { sentence: 1, analysis, taps: tapsFor(12, () => 260) },
  ], SAVED);
  // 回をまたぐ間隔は作られず、12打の回が2つなら数えるのは11打ずつ。
  assert.equal(result.counts.other, 22);
});

/** 指の位置を変えながら打つ列。`fingers[i]`の指で、`keyOf(i)`のキーを打ち、距離が`distanceOf(i)`の時は同指連続とする。 */
function custom(
  fingers: readonly Finger[],
  keyOf: (index: number) => string,
  distanceOf: (index: number) => number = () => 0,
  inputCharOf: (index: number) => string = String,
  inputIndexOf: (index: number) => number = (index) => index,
): PlaybackTimingAnalysis {
  const strokes = fingers.map((finger, index) => {
    const base = stroke(index, press(finger));
    const distance = distanceOf(index);
    const key: Key = { ...base.presses[0].keys[0], id: keyOf(index) };
    return {
      ...base,
      inputChar: inputCharOf(index),
      inputIndex: inputIndexOf(index),
      presses: [{ ...base.presses[0], keys: [key], distance, sfb: distance > 0 }],
    };
  });
  return { strokes, transitions: [], chains: [], arpeggioSpans: [] } as unknown as PlaybackTimingAnalysis;
}

const REPEATING = custom(Array.from({ length: 20 }, () => 'LI' as Finger), () => 'f');

test('続け打ちの差は、間隔から続け打ちのnormalMsを引いた四分位平均で、構造の種類に混ぜない', () => {
  // 同じキーを続けて打つ速さを持たない保存値では、続け打ちのnormalMsは通常速度の200ms。
  const without = measureOne(REPEATING, SAVED, tapsFor(20, () => 260));
  assert.deepEqual(without.counts, { ...NO_COUNTS, repeat: 19 });
  assert.deepEqual(without.overheadMs, { repeat: 60 });
  // 8アクション/秒（125ms）を持つ保存値では、そのnormalMsを引く。
  const withSameKey = measureOne(REPEATING, { ...SAVED, sameKeyActionsPerSecond: 8 }, tapsFor(20, () => 260));
  assert.deepEqual(withSameKey.overheadMs, { repeat: 135 });
});

test('同じキーを続けて打っても、押下を複数持つストロークは続け打ちに数えない', () => {
  const analysis = custom(Array.from({ length: 20 }, () => 'LI' as Finger), () => 'f');
  const doubled = {
    ...analysis,
    strokes: analysis.strokes.map((s) => ({ ...s, presses: [s.presses[0], { ...s.presses[0], finger: 'RI' as Finger }] })),
  } as PlaybackTimingAnalysis;
  const { counts } = measureOne(doubled, SAVED, tapsFor(20, () => 260));
  assert.equal(counts.repeat, 0);
});

test('同指連続の差は、間隔からmax(normalMs, 指の移動の時間)を引いた四分位平均になる', () => {
  // 同じ指が離れた2つのキーを往復する。距離2u、LIの移動速度4u/秒なら移動の時間は500msで、normalMsの200msより長い。
  const analysis = custom(
    Array.from({ length: 20 }, () => 'LI' as Finger),
    (index) => (index % 2 === 0 ? 'f' : 'r'),
    (index) => (index === 0 ? 0 : 2),
  );
  const calibration = { ...SAVED, fingerSpeedUnitsPerSecond: { LI: 4 } };
  const slow = measureOne(analysis, calibration, tapsFor(20, () => 600));
  assert.deepEqual(slow.counts, { ...NO_COUNTS, sfb: 19 });
  assert.deepEqual(slow.overheadMs, { sfb: 100 });
  // 移動の時間が1打の時間より短ければ、normalMsとの差になる。距離0.5uなら移動の時間は125ms。
  const near = custom(
    Array.from({ length: 20 }, () => 'LI' as Finger),
    (index) => (index % 2 === 0 ? 'f' : 'r'),
    (index) => (index === 0 ? 0 : 0.5),
  );
  assert.deepEqual(measureOne(near, calibration, tapsFor(20, () => 260)).overheadMs, { sfb: 60 });
  // 解析設定のsameFingerDelayは見ない。移動の時間が律速する同指連続も、基準に移動の時間が入るので差を測れる。
  assert.deepEqual(measureOne(analysis, calibration, tapsFor(20, () => 500)).overheadMs, { sfb: 0 });
});

test('句読点を打つストロークと、その入力単位の最後のストロークの次のストロークは、数えない', () => {
  // 入力単位は「あ」「あ」…「、」「い」…の順。ストローク5が「、」、ストローク6がその直後。
  const chars = ['あ', 'あ', 'あ', 'あ', 'あ', '、'];
  const analysis = alternating(30);
  const strokes = analysis.strokes.map((s, index) => ({ ...s, inputChar: chars[index] ?? 'い', inputIndex: index }));
  const punctuated = { ...analysis, strokes } as PlaybackTimingAnalysis;
  const { counts } = measureOne(punctuated, SAVED, tapsFor(30, () => 260));
  assert.equal(counts.other, 27);
  // 句読点の前後の長い間は値に入らない。
  const paused = tapsFor(30, (index) => (index === 5 || index === 6 ? 4000 : 260));
  assert.deepEqual(measureOne(punctuated, SAVED, paused).overheadMs, { other: 60 });
  assert.equal(measureOne(analysis, SAVED, paused).counts.other, 29);
});

test('句読点が複数のストロークで打つ入力単位なら、その全ストロークと最後の次のストロークを数えない', () => {
  const strokes = alternating(8).strokes.map((s, index) => ({
    ...s,
    inputChar: index === 2 || index === 3 ? '。' : 'あ',
    inputIndex: index <= 2 ? index : index - 1,
  }));
  assert.deepEqual([1, 2, 3, 4, 5].map((index) => adjoinsPunctuation(strokes, index)), [false, true, true, true, false]);
});

test('句読点は「、」「。」「，」「．」「！」「？」で、他の文字の前後は数える', () => {
  const stroke = (inputChar: string, inputIndex: number) => ({ inputChar, inputIndex });
  for (const mark of ['、', '。', '，', '．', '！', '？']) {
    assert.equal(adjoinsPunctuation([stroke(mark, 0), stroke('あ', 1)], 1), true, mark);
    assert.equal(adjoinsPunctuation([stroke('あ', 0), stroke(mark, 1)], 1), true, mark);
  }
  for (const other of ['あ', 'ー', ',', '.', '!', '?', 'っ']) {
    assert.equal(adjoinsPunctuation([stroke(other, 0), stroke(other, 1)], 1), false, other);
  }
  assert.equal(adjoinsPunctuation([stroke('、', 0)], 0), true);
  assert.equal(adjoinsPunctuation([stroke('あ', 0)], 0), false);
});

test('下限は差の種類ごとに当てはめ、届いた種類だけを保存する', () => {
  // 25打の列のうち、10〜14が同指連続、残りは異手で構造の種類はその他。続け打ちは無い。
  const analysis = custom(
    Array.from({ length: 30 }, (_, index) => (index % 2 === 0 ? 'LI' : 'RI') as Finger),
    (index) => `k${index}`,
    (index) => (index >= 10 && index < 15 ? 1 : 0),
  );
  const { counts, overheadMs } = measureOne(analysis, SAVED, tapsFor(30, () => 260));
  assert.deepEqual(counts, { ...NO_COUNTS, other: 24, sfb: 5 });
  assert.deepEqual(overheadMs, { other: 60 });
  const result = applySentenceMeasurement(SAVED, analysis, tapsFor(30, () => 260), 7);
  assert.ok(result.ok);
  assert.deepEqual(result.calibration.keystrokeOverheadMs, { other: 60 });
});

const emptyRow = (count = 0) => ({ count });

test('表の1行は、数えたストロークの基準の時間・間隔・差の四分位平均を持ち、差は2つの四分位平均の差と一致しないことがある', () => {
  // 通常速度5/秒の基準は200ms。間隔150msの差は-50msで、負の値のまま持つ。
  const { kinds, overheadMs } = measureOne(alternating(20), SAVED, tapsFor(20, () => 150));
  assert.deepEqual(kinds.other, { count: 19, baseMs: 200, intervalMs: 150, differenceMs: -50 });
  assert.deepEqual(overheadMs, { other: -50 });
});

test('異手の向きごとの行の差も、負の値のまま持つ', () => {
  const { crossHand } = measureOne(alternating(20), SAVED, tapsFor(20, () => 150));
  assert.equal(crossHand['L→R'].differenceMs, -50);
  assert.equal(crossHand['R→L'].differenceMs, -50);
});

test('数えたストロークが無い種類の行は、打数だけを持ち四分位平均を持たない', () => {
  const { kinds, crossHand } = measureOne(alternating(20), SAVED, tapsFor(20, () => 260));
  assert.deepEqual(kinds.arpeggio, emptyRow());
  assert.deepEqual(kinds.chain, emptyRow());
  assert.deepEqual(kinds.repeat, emptyRow());
  assert.deepEqual(kinds.sfb, emptyRow());
  assert.equal(crossHand['L→R'].count + crossHand['R→L'].count, 19);
});

test('下限に届かない種類の行も、打数と四分位平均を持つ', () => {
  const { kinds, overheadMs } = measureOne(alternating(6), SAVED, tapsFor(6, () => 260));
  assert.deepEqual(overheadMs, {});
  assert.deepEqual(kinds.other, { count: 5, baseMs: 200, intervalMs: 260, differenceMs: 60 });
});

test('異手の方向は、今のストロークの押下の順に直前の押下と組んで、手の違う最初の組の向きで決まる', () => {
  const at = (...fingers: Finger[]): Stroke => ({ ...stroke(0, press(fingers[0])), presses: fingers.map((finger) => press(finger)) });
  assert.equal(playbackCrossHandDirection(at('RI'), at('LI')), 'L→R');
  assert.equal(playbackCrossHandDirection(at('LI'), at('RI')), 'R→L');
  assert.equal(playbackCrossHandDirection(at('LM'), at('LI')), undefined);
  assert.equal(playbackCrossHandDirection(at('LI'), at('LI')), undefined);
  // 両手の押下を持つストローク。今の押下LIは直前のLMと同手なので飛ばし、RIと直前のLMの組で決まる。
  assert.equal(playbackCrossHandDirection(at('LI', 'RI'), at('LM')), 'L→R');
  // 今の押下LIと直前のRIの組が先に見つかる。
  assert.equal(playbackCrossHandDirection(at('LI', 'RI'), at('RI')), 'R→L');
  // 直前のストロークの押下の順でも、最初に見つかった組で決まる。
  assert.equal(playbackCrossHandDirection(at('RI'), at('LM', 'LI')), 'L→R');
  assert.equal(playbackCrossHandDirection(undefined, at('LI')), undefined);
});

test('「その他」の異手のストロークは、その他の行と方向の行の両方に入り、ArpeggioとChainの遷移は方向の行に入らない', () => {
  // 遷移1〜13はArpeggio、15〜27はChain、14と28〜39はその他。奇数番はL→R、偶数番はR→L。
  const analysis = alternating(40, [range(14, 28)], [range(0, 14)]);
  const calibration: PlaybackCalibration = { ...SAVED, actionsPerSecondByDirection: { 'L→R': 10, 'R→L': 5 } };
  const { kinds, crossHand, counts } = measureOne(analysis, calibration, tapsFor(40, (index) => (index % 2 === 1 ? 250 : 260)));
  assert.deepEqual(counts, { ...NO_COUNTS, arpeggio: 13, chain: 13, other: 13 });
  assert.deepEqual(crossHand['L→R'], { count: 6, baseMs: 100, intervalMs: 250, differenceMs: 150 });
  assert.deepEqual(crossHand['R→L'], { count: 7, baseMs: 200, intervalMs: 260, differenceMs: 60 });
  assert.equal(crossHand['L→R'].count + crossHand['R→L'].count, kinds.other.count);
  assert.equal(kinds.arpeggio.count, 13);
});

test('方向の行の打数も、文ごとに数える回の最大を全文で足した数で求める', () => {
  const analysis = alternating(20);
  const samples: SentenceSample[] = [
    { sentence: 0, analysis, taps: tapsFor(20, () => 260) },
    { sentence: 0, analysis, taps: tapsFor(20, () => 260, (index) => index > 10) },
  ];
  const { crossHand } = measureSentence(samples, SAVED);
  assert.equal(crossHand['L→R'].count + crossHand['R→L'].count, 19);
});

test('表は、保存した時は届いた種類を「保存した」、届かない種類を「下限に届かず」とする', () => {
  const result = applySentenceMeasurement(SAVED, alternating(20), tapsFor(20, () => 260), 5);
  const table = sentenceResultTable(result);
  assert.ok(table);
  assert.equal(table.kinds.length, 5);
  assert.equal(table.crossHand.length, 2);
  assert.deepEqual(table.kinds.map(({ kind, status }) => [kind, status]), [
    ['arpeggio', 'below-minimum'],
    ['chain', 'below-minimum'],
    ['other', 'saved'],
    ['repeat', 'below-minimum'],
    ['sfb', 'below-minimum'],
  ]);
  assert.deepEqual(table.kinds[0].stats, emptyRow());
});

test('表は、どの種類も下限に届かず保存しなかった時にも出る', () => {
  const table = sentenceResultTable(applySentenceMeasurement(SAVED, alternating(6), tapsFor(6, () => 260), 5));
  assert.ok(table);
  assert.ok(table.kinds.every(({ status }) => status === 'below-minimum'));
  assert.equal(table.kinds[2].stats.intervalMs, 260);
});

test('表は、範囲の外で保存しなかった時に出て、届いた種類を「範囲の外」、届かない種類を「下限に届かず」とする', () => {
  const result = applySentenceMeasurement(SAVED, alternating(20), tapsFor(20, () => 5000), 5);
  assert.ok(!result.ok && result.reason === 'out-of-range');
  const table = sentenceResultTable(result);
  assert.ok(table);
  assert.deepEqual(table.kinds.map(({ status }) => status), ['below-minimum', 'below-minimum', 'out-of-range', 'below-minimum', 'below-minimum']);
  assert.equal(table.kinds[2].stats.differenceMs, 4800);
});

test('表は、保存値が無い時と測定の途中で保存値が変わった時は出さない', () => {
  assert.equal(sentenceResultTable(applySentenceMeasurement(undefined, alternating(20), tapsFor(20, () => 260), 5)), undefined);
  const changed = applyWithCurrent(SAVED, alternating(20), tapsFor(20, () => 260), 5, { ...SAVED, actionsPerSecond: 6 });
  assert.ok(!changed.ok && changed.reason === 'changed');
  assert.equal(sentenceResultTable(changed), undefined);
});

test('出力の文字の読み方で完了したストロークは、そのストロークの間隔と直後の間隔を数えない', () => {
  const analysis = alternating(21);
  const flagged = new Set([0, 7, 20]);
  const taps = tapsFor(21, () => 260).map((tap, index) => (flagged.has(index) ? { ...tap, outputCompleted: true } : tap));
  const { counts, crossHand } = measureOne(analysis, SAVED, taps);
  // 20の間隔（1〜20）のうち、7と20は自分の間隔、1と8は直前が印のあるストロークの間隔で外れて、20 - 4 = 16。
  // 0は最初のストロークで自分の間隔が無い。
  assert.deepEqual(counts, { ...NO_COUNTS, other: 16 });
  assert.equal(crossHand['L→R'].count + crossHand['R→L'].count, 16);
});

test('出力の文字の読み方で完了した印が無ければ、数えるストロークは今と同じ', () => {
  const analysis = alternating(21);
  const plain = measureOne(analysis, SAVED, tapsFor(21, () => 260));
  const marked = measureOne(analysis, SAVED, tapsFor(21, () => 260).map((tap) => ({ ...tap, outputCompleted: false })));
  assert.deepEqual(marked, plain);
  assert.equal(plain.counts.other, 20);
});
