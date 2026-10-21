import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sortOrderByColumn } from '#ui/primitives/column-sort.ts';
import { BUNSETSU_STATS_COLUMN_FULL_NAME, BUNSETSU_STATS_COLUMN_IDS, bunsetsuStatsColumnValue, type BunsetsuStatsColumnId } from './columns.ts';
import type { BunsetsuStatsOkRow } from './extract.ts';

function summary(perChar: number | undefined) {
  return { chars: 1, perChar, deviation: perChar };
}

function row(targetKey: string, share: number | undefined, skipped: number): BunsetsuStatsOkRow {
  return {
    kind: 'ok',
    targetKey,
    sameText: true,
    stats: {
      skippedChars: skipped,
      skippedAfterBoundary: 0,
      distanceParts: { first: 0, boundary: 0, interior: 0, skipped: 0, total: 0 },
      boundaryDistanceShare: share,
      boundary: summary(share),
      interior: summary(share),
      segmentDistance: { count: 1, deviation: share, p90: share },
      segmentPerChar: { count: 1, median: share, p90: share },
    },
    frequentSegmentCells: [],
    frequentBigramCells: [],
  };
}

const ORDER = ['a', 'b', 'c', 'd'];
const ROWS = new Map([
  ['a', row('a', 0.5, 2)],
  ['b', row('b', 0.2, 2)],
  ['c', row('c', undefined, 0)],
  ['d', row('d', 0.9, 1)],
]);

function sorted(column: BunsetsuStatsColumnId, direction: 'asc' | 'desc' | null): readonly string[] {
  return sortOrderByColumn<BunsetsuStatsColumnId>(
    ORDER,
    (targetKey, id) => bunsetsuStatsColumnValue(ROWS.get(targetKey)!, id),
    direction === null ? null : { column, direction },
  );
}

test('並べ替えなしは対象の順のまま、昇順と降順は列の値の順になる', () => {
  assert.deepEqual(sorted('boundaryShare', null), ORDER);
  assert.deepEqual(sorted('boundaryShare', 'asc'), ['b', 'a', 'd', 'c']);
  assert.deepEqual(sorted('boundaryShare', 'desc'), ['d', 'a', 'b', 'c']);
});

test('値が無い行は向きによらず末尾に対象の順で置き、同じ値の行は対象の順を保つ', () => {
  assert.deepEqual(sorted('skipped', 'asc'), ['c', 'd', 'a', 'b']);
  assert.deepEqual(sorted('skipped', 'desc'), ['a', 'b', 'd', 'c']);
  for (const direction of ['asc', 'desc'] as const) {
    assert.equal(sorted('segmentP90', direction).at(-1), 'c');
  }
});

test('全ての列に値の読み出しと、重ならない正式な名前がある。名前はⓘの説明の項目と同じ並びで対応する', () => {
  const names = new Set<string>();
  for (const column of BUNSETSU_STATS_COLUMN_IDS) {
    assert.equal(typeof bunsetsuStatsColumnValue(ROWS.get('a')!, column), 'number', column);
    names.add(BUNSETSU_STATS_COLUMN_FULL_NAME[column]);
  }
  assert.equal(names.size, BUNSETSU_STATS_COLUMN_IDS.length);
  // 並びの対応を、名前の一部で確かめる（項目の並びが入れ替わったら落ちる）
  const expected: Readonly<Record<BunsetsuStatsColumnId, RegExp>> = {
    skipped: /^打てない文字の数$/,
    skippedAfterBoundary: /^打てない文字のうち/,
    boundaryShare: /距離の割合$/,
    boundaryPerChar: /^文節頭.*1文字あたり/,
    boundaryDeviation: /^文節頭.*標準偏差/,
    interiorPerChar: /^文節中.*1文字あたり/,
    interiorDeviation: /^文節中.*標準偏差/,
    segmentDeviation: /^1文節.*標準偏差/,
    segmentP90: /^1文節.*90%点/,
    segmentPerCharMedian: /^文節ごと.*中央値/,
    segmentPerCharP90: /^文節ごと.*90%点/,
  };
  for (const column of BUNSETSU_STATS_COLUMN_IDS) {
    assert.match(BUNSETSU_STATS_COLUMN_FULL_NAME[column], expected[column], column);
  }
});
