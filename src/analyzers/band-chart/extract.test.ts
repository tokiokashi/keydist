import assert from 'node:assert/strict';
import { test } from 'node:test';
import { noRemember, type AnalyzerSetMember, type AnalyzerSetMemberFailure } from '#analyzers/contract.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { LAYOUT_MISSING_REASON } from '#input/setup/index.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { bandShares, traceBandCounts, BAND_QUANTITY_IDS } from '#interpretation/band-quantities.ts';
import { generateTrace } from '#trace/generate.ts';
import { computeBandChartExtraction, type BandChartOkRow } from './extract.ts';

const geometry = buildGeometry('row-staggered');
// 改行は打てない文字になる
const TEXT = 'きょうは、いいてんきですね。\nあしたもはれるでしょう';

function memberOf(layoutId: string, text = TEXT): AnalyzerSetMember {
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
    remember: noRemember,
  };
}

test('行は、Traceから直接数えた選んだ量の値と一致し、割合の和は丸める前で1になる', () => {
  const members = [memberOf('jis-kana'), memberOf('qwerty')];
  const { rows } = computeBandChartExtraction(members, [], 'distance');
  assert.equal(rows.length, 2);
  for (const member of members) {
    const row = rows.find(
      (candidate) => candidate.targetKey === `layout:${member.target.kind === 'layout' ? member.target.layoutId : ''}`,
    ) as BandChartOkRow;
    assert.equal(row.kind, 'ok');
    const direct = traceBandCounts(member.trace);
    assert.deepEqual(row.counts, direct.byQuantity.distance.counts);
    assert.equal(row.total, direct.byQuantity.distance.total);
    assert.equal(row.skipped, direct.skipped);
    assert.ok(Math.abs(row.shares.reduce((sum, share) => sum + share, 0) - 1) < 1e-12);
  }
});

test('打てない文字を数えず、分母は打てた文字の数になる', () => {
  const member = memberOf('jis-kana');
  const row = computeBandChartExtraction([member], [], 'distance').rows[0] as BandChartOkRow;
  assert.ok(row.skipped >= 1);
  assert.equal(row.total, member.trace.inputChars - row.skipped);
  assert.equal(
    row.counts.reduce((sum, count) => sum + count, 0),
    row.total,
  );
});

test('打てた文字が0の対象は、割合を出さずに値なしの行になる', () => {
  const { rows } = computeBandChartExtraction([memberOf('jis-kana', '\n\n')], [], 'distance');
  assert.equal(rows[0]?.kind, 'no-value');
  if (rows[0]?.kind === 'no-value') assert.ok(rows[0].skipped >= 1);
});

test('選んだ量の区分で数え、行は選んだ量の値と分母を持つ', () => {
  const member = memberOf('jis-kana');
  const direct = traceBandCounts(member.trace);
  for (const quantity of BAND_QUANTITY_IDS) {
    const extracted = computeBandChartExtraction([member], [], quantity);
    assert.equal(extracted.quantity, quantity);
    const row = extracted.rows[0] as BandChartOkRow;
    assert.equal(row.kind, 'ok');
    assert.deepEqual(row.counts, direct.byQuantity[quantity].counts);
    assert.deepEqual(row.shares, bandShares(direct.byQuantity[quantity]));
    assert.equal(row.total, direct.byQuantity[quantity].total);
  }
});

test('打てた文字が0の対象は、どの量でも値なしの行になる', () => {
  for (const quantity of BAND_QUANTITY_IDS) {
    assert.equal(computeBandChartExtraction([memberOf('jis-kana', '\n\n')], [], quantity).rows[0]?.kind, 'no-value', quantity);
  }
});

test('解決に失敗した対象は、理由を持つ行になる', () => {
  const failures: readonly AnalyzerSetMemberFailure[] = [
    { target: { kind: 'setup', setupId: 'missing' }, kind: 'reference', message: LAYOUT_MISSING_REASON },
  ];
  const { rows } = computeBandChartExtraction([memberOf('qwerty')], failures, 'distance');
  const failed = rows.find((row) => row.kind === 'failed');
  assert.equal(failed?.kind === 'failed' && failed.message, LAYOUT_MISSING_REASON);
});

test('評価に渡したテキストが最初の対象と違う対象は、sameTextがfalseになり、値は自分のテキストで求める', () => {
  const other = 'あいうえおかきくけこ';
  const members = [memberOf('qwerty'), memberOf('qwerty', other)];
  const { rows, referenceTargetKey } = computeBandChartExtraction(
    [members[0]!, { ...members[1]!, target: { kind: 'layout', layoutId: 'dvorak' } }],
    [],
    'distance',
  );
  assert.equal(referenceTargetKey, 'layout:qwerty');
  const [first, second] = rows as BandChartOkRow[];
  assert.equal(first?.sameText, true);
  assert.equal(second?.sameText, false);
  assert.equal(second?.total, members[1]!.trace.inputChars - second!.skipped);
});
