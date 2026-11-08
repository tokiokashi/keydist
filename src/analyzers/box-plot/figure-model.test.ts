import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BoxPlotExtracted, BoxPlotOkRow, BoxPlotRow } from './extract.ts';
import {
  COMPUTING_MESSAGE,
  NO_SEGMENTATION_MESSAGE,
  NO_VALUE_MESSAGE,
  boxAxis,
  boxGeometry,
  boxOwnRange,
  MIN_COLUMN_WIDTH,
  boxPlotLayout,
  boxPlotModel,
  type BoxRowContext,
} from './figure-model.ts';

function okRow(targetKey: string, median: number, options: Partial<BoxPlotOkRow> = {}): BoxPlotOkRow {
  return {
    kind: 'ok',
    targetKey,
    box: {
      count: 10,
      lowerWhisker: median * 0.5,
      lowerQuartile: median * 0.75,
      median,
      upperQuartile: median * 1.25,
      upperWhisker: median * 1.5,
    },
    sameText: true,
    ...options,
  };
}

function extractedOf(rows: readonly BoxPlotRow[], referenceTargetKey: string | undefined = 'a'): BoxPlotExtracted {
  return { source: { splitter: { name: 'テスト用', version: '1' }, origin: 'kana-only' }, referenceTargetKey, rows };
}

const CONTEXT: ReadonlyMap<string, BoxRowContext> = new Map(
  ['a', 'b', 'c', 'd'].map((key) => [key, { targetKey: key, label: key.toUpperCase(), fullName: `配列${key}` }] as const),
);

test('列は対象の順に並び、抽出の行の並びや値の大きさに依らない', () => {
  const extracted = extractedOf([okRow('c', 1), okRow('a', 3), okRow('b', 2)]);
  assert.deepEqual(
    boxPlotModel(extracted, ['b', 'c', 'a'], CONTEXT).rows.map((row) => row.targetKey),
    ['b', 'c', 'a'],
  );
  assert.deepEqual(
    boxPlotModel(extracted, ['a', 'b', 'c'], CONTEXT).rows.map((row) => row.label),
    ['A', 'B', 'C'],
  );
});

test('値を出せない行は箱を描く行から外し、理由を対象の順に添える', () => {
  const extracted = extractedOf([
    okRow('a', 1),
    { kind: 'no-value', targetKey: 'b' },
    { kind: 'no-segmentation', targetKey: 'c' },
    { kind: 'failed', targetKey: 'd', failureKind: 'reference', message: '配列が見つかりません' },
  ]);
  const model = boxPlotModel(extracted, ['d', 'c', 'b', 'a', 'x'], CONTEXT);
  assert.deepEqual(
    model.rows.map((row) => row.targetKey),
    ['a'],
  );
  assert.deepEqual(
    model.excluded.map(({ targetKey, status, message }) => ({ targetKey, status, message })),
    [
      { targetKey: 'd', status: 'failed', message: '配列が見つかりません' },
      { targetKey: 'c', status: 'no-segmentation', message: NO_SEGMENTATION_MESSAGE },
      { targetKey: 'b', status: 'no-value', message: NO_VALUE_MESSAGE },
      // 抽出にまだ無い対象は、値の欠落を偽らず計算中と出す
      { targetKey: 'x', status: 'computing', message: COMPUTING_MESSAGE },
    ],
  );
});

test('文節の数は、全配列が基準と同じテキストと区切りなら1つ、違う配列があれば配列ごとに出す', () => {
  const same = boxPlotModel(extractedOf([okRow('a', 1), okRow('b', 2)]), ['a', 'b'], CONTEXT);
  assert.deepEqual(same.segmentCounts, { kind: 'shared', count: 10 });
  assert.deepEqual(same.differentText, []);

  const different = boxPlotModel(
    extractedOf([okRow('a', 1), okRow('b', 2, { sameText: false, box: { ...okRow('b', 2).box, count: 12 } })]),
    ['a', 'b'],
    CONTEXT,
  );
  assert.deepEqual(
    different.differentText.map((row) => row.label),
    ['B'],
  );
  assert.equal(different.reference?.label, 'A');
  assert.deepEqual(
    different.segmentCounts && different.segmentCounts.kind === 'per-row'
      ? different.segmentCounts.entries.map(({ label, count }) => ({ label, count }))
      : undefined,
    [
      { label: 'A', count: 10 },
      { label: 'B', count: 12 },
    ],
  );
  assert.equal(boxPlotModel(extractedOf([]), ['a'], CONTEXT).segmentCounts, undefined);
});

