import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeBunsetsuStatsExtraction } from '#analyzers/bunsetsu-stats/extract.ts';
import { DEFAULT_EXTRACTION_ASSETS, noRemember, type AnalyzerSetMember, type AnalyzerSetMemberFailure } from '#analyzers/contract.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { SAMPLE_TEXT_JA } from '#input/text/sample-ja.ts';
import { quantileNearestRank } from '#interpretation/segments.ts';
import { generateTrace } from '#trace/generate.ts';
import { boxPlotDefinition, computeBoxPlotExtraction, type BoxPlotOkRow } from './extract.ts';

const geometry = buildGeometry('row-staggered');
const TEXT = SAMPLE_TEXT_JA.replace(/\s/g, '').slice(0, 120);
const BOUNDARIES = [4, 9, 15, 22, 30, 41, 60, 61, 70, 85, 99];
const SEGMENTATION = { boundaries: BOUNDARIES, origin: 'kana-only', splitter: { name: 'テスト用', version: '1' } } as const;

function memberOf(layoutId: string, options: { text?: string; boundaries?: readonly number[]; segmentation?: boolean } = {}): AnalyzerSetMember {
  const text = options.text ?? TEXT;
  const trace = generateTrace(text, LAYOUT_BY_ID.get(layoutId)!, geometry, { windowSize: 3, sfbHomeCost: true });
  return {
    target: { kind: 'layout', layoutId },
    text,
    trace,
    analysis: undefined as never,
    metrics: undefined as never,
    // 追加のTraceを依頼したら失敗させる
    requestTrace: {
      requestTrace: () => {
        throw new Error('追加のTraceを依頼してはならない');
      },
    },
    assets:
      options.segmentation === false
        ? DEFAULT_EXTRACTION_ASSETS
        : { ...DEFAULT_EXTRACTION_ASSETS, segmentation: { ...SEGMENTATION, boundaries: options.boundaries ?? BOUNDARIES } },
    remember: noRemember,
  };
}

function okRow(rows: ReturnType<typeof computeBoxPlotExtraction>['rows'], layoutId: string): BoxPlotOkRow {
  const row = rows.find((candidate) => candidate.targetKey === `layout:${layoutId}`);
  assert.equal(row?.kind, 'ok');
  return row as BoxPlotOkRow;
}

test('箱の中央値とひげの上端は、文節ごとの統計の表の「文節ごとの1かな換算の移動距離」の中央値・90%点と一致する', () => {
  const members = [memberOf('qwerty'), memberOf('jis-kana')];
  const box = computeBoxPlotExtraction(members, []);
  const stats = computeBunsetsuStatsExtraction(members, []);
  for (const layoutId of ['qwerty', 'jis-kana']) {
    const row = okRow(box.rows, layoutId);
    const table = stats.rows.find((candidate) => candidate.targetKey === `layout:${layoutId}`);
    assert.equal(table?.kind, 'ok');
    if (table?.kind !== 'ok') continue;
    assert.equal(row.box.median, table.stats.segmentPerChar.median);
    assert.equal(row.box.upperWhisker, table.stats.segmentPerChar.p90);
    assert.equal(row.box.count, table.stats.segmentPerChar.count);
    assert.equal(row.box.count, BOUNDARIES.length + 1);
    // 並びは10%点 ≤ 25%点 ≤ 中央値 ≤ 75%点 ≤ 90%点
    const { lowerWhisker, lowerQuartile, median, upperQuartile, upperWhisker } = row.box;
    assert.ok(lowerWhisker <= lowerQuartile && lowerQuartile <= median && median <= upperQuartile && upperQuartile <= upperWhisker);
  }
});

