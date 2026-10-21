import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noRemember, type AnalyzerSetMember } from '#analyzers/contract.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { SAMPLE_TEXT_JA } from '#input/text/sample-ja.ts';
import { buildSpanIndex, spanSpread, spanTotals, spanValue } from '#interpretation/span-metrics.ts';
import { generateTrace, type Trace } from '#trace/generate.ts';
import { computeMemberSeries, computeRunChartExtraction, pointPositionsOf, runChartDefinition } from './extract.ts';
import { DEFAULT_RUN_CHART_OPTIONS, type RunChartOptions } from './options.ts';

const geometry = buildGeometry('row-staggered');

function memberOf(text: string, layoutId: string, remember: AnalyzerSetMember['remember'] = noRemember): AnalyzerSetMember {
  const trace = generateTrace(text, LAYOUT_BY_ID.get(layoutId)!, geometry, { windowSize: 3, sfbHomeCost: true });
  return {
    target: { kind: 'layout', layoutId },
    trace,
    analysis: undefined as never,
    metrics: undefined as never,
    requestTrace: { requestTrace: () => trace },
    remember,
  };
}

const options = (partial: Partial<RunChartOptions> = {}): RunChartOptions => ({ ...DEFAULT_RUN_CHART_OPTIONS, ...partial });

test('点は1回の入力の選択ごとに1つで、横位置は組のkanaEndの最大、同じ位置は1つにまとめて昇順に並ぶ', () => {
  for (const layoutId of ['qwerty', 'jis-kana', 'nicola']) {
    const trace = generateTrace(SAMPLE_TEXT_JA.slice(0, 300), LAYOUT_BY_ID.get(layoutId)!, geometry, { windowSize: 3, sfbHomeCost: true });
    const positions = pointPositionsOf(trace);
    const maxEndBySelection = new Map<number, number>();
    for (const stroke of trace.strokes)
      maxEndBySelection.set(stroke.selectionIndex, Math.max(maxEndBySelection.get(stroke.selectionIndex) ?? -1, stroke.kanaEnd));
    assert.deepEqual(
      positions,
      [...new Set(maxEndBySelection.values())].sort((a, b) => a - b),
      layoutId,
    );
    for (let i = 1; i < positions.length; i++) assert.ok(positions[i]! > positions[i - 1]!);
    assert.ok(positions.length <= maxEndBySelection.size);
  }
});

test('ローマ字配列では1文字が複数ステップになるが、点はステップ数ではなく選択の数で決まる', () => {
  const romaji = generateTrace('きょうは', LAYOUT_BY_ID.get('qwerty')!, geometry, { windowSize: 3, sfbHomeCost: true });
  assert.ok(romaji.strokes.length > romaji.inputChars);
  assert.ok(pointPositionsOf(romaji).length <= romaji.inputChars);
});

test('先頭で窓に満たない点は、ある分の文字で求める（分母が窓幅より小さい）', () => {
  const member = memberOf('あいうえおかきくけこ', 'jis-kana');
  const series = computeMemberSeries(member, options({ window: 5, metric: 'perCharUnits' }));
  assert.deepEqual(series.positions.slice(0, 6), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(series.denominators.slice(0, 6), [1, 2, 3, 4, 5, 5]);
  // 点の値は、その点の文字位置で終わる範囲の分子と分母から出ている
  const index = buildSpanIndex(member.trace);
  series.positions.forEach((end, i) => {
    assert.equal(series.values[i], spanValue(spanTotals(index, 'perCharUnits', end - 4, end + 1)) ?? null);
  });
});

test('窓幅がテキスト全体以上なら、最後の点の値は中心線（テキスト全体の値）と一致する', () => {
  for (const metric of ['perCharUnits', 'meanPerStroke', 'sameFingerRate', 'perCharSteps'] as const) {
    const member = memberOf('あいうえおかきくけこ', 'jis-kana');
    const series = computeMemberSeries(member, options({ window: 1000, metric }));
    assert.equal(series.positions.at(-1), member.trace.inputChars - 1);
    assert.ok(Math.abs(series.values.at(-1)! - series.center) < 1e-9, metric);
  }
});

test('打鍵できなかった文字は点にならず、文字の指標では窓の分母に数える', () => {
  // 「漢」は読みに直せず打鍵できない
  const member = memberOf('a漢b', 'qwerty');
  const series = computeMemberSeries(member, options({ window: 5, metric: 'perCharUnits' }));
  assert.deepEqual(series.positions, [0, 2]);
  assert.deepEqual(series.denominators, [1, 3]);
  // 打鍵の指標の分母は、窓の中で打鍵したステップの数
  const strokeSeries = computeMemberSeries(member, options({ window: 5, metric: 'meanPerStroke' }));
  assert.deepEqual(strokeSeries.denominators, [1, 2]);
  assert.ok(strokeSeries.values.every((value) => value !== null));
});

test('中心線と目安線の係数はテキスト全体から求める', () => {
  const member = memberOf(SAMPLE_TEXT_JA.slice(0, 200), 'qwerty');
  const series = computeMemberSeries(member, options({ metric: 'perCharUnits' }));
  const spread = spanSpread(buildSpanIndex(member.trace), 'perCharUnits');
  assert.equal(series.center, spread.center);
  assert.equal(series.guideScale, 3 * spread.deviation);
});

test('指標と窓幅を変えても、索引と点の位置は覚えたものを使い、Traceから作り直さない', () => {
  const remembered = new Map<string, unknown>();
  let computed = 0;
  const remember: AnalyzerSetMember['remember'] = (key, compute) => {
    if (!remembered.has(key)) {
      computed++;
      remembered.set(key, compute());
    }
    return remembered.get(key) as never;
  };
  const member = memberOf(SAMPLE_TEXT_JA.slice(0, 200), 'qwerty', remember);
  computeMemberSeries(member, options());
  computeMemberSeries(member, options({ metric: 'sameFingerRate', window: 20 }));
  assert.equal(computed, 1);
});

test('メンバーの解決に失敗した枠は失敗の系列として残る', () => {
  const extracted = computeRunChartExtraction(
    [memberOf('あい', 'jis-kana')],
    [{ target: { kind: 'setup', setupId: 'gone' }, kind: 'reference', message: '見つかりません' }],
    options(),
  );
  assert.deepEqual(
    extracted.series.map((series) => series.kind),
    ['ok', 'failed'],
  );
});

test('定義は結果に指標と窓幅を持ち、抽出のキーは指標と窓幅で変わる', () => {
  const a = runChartDefinition.extractKeyOf(options());
  assert.notDeepEqual(a, runChartDefinition.extractKeyOf(options({ window: 20 })));
  assert.notDeepEqual(a, runChartDefinition.extractKeyOf(options({ metric: 'sameFingerRate' })));
});

function strokesOf(trace: Trace): number {
  return trace.strokes.length;
}

test('3万字前後のテキストでも、抽出は入力の単位の数に比例する時間で終わる', () => {
  const text = SAMPLE_TEXT_JA.repeat(Math.ceil(30000 / SAMPLE_TEXT_JA.length)).slice(0, 30000);
  const member = memberOf(text, 'qwerty');
  assert.ok(strokesOf(member.trace) > 30000);
  const started = performance.now();
  const series = computeMemberSeries(member, options({ window: 50 }));
  const elapsedMs = performance.now() - started;
  assert.ok(series.positions.length > 10000);
  // 区間ごとに全体を集計し直す方式なら字数の2乗（9億回級）になる。累積和なら数十ミリ秒に収まる
  assert.ok(elapsedMs < 2000, `${elapsedMs}ms`);
});
