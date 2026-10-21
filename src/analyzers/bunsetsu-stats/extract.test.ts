import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_EXTRACTION_ASSETS, noRemember, type AnalyzerSetMember, type AnalyzerSetMemberFailure } from '#analyzers/contract.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { SAMPLE_TEXT_JA } from '#input/text/sample-ja.ts';
import { analyzeBunsetsuText, buildBunsetsuTraceBasis, bunsetsuLayoutStats } from '#interpretation/bunsetsu-stats.ts';
import { generateTrace } from '#trace/generate.ts';
import { bunsetsuStatsDefinition, computeBunsetsuStatsExtraction, type BunsetsuStatsOkRow } from './extract.ts';

const geometry = buildGeometry('row-staggered');
// 改行を1つ含める。打鍵できなかった文字（改行）が区切りの直後になる区切りを作る
const TEXT = `${SAMPLE_TEXT_JA.replace(/\s/g, '').slice(0, 60)}\n${SAMPLE_TEXT_JA.replace(/\s/g, '').slice(60, 120)}`;
const BOUNDARIES = [4, 9, 15, 22, 30, 41, 60, 61, 70, 85, 99];
const ASSETS = {
  ...DEFAULT_EXTRACTION_ASSETS,
  segmentation: { boundaries: BOUNDARIES, origin: 'kana-only', splitter: { name: 'テスト用', version: '1' } },
} as const;

function memberOf(
  layoutId: string,
  options: { text?: string; segmentation?: boolean; remember?: AnalyzerSetMember['remember'] } = {},
): AnalyzerSetMember {
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
    assets: options.segmentation === false ? DEFAULT_EXTRACTION_ASSETS : ASSETS,
    remember: options.remember ?? noRemember,
  };
}

function rowsOf(extracted: ReturnType<typeof computeBunsetsuStatsExtraction>) {
  return { segments: extracted.text!.frequentSegments, bigrams: extracted.text!.frequentBigrams };
}

function okRow(rows: ReturnType<typeof computeBunsetsuStatsExtraction>['rows'], layoutId: string): BunsetsuStatsOkRow {
  const row = rows.find((candidate) => candidate.targetKey === `layout:${layoutId}`) ?? rows.find((candidate) => candidate.targetKey.includes(layoutId));
  assert.equal(row?.kind, 'ok');
  return row as BunsetsuStatsOkRow;
}

test('配列ごとの行は、直接求めた値と一致し、追加のTraceを依頼しない', () => {
  const members = [memberOf('qwerty'), memberOf('jis-kana')];
  const extracted = computeBunsetsuStatsExtraction(members, []);
  assert.equal(extracted.rows.length, 2);
  const structure = analyzeBunsetsuText([...TEXT], BOUNDARIES);
  for (const member of members) {
    const layoutId = member.target.kind === 'layout' ? member.target.layoutId : '';
    const { frequentSegmentCells, frequentBigramCells, ...stats } = bunsetsuLayoutStats(buildBunsetsuTraceBasis(member.trace), BOUNDARIES, structure);
    const row = okRow(extracted.rows, layoutId);
    assert.equal(row.sameText, true);
    assert.deepEqual(row.stats, stats);
    assert.deepEqual(row.frequentSegmentCells, frequentSegmentCells);
    assert.deepEqual(row.frequentBigramCells, frequentBigramCells);
    assert.equal(row.frequentSegmentCells.length, extracted.text!.frequentSegments.length);
    assert.equal(row.frequentBigramCells.length, extracted.text!.frequentBigrams.length);
  }
});

test('テキストの表と一覧の行は、配列によらず1つで、区切りの出どころと分割器を持つ', () => {
  const extracted = computeBunsetsuStatsExtraction([memberOf('qwerty'), memberOf('jis-kana')], []);
  const text = extracted.text!;
  assert.deepEqual(text.source, { splitter: { name: 'テスト用', version: '1' }, origin: 'kana-only' });
  assert.equal(text.table.segmentCount, BOUNDARIES.length + 1);
  assert.equal(text.table.boundaryChars, BOUNDARIES.length);
  assert.equal(text.referenceTargetKey, okRow(extracted.rows, 'qwerty').targetKey);
});

test('改行が区切りの直後になる区切りは、打鍵できなかった文字として数えられ、境目の文字の統計から除かれる', () => {
  const extracted = computeBunsetsuStatsExtraction([memberOf('qwerty'), memberOf('jis-kana')], []);
  for (const layoutId of ['qwerty', 'jis-kana']) {
    const row = okRow(extracted.rows, layoutId);
    // 位置60が改行で、区切り60の直後の1文字になる
    assert.ok(row.stats.skippedAfterBoundary >= 1, layoutId);
    assert.equal(row.stats.boundary.chars, BOUNDARIES.length - row.stats.skippedAfterBoundary, layoutId);
    const parts = row.stats.distanceParts;
    assert.ok(Math.abs(parts.first + parts.boundary + parts.interior + parts.skipped - parts.total) < 1e-9, layoutId);
  }
});