test('10%点・25%点・75%点は、文節の値を小さい順に並べた補間しない順位の値になる', () => {
  // 文節ごとの1かな換算の移動距離を、区間の集計から直接求める
  const member = memberOf('qwerty');
  const total = member.trace.inputChars;
  const values: number[] = [];
  let start = 0;
  for (const end of [...BOUNDARIES, total]) {
    let distance = 0;
    for (const stroke of member.trace.strokes) if (stroke.kanaEnd >= start && stroke.kanaEnd < end) distance += stroke.distance;
    values.push(distance / (end - start));
    start = end;
  }
  const sorted = Float64Array.from(values).sort();
  const row = okRow(computeBoxPlotExtraction([member], []).rows, 'qwerty');
  // 区間の集計は累積和の差で求めるので、足し順の違いによる浮動小数点の誤差だけ許す
  const near = (actual: number, expected: number | undefined) => assert.ok(Math.abs(actual - expected!) < 1e-9, `${actual} と ${expected}`);
  near(row.box.lowerWhisker, quantileNearestRank(sorted, 0.1));
  near(row.box.lowerQuartile, quantileNearestRank(sorted, 0.25));
  near(row.box.upperQuartile, quantileNearestRank(sorted, 0.75));
});

test('追加のTraceを依頼せず、区切りの出どころと分割器を持つ', () => {
  const extracted = computeBoxPlotExtraction([memberOf('qwerty'), memberOf('jis-kana')], []);
  assert.deepEqual(extracted.source, { splitter: { name: 'テスト用', version: '1' }, origin: 'kana-only' });
  assert.equal(extracted.referenceTargetKey, 'layout:qwerty');
});

test('テキストと区切りが同じ配列は同じテキストとして扱い、テキストまたは区切りが違う配列は自分のテキストと区切りで求める', () => {
  const otherText = SAMPLE_TEXT_JA.replace(/\s/g, '').slice(10, 130);
  const members = [memberOf('qwerty'), memberOf('jis-kana'), memberOf('dvorak', { text: otherText }), memberOf('colemak', { boundaries: [5, 10, 20] })];
  const { rows } = computeBoxPlotExtraction(members, []);
  assert.equal(okRow(rows, 'qwerty').sameText, true);
  assert.equal(okRow(rows, 'jis-kana').sameText, true);
  assert.equal(okRow(rows, 'dvorak').sameText, false);
  assert.equal(okRow(rows, 'colemak').sameText, false);
  // 区切りの数が違う配列は、文節の数も違う
  assert.equal(okRow(rows, 'colemak').box.count, 4);
  const alone = computeBoxPlotExtraction([memberOf('dvorak', { text: otherText })], []);
  assert.deepEqual(okRow(rows, 'dvorak').box, okRow(alone.rows, 'dvorak').box);
});

test('区切りが渡されなかった対象は値を出さず、区切りが渡された最初の対象が基準になる', () => {
  const none = computeBoxPlotExtraction([memberOf('qwerty', { segmentation: false })], []);
  assert.equal(none.source, undefined);
  assert.equal(none.referenceTargetKey, undefined);
  assert.deepEqual(none.rows, [{ kind: 'no-segmentation', targetKey: 'layout:qwerty' }]);

  const mixed = computeBoxPlotExtraction([memberOf('qwerty', { segmentation: false }), memberOf('jis-kana')], []);
  assert.equal(mixed.rows[0]!.kind, 'no-segmentation');
  assert.equal(mixed.referenceTargetKey, 'layout:jis-kana');
  assert.equal(okRow(mixed.rows, 'jis-kana').sameText, true);
});

test('値が決まる文節が無い対象は値なしの行になり、解決できなかった対象は失敗の行として末尾に付く', () => {
  const failures: readonly AnalyzerSetMemberFailure[] = [
    { target: { kind: 'layout', layoutId: 'missing' }, kind: 'reference', message: '配列が見つかりません' },
  ];
  const extracted = computeBoxPlotExtraction([memberOf('qwerty'), memberOf('jis-kana', { text: '', boundaries: [] })], failures);
  assert.equal(extracted.rows[0]!.kind, 'ok');
  assert.equal(extracted.rows[1]!.kind, 'no-value');
  assert.deepEqual(extracted.rows[2], { kind: 'failed', targetKey: 'layout:missing', failureKind: 'reference', message: '配列が見つかりません' });
});

test('区切りを常に使うので、区切りが変わると抽出の鍵が変わる', () => {
  const key = boxPlotDefinition.assetsKeyOf;
  assert.ok(key !== undefined);
  const a = key({}, { ...DEFAULT_EXTRACTION_ASSETS, segmentation: SEGMENTATION });
  const b = key({}, { ...DEFAULT_EXTRACTION_ASSETS, segmentation: { ...SEGMENTATION, boundaries: [1, 2] } });
  assert.notDeepEqual(a, b);
});