test('目盛りは0から始まり、上端は最大の値を含む最小の目盛りの値になる', () => {
  const axis = boxAxis(1.37);
  assert.equal(axis.ticks[0]!.value, 0);
  assert.ok(axis.max >= 1.37 && axis.max < 1.37 * 2);
  assert.equal(axis.ticks.at(-1)!.value, axis.max);
  // ちょうど目盛りの値なら、その値が右端
  assert.equal(boxAxis(2).max, 2);
  // 値が無い・全部0でも、幅のある目盛りになる
  assert.equal(boxAxis(0).ticks[0]!.value, 0);
  assert.ok(boxAxis(0).max > 0);
});

test('このペインの範囲は0からひげの上端の最大までで、箱を描く行が無ければ報告しない', () => {
  const model = boxPlotModel(extractedOf([okRow('a', 1), okRow('b', 2)]), ['a', 'b'], CONTEXT);
  assert.deepEqual(boxOwnRange(model.rows), { min: 0, max: 3 });
  assert.equal(boxOwnRange([]), undefined);
});

test('共通の目盛りを渡すと、同じ値が全ペインで同じ位置に来る', () => {
  const box = okRow('a', 1).box;
  const narrow = boxAxis(boxOwnRange(boxPlotModel(extractedOf([okRow('a', 1)]), ['a'], CONTEXT).rows)!.max);
  const shared = boxAxis(3);
  const layout = boxPlotLayout(600, 1, 100);
  const own = boxGeometry(box, narrow.max, layout.frame.y0, layout.frame.y1);
  const aligned = boxGeometry(box, shared.max, layout.frame.y0, layout.frame.y1);
  // 縦軸は上が大きいので、最大が大きい共通の目盛りでは、同じ値が下に来る（縦位置が大きい）
  assert.ok(aligned.upperWhisker > own.upperWhisker);
  assert.equal(boxGeometry({ ...box, upperWhisker: shared.max }, shared.max, layout.frame.y0, layout.frame.y1).upperWhisker, layout.frame.y0);
});

test('箱の位置は、10%点・25%点・中央値・75%点・90%点の順に下から上へ並び、0が枠の下端、軸の上端の値が枠の上端に来る', () => {
  const layout = boxPlotLayout(600, 2, 100);
  const geometry = boxGeometry(
    { count: 5, lowerWhisker: 0, lowerQuartile: 0.5, median: 1, upperQuartile: 1.5, upperWhisker: 2 },
    2,
    layout.frame.y0,
    layout.frame.y1,
  );
  assert.equal(geometry.lowerWhisker, layout.frame.y1);
  assert.equal(geometry.upperWhisker, layout.frame.y0);
  assert.equal(geometry.median, (layout.frame.y0 + layout.frame.y1) / 2);
  assert.ok(geometry.lowerQuartile > geometry.median && geometry.median > geometry.upperQuartile);
});

test('列は幅の下限を割らず、隣と重ならずに左から並び、列が多ければ図は領域より広くなる', () => {
  const few = boxPlotLayout(600, 3, 100);
  assert.equal(few.plotWidth, few.columnWidth * 3);
  const many = boxPlotLayout(300, 43, 100);
  assert.ok(many.columnWidth >= MIN_COLUMN_WIDTH);
  assert.ok(many.plotWidth > 300);
  many.columns.forEach((column, index) => {
    if (index > 0) assert.equal(column.left, many.columns[index - 1]!.right);
  });
});