test('区切りが渡されなかった対象は値を出さず、渡された対象だけが表の基準になる', () => {
  const none = computeBunsetsuStatsExtraction([memberOf('qwerty', { segmentation: false })], []);
  assert.equal(none.text, undefined);
  assert.deepEqual(none.rows, [{ kind: 'no-segmentation', targetKey: none.rows[0]!.targetKey }]);
  const mixed = computeBunsetsuStatsExtraction([memberOf('qwerty', { segmentation: false }), memberOf('jis-kana')], []);
  assert.equal(mixed.rows[0]!.kind, 'no-segmentation');
  assert.equal(mixed.rows[1]!.kind, 'ok');
  assert.equal(mixed.text!.referenceTargetKey, mixed.rows[1]!.targetKey);
});

test('評価に渡したテキストが基準と違う対象は、一覧の行を基準のテキストから決め、セルは自分のテキストで求める', () => {
  // 位置20の文字だけを別の文字に替える（区切りの位置は変わらない）
  const chars = [...TEXT];
  chars[20] = chars[20] === 'ん' ? 'あ' : 'ん';
  const changed = chars.join('');
  const extracted = computeBunsetsuStatsExtraction([memberOf('qwerty'), memberOf('jis-kana', { text: changed })], []);
  assert.equal(okRow(extracted.rows, 'qwerty').sameText, true);
  const other = okRow(extracted.rows, 'jis-kana');
  assert.equal(other.sameText, false);
  // 一覧の行は基準（先頭の対象）のテキストのもので、セルの数は行の数と一致する
  assert.equal(other.frequentSegmentCells.length, extracted.text!.frequentSegments.length);
  assert.equal(other.frequentBigramCells.length, extracted.text!.frequentBigrams.length);
  const trace = generateTrace(changed, LAYOUT_BY_ID.get('jis-kana')!, geometry, { windowSize: 3, sfbHomeCost: true });
  const own = bunsetsuLayoutStats(buildBunsetsuTraceBasis(trace), BOUNDARIES, analyzeBunsetsuText(chars, BOUNDARIES), rowsOf(extracted));
  assert.deepEqual(other.frequentSegmentCells, own.frequentSegmentCells);
  assert.deepEqual(other.frequentBigramCells, own.frequentBigramCells);
  assert.equal(other.stats.distanceParts.total, own.distanceParts.total);
});

test('行の文字列が自分のテキストに無い対象は、そのセルが値なしになる', () => {
  const extracted = computeBunsetsuStatsExtraction([memberOf('qwerty')], []);
  const other = memberOf('qwerty', { text: 'ぬぬぬぬぬぬぬぬぬぬ' });
  const structure = analyzeBunsetsuText([...'ぬぬぬぬぬぬぬぬぬぬ'], [3, 6]);
  const stats = bunsetsuLayoutStats(buildBunsetsuTraceBasis(other.trace), [3, 6], structure, rowsOf(extracted));
  assert.ok(extracted.text!.frequentSegments.length > 0);
  assert.ok(stats.frequentSegmentCells.every((cell) => cell === undefined));
  assert.ok(stats.frequentBigramCells.every((cell) => cell.cross === undefined && cell.inside === undefined));
});

test('解決に失敗した対象は、失敗の行として残る', () => {
  const failure: AnalyzerSetMemberFailure = { target: { kind: 'layout', layoutId: 'missing' }, kind: 'reference', message: '配列が見つかりません' };
  const extracted = computeBunsetsuStatsExtraction([memberOf('qwerty')], [failure]);
  assert.deepEqual(extracted.rows[1], {
    kind: 'failed',
    targetKey: extracted.rows[1]!.targetKey,
    failureKind: 'reference',
    message: '配列が見つかりません',
  });
});

test('Traceだけで決まる索引は、メンバーに覚えさせて使い回す', () => {
  const stored = new Map<string, unknown>();
  let computed = 0;
  const remember: AnalyzerSetMember['remember'] = (key, compute) => {
    if (!stored.has(key)) {
      computed++;
      stored.set(key, compute());
    }
    return stored.get(key) as never;
  };
  const member = memberOf('qwerty', { remember });
  const first = computeBunsetsuStatsExtraction([member], []);
  const second = computeBunsetsuStatsExtraction([member], []);
  assert.equal(computed, 1);
  assert.deepEqual(first, second);
});

test('抽出のキーに、区切りと分割器が入る', () => {
  const key = bunsetsuStatsDefinition.assetsKeyOf(bunsetsuStatsDefinition.defaultOptions, ASSETS);
  assert.deepEqual(key, ASSETS.segmentation);
  const other = { ...ASSETS, segmentation: { ...ASSETS.segmentation, boundaries: [5, 9] } };
  assert.notDeepEqual(key, bunsetsuStatsDefinition.assetsKeyOf(bunsetsuStatsDefinition.defaultOptions, other));
  assert.equal(bunsetsuStatsDefinition.assetsKeyOf(bunsetsuStatsDefinition.defaultOptions, DEFAULT_EXTRACTION_ASSETS), null);
});
