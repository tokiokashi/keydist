import assert from 'node:assert/strict';
import { test } from 'node:test';
import { noRemember, type AnalyzerSetMember, type AnalyzerSetMemberFailure } from '#analyzers/contract.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { LAYOUT_MISSING_REASON } from '#input/setup/index.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { distanceBandCounts } from '#interpretation/distance-bands.ts';
import { buildSpanIndex } from '#interpretation/span-metrics.ts';
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

test('行は、distanceAtを直接数えた値と一致し、割合の和は丸める前で1になる', () => {
  const members = [memberOf('jis-kana'), memberOf('qwerty')];
  const { rows } = computeBandChartExtraction(members, []);
  assert.equal(rows.length, 2);
  for (const member of members) {
    const row = rows.find(
      (candidate) => candidate.targetKey === `layout:${member.target.kind === 'layout' ? member.target.layoutId : ''}`,
    ) as BandChartOkRow;
    assert.equal(row.kind, 'ok');
    const direct = distanceBandCounts(buildSpanIndex(member.trace).distanceAt, member.trace.skippedPositions);
    assert.deepEqual(row.counts, direct.counts);
    assert.equal(row.typed, direct.typed);
    assert.equal(row.skipped, direct.skipped);
    assert.ok(Math.abs(row.shares.reduce((sum, share) => sum + share, 0) - 1) < 1e-12);
  }
});

test('打てない文字を数えず、分母は打てた文字の数になる', () => {
  const member = memberOf('jis-kana');
  const row = computeBandChartExtraction([member], []).rows[0] as BandChartOkRow;
  assert.ok(row.skipped >= 1);
  assert.equal(row.typed, member.trace.inputChars - row.skipped);
  assert.equal(
    row.counts.reduce((sum, count) => sum + count, 0),
    row.typed,
  );
});

test('打てた文字が0の対象は、割合を出さずに値なしの行になる', () => {
  const { rows } = computeBandChartExtraction([memberOf('jis-kana', '\n\n')], []);
  assert.equal(rows[0]?.kind, 'no-value');
  if (rows[0]?.kind === 'no-value') assert.ok(rows[0].skipped >= 1);
});

test('解決に失敗した対象は、理由を持つ行になる', () => {
  const failures: readonly AnalyzerSetMemberFailure[] = [
    { target: { kind: 'setup', setupId: 'missing' }, kind: 'reference', message: LAYOUT_MISSING_REASON },
  ];
  const { rows } = computeBandChartExtraction([memberOf('qwerty')], failures);
  const failed = rows.find((row) => row.kind === 'failed');
  assert.equal(failed?.kind === 'failed' && failed.message, LAYOUT_MISSING_REASON);
});

test('評価に渡したテキストが最初の対象と違う対象は、sameTextがfalseになり、値は自分のテキストで求める', () => {
  const other = 'あいうえおかきくけこ';
  const members = [memberOf('qwerty'), memberOf('qwerty', other)];
  const { rows, referenceTargetKey } = computeBandChartExtraction([members[0]!, { ...members[1]!, target: { kind: 'layout', layoutId: 'dvorak' } }], []);
  assert.equal(referenceTargetKey, 'layout:qwerty');
  const [first, second] = rows as BandChartOkRow[];
  assert.equal(first?.sameText, true);
  assert.equal(second?.sameText, false);
  assert.equal(second?.typed, members[1]!.trace.inputChars - second!.skipped);
});
