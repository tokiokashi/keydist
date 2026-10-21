import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { SAMPLE_TEXT_JA } from '#input/text/sample-ja.ts';
import { generateTrace, type Trace, type TracePolicy } from '#trace/generate.ts';
import { computeTraceScalars } from './metrics.ts';
import {
  buildSpanIndex,
  guideHalfWidth,
  guideScaleOf,
  GUIDE_SIGMA,
  isPerCharMetric,
  SPAN_METRIC_IDS,
  spanSpread,
  spanTotals,
  spanValue,
  wholeTotals,
} from './span-metrics.ts';

const geometry = buildGeometry('row-staggered');
const policy: TracePolicy = { windowSize: 3, sfbHomeCost: true };

const near = (a: number, b: number, message?: string) =>
  assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${message ?? ''} expected ${b}, got ${a}`);

/** 配列ごとの試験テキスト。ローマ字の配列は「し」「きょう」のように1文字が複数ステップになる。 */
const TEXT = SAMPLE_TEXT_JA.slice(0, 400);
const LAYOUT_IDS = ['qwerty', 'jis-kana', 'nicola', 'naginata-v18', 'shin-koume'];

function traceOf(layoutId: string, text = TEXT): Trace {
  return generateTrace(text, LAYOUT_BY_ID.get(layoutId)!, geometry, policy);
}

/** `[0, inputChars)` を重ならない範囲に分ける。幅は不揃いにして、境目の位置に依存しないことを確かめる。 */
function partition(inputChars: number): [number, number][] {
  const spans: [number, number][] = [];
  const widths = [1, 7, 13, 3, 50, 2];
  let at = 0;
  for (let i = 0; at < inputChars; i++) {
    const to = Math.min(inputChars, at + widths[i % widths.length]!);
    spans.push([at, to]);
    at = to;
  }
  return spans;
}

/** 全体の値（`computeTraceScalars`）。%の指標は割合に戻して比べる。 */
function wholeScalar(trace: Trace, metric: (typeof SPAN_METRIC_IDS)[number]): number {
  const scalars = computeTraceScalars(trace);
  return metric === 'sameFingerRate' ? scalars.sameFingerRate / 100 : scalars[metric];
}

for (const layoutId of LAYOUT_IDS) {
  for (const metric of SPAN_METRIC_IDS) {
    test(`${layoutId}: ${metric} は重ならない範囲に分けて分子と分母を足すと全体の値に戻る`, () => {
      const trace = traceOf(layoutId);
      assert.ok(trace.strokes.length > 0);
      const index = buildSpanIndex(trace);
      let numerator = 0;
      let denominator = 0;
      for (const [from, to] of partition(trace.inputChars)) {
        const totals = spanTotals(index, metric, from, to);
        numerator += totals.numerator;
        denominator += totals.denominator;
      }
      const whole = wholeTotals(index, metric);
      near(numerator, whole.numerator, '分子');
      assert.equal(denominator, whole.denominator);
      near(numerator / denominator, wholeScalar(trace, metric), '全体の値');
      near(spanValue(whole)!, wholeScalar(trace, metric), '全体の範囲の値');
    });
  }
}

test('範囲の集計は、kanaEndが範囲に入るステップを直接足した値と一致する（ステップはkanaEndの文字位置に帰属する）', () => {
  for (const layoutId of LAYOUT_IDS) {
    const trace = traceOf(layoutId);
    const index = buildSpanIndex(trace);
    for (const [from, to] of [...partition(trace.inputChars), [3, 40], [0, 1], [17, 18], [100, 250]] as [number, number][]) {
      const inside = trace.strokes.filter((stroke) => from <= stroke.kanaEnd && stroke.kanaEnd < to);
      const distance = inside.reduce((sum, stroke) => sum + stroke.distance, 0);
      const sameFinger = inside.reduce((sum, stroke) => sum + stroke.presses.filter((press) => press.sfb).length, 0);
      const context = `${layoutId} [${from}, ${to})`;
      near(spanTotals(index, 'perCharUnits', from, to).numerator, distance, context);
      assert.equal(spanTotals(index, 'perCharUnits', from, to).denominator, to - from, context);
      assert.equal(spanTotals(index, 'perCharSteps', from, to).numerator, inside.length, context);
      assert.equal(spanTotals(index, 'meanPerStroke', from, to).denominator, inside.length, context);
      assert.equal(spanTotals(index, 'sameFingerRate', from, to).numerator, sameFinger, context);
    }
  }
});

test('すべてのステップが文字位置の範囲に帰属する（kanaEndが範囲外のステップが無い）', () => {
  for (const layoutId of LAYOUT_IDS) {
    const trace = traceOf(layoutId);
    for (const stroke of trace.strokes) {
      assert.ok(stroke.kanaEnd >= 0 && stroke.kanaEnd < trace.inputChars, `${layoutId} ${stroke.index}`);
    }
    // 帰属したステップの数を全部足すとステップ数に戻る（二重に数えず、取りこぼさない）
    const index = buildSpanIndex(trace);
    assert.equal(index.stepsUpTo[trace.inputChars], trace.strokes.length);
  }
});

test('ローマ字配列で1文字が複数ステップになる入力も、kanaEndを含む範囲にだけ入る', () => {
  // 「きょう」はki/lyo/uのように複数の入力の選択に分かれうる。文字位置1の「ょ」で終わるステップは範囲[1,2)にだけ入る
  const trace = traceOf('qwerty', 'きょう');
  const index = buildSpanIndex(trace);
  const total = trace.strokes.length;
  let counted = 0;
  for (let at = 0; at < trace.inputChars; at++) counted += spanTotals(index, 'perCharSteps', at, at + 1).numerator;
  assert.equal(counted, total);
  for (const stroke of trace.strokes) {
    const inside = spanTotals(index, 'perCharSteps', stroke.kanaEnd, stroke.kanaEnd + 1).numerator;
    assert.ok(inside >= 1);
  }
});

test('打鍵できなかった文字は文字の指標の分母に数え、打鍵の指標の分母には数えない', () => {
  // 「漢」は読みに直せず打てない文字として残る
  const trace = generateTrace('a漢b', LAYOUT_BY_ID.get('qwerty')!, geometry, policy);
  assert.equal(trace.skipped, 1);
  const index = buildSpanIndex(trace);
  const skippedOnly = spanTotals(index, 'perCharUnits', 1, 2);
  assert.equal(skippedOnly.denominator, 1);
  assert.equal(skippedOnly.numerator, 0);
  const strokeMetric = spanTotals(index, 'meanPerStroke', 1, 2);
  assert.equal(strokeMetric.denominator, 0);
  assert.equal(spanValue(strokeMetric), undefined);
  assert.equal(spanValue(spanTotals(index, 'sameFingerRate', 1, 2)), undefined);
  // 文字の指標は打てない文字だけの範囲でも値は0（欠けではない）
  assert.equal(spanValue(skippedOnly), 0);
});

test('範囲はテキストの両端に収める', () => {
  const trace = traceOf('qwerty', 'あいう');
  const index = buildSpanIndex(trace);
  assert.deepEqual(spanTotals(index, 'perCharSteps', -5, 100), wholeTotals(index, 'perCharSteps'));
  assert.equal(spanTotals(index, 'perCharSteps', 2, 2).denominator, 0);
  assert.equal(spanTotals(index, 'perCharSteps', 5, 1).denominator, 0);
});

test('空のテキストでも落ちず、中心線は0', () => {
  const trace = generateTrace('', LAYOUT_BY_ID.get('qwerty')!, geometry, policy);
  const index = buildSpanIndex(trace);
  for (const metric of SPAN_METRIC_IDS) {
    assert.deepEqual(spanSpread(index, metric), { center: 0, deviation: 0 });
    assert.equal(spanValue(wholeTotals(index, metric)), undefined);
  }
});

for (const layoutId of LAYOUT_IDS) {
  test(`${layoutId}: 中心線はテキスト全体の値（computeTraceScalars）と一致する`, () => {
    const trace = traceOf(layoutId);
    const index = buildSpanIndex(trace);
    for (const metric of SPAN_METRIC_IDS) near(spanSpread(index, metric).center, wholeScalar(trace, metric), metric);
  });
}

test('目安線の幅: 同指率はどのステップの同指の押下も0か1ならs²=p(1−p)に一致する', () => {
  for (const layoutId of ['qwerty', 'colemak-dh', 'dvorak']) {
    const trace = traceOf(layoutId);
    // 前提: 1ステップの同指の押下の数が2以上になる入力を含まない
    const maxSameFinger = Math.max(...trace.strokes.map((stroke) => stroke.presses.filter((press) => press.sfb).length));
    assert.ok(maxSameFinger <= 1, layoutId);
    const index = buildSpanIndex(trace);
    const { center, deviation } = spanSpread(index, 'sameFingerRate');
    assert.ok(center > 0 && center < 1, `${layoutId} p=${center}`);
    near(deviation ** 2, center * (1 - center), layoutId);
  }
});

test('目安線の幅: 分母1つあたりのばらつきを定義どおりに求める（距離、手で数えた小さな入力）', () => {
  // 「あ」「い」を打つqwertyの距離を文字位置ごとに並べ、s²=Σ(x_i−c)²/nを直接計算して比べる
  const trace = traceOf('qwerty', 'あいうえおかきくけこ');
  const index = buildSpanIndex(trace);
  const perChar = new Array<number>(trace.inputChars).fill(0);
  for (const stroke of trace.strokes) perChar[stroke.kanaEnd] = perChar[stroke.kanaEnd]! + stroke.distance;
  const c = perChar.reduce((a, b) => a + b, 0) / perChar.length;
  const variance = perChar.reduce((sum, x) => sum + (x - c) ** 2, 0) / perChar.length;
  near(spanSpread(index, 'perCharUnits').deviation ** 2, variance);
  // 打鍵の指標は、ステップごとの距離で求める
  const strokeMean = trace.strokes.reduce((sum, stroke) => sum + stroke.distance, 0) / trace.strokes.length;
  const strokeVariance = trace.strokes.reduce((sum, stroke) => sum + (stroke.distance - strokeMean) ** 2, 0) / trace.strokes.length;
  near(spanSpread(index, 'meanPerStroke').deviation ** 2, strokeVariance);
});

test('目安線の幅は分母の平方根に反比例し、係数は3', () => {
  assert.equal(GUIDE_SIGMA, 3);
  near(guideHalfWidth(guideScaleOf(2), 4), 3);
  near(guideHalfWidth(guideScaleOf(2), 16), 1.5);
  assert.equal(guideHalfWidth(guideScaleOf(2), 0), 0);
});

test('文字の指標かどうか', () => {
  assert.equal(isPerCharMetric('perCharUnits'), true);
  assert.equal(isPerCharMetric('perCharSteps'), true);
  assert.equal(isPerCharMetric('meanPerStroke'), false);
  assert.equal(isPerCharMetric('sameFingerRate'), false);
});
