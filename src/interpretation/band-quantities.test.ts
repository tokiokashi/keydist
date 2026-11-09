import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import type { Finger } from '#input/shapes/geometry.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import {
  BAND_COUNT_OF,
  BAND_QUANTITY_IDS,
  actionBandOf,
  bandShares,
  countBandQuantities,
  distanceBandOf,
  handBandOf,
  pressesBandOf,
  rowBandOf,
  strokeGroups,
  traceBandCounts,
  type CountedPress,
  type CountedStroke,
} from './band-quantities.ts';
import { buildSpanIndex } from './span-metrics.ts';

const geometry = buildGeometry('row-staggered');

function traceOf(layoutId: string, text: string) {
  return generateTrace(text, LAYOUT_BY_ID.get(layoutId)!, geometry, DEFAULT_TRACE_POLICY);
}

function press(finger: Finger, distance: number, rows: readonly number[] = [2]): CountedPress {
  return { finger, distance, keys: rows.map((row) => ({ row })) };
}

function stroke(kanaStart: number, kanaEnd: number, ...presses: CountedPress[]): CountedStroke {
  return { kanaStart, kanaEnd, presses };
}

test('境目ちょうどの距離は上の区分に入る', () => {
  assert.deepEqual([0, 0.49, 0.5, 1.49, 1.5, 2.49, 2.5, 7].map(distanceBandOf), [0, 0, 1, 1, 2, 2, 3, 3]);
});

test('打ち方・押下数・手の区分が定義どおりに分かれる', () => {
  assert.deepEqual(
    [
      [1, 1],
      [1, 2],
      [1, 3],
      [2, 2],
      [2, 4],
      [3, 3],
      [5, 5],
    ].map(([steps, presses]) => actionBandOf(steps!, presses!)),
    [0, 1, 1, 2, 2, 3, 3],
  );
  assert.deepEqual([1, 2, 3, 4].map(pressesBandOf), [0, 1, 2, 2]);
  assert.deepEqual(
    [
      [true, false, false],
      [false, true, false],
      [true, true, false],
      [true, true, true],
    ].map(([left, right, simultaneous]) => handBandOf(left!, right!, simultaneous!)),
    [0, 3, 1, 2],
  );
});

test('手の区分は、左右の押下がどのステップも片手だけなら両手順次、1つのステップに両手があれば両手同時、片手だけならその手になる', () => {
  // ローマ字入力で手を替えるまとまり: しゃ = s(左) y(右) a(左)
  const sya = traceBandCounts(traceOf('qwerty', 'しゃ')).byQuantity.hand;
  assert.deepEqual(sya.counts, [0, 2, 0, 0]);
  // 同じ手のまとまり: きょ = k y o（右手）
  assert.deepEqual(traceBandCounts(traceOf('qwerty', 'きょ')).byQuantity.hand.counts, [0, 0, 0, 2]);
  // 親指と反対の手の指を同時に押すまとまり
  const together = countBandQuantities([stroke(0, 0, press('LT', 0, [0]), press('RI', 1, [1]))], 1, []).byQuantity.hand;
  assert.deepEqual(together.counts, [0, 0, 1, 0]);
  // 同じ手の前置シフト（2つのステップとも左手）
  const prefixShift = countBandQuantities([stroke(0, 0, press('LP', 0, [2])), stroke(0, 0, press('LI', 1, [1]))], 1, []).byQuantity.hand;
  assert.deepEqual(prefixShift.counts, [1, 0, 0, 0]);
  // 両手のステップが別々に並び、同時のステップが無ければ両手順次
  const sequential = countBandQuantities([stroke(0, 0, press('LP', 0, [2])), stroke(0, 0, press('RI', 1, [1]))], 1, []).byQuantity.hand;
  assert.deepEqual(sequential.counts, [0, 1, 0, 0]);
});

test('段は親指が押したキーを親指に、それ以外をキーの段に分け、4段より外の段は端の段に寄せる', () => {
  assert.deepEqual(
    [
      rowBandOf('LP', { row: 0 }),
      rowBandOf('RI', { row: 1 }),
      rowBandOf('LM', { row: 2 }),
      rowBandOf('RM', { row: 3 }),
      rowBandOf('LT', { row: 2 }),
      rowBandOf('RT', { row: 3 }),
      rowBandOf('RP', { row: 7 }),
      rowBandOf('LP', { row: -1 }),
    ],
    [0, 1, 2, 3, 4, 4, 3, 0],
  );
});

test('範囲が重なるステップは前のまとまりに入れ、重ならないステップから新しいまとまりを始める', () => {
  const groups = strokeGroups(
    [
      stroke(0, 0, press('LI', 1)),
      stroke(1, 2, press('LI', 1)),
      stroke(2, 2, press('RI', 1)),
      stroke(3, 3, press('RI', 1)),
      stroke(3, 4, press('RI', 1)),
    ],
    5,
  );
  assert.deepEqual(
    groups.map(({ start, end, from, to }) => [start, end, from, to]),
    [
      [0, 0, 0, 1],
      [1, 2, 1, 3],
      [3, 4, 3, 5],
    ],
  );
});

test('ローマ字入力の拗音は2かなと3つのステップが1つのまとまりになる', () => {
  const trace = traceOf('qwerty', 'きょ');
  assert.equal(trace.strokes.length, 3);
  const groups = strokeGroups(trace.strokes, trace.inputChars);
  assert.deepEqual(
    groups.map(({ start, end, from, to }) => [start, end, from, to]),
    [[0, 1, 0, 3]],
  );
  // 2かなが同じ区分に入り、打ち方は3アクション以上、押下数は3キー
  const counts = traceBandCounts(trace).byQuantity;
  assert.deepEqual(counts.action.counts, [0, 0, 0, 2]);
  assert.deepEqual(counts.presses.counts, [0, 0, 2]);
  assert.equal(counts.distance.total, 2);
  assert.equal(counts.distance.counts.filter((count) => count > 0).length, 1);
});

test('コンボで2かなを1アクションで打つ時は、2かなと1つのステップが1つのまとまりになる', () => {
  const trace = traceOf('kawasemi-plus', 'あい');
  assert.equal(trace.strokes.length, 1);
  assert.equal(trace.strokes[0]!.kanaEnd - trace.strokes[0]!.kanaStart, 1);
  const groups = strokeGroups(trace.strokes, trace.inputChars);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]!.end - groups[0]!.start, 1);
  const counts = traceBandCounts(trace).byQuantity;
  // 1ステップで2キー以上を同時に押す
  assert.equal(counts.action.counts[1], 2);
  assert.equal(counts.presses.counts[0], 0);
});

test('移動距離は打鍵のまとまりの移動距離の和を覆うかなの数で割った値で区分に入り、境目ちょうどは上の区分に入る', () => {
  // 2かなを覆うまとまりの距離の和が1.0なら、1かな換算は0.5で境目ちょうど
  const exact = countBandQuantities([stroke(0, 1, press('LI', 0.5), press('RI', 0.5))], 2, []).byQuantity.distance;
  assert.deepEqual(exact.counts, [0, 2, 0, 0]);
  // 3かなを覆うまとまりは、3かな全部が同じ区分に入る（最後のかなだけに距離を置かない）
  const long = countBandQuantities([stroke(0, 2, press('LI', 2.9))], 3, []).byQuantity.distance;
  assert.deepEqual(long.counts, [0, 3, 0, 0]);
  const just = countBandQuantities([stroke(0, 1, press('LI', 3))], 2, []).byQuantity.distance;
  assert.deepEqual(just.counts, [0, 0, 2, 0]);
});

test('かな1つずつを打つ配列では、移動距離の区分がkanaEndの文字に帰属した距離で数えた値と一致する', () => {
  const text = 'こんにちは、せかい。きょうはいいてんきですね。あしたもはれるでしょう';
  for (const layoutId of ['jis-kana', 'nicola', 'asuka', 'gekkou']) {
    const trace = traceOf(layoutId, text);
    const skipped = new Set(trace.skippedPositions);
    const distanceAt = buildSpanIndex(trace).distanceAt;
    const old = [0, 0, 0, 0];
    for (let position = 0; position < distanceAt.length; position++) if (!skipped.has(position)) old[distanceBandOf(distanceAt[position]!)]!++;
    assert.deepEqual(traceBandCounts(trace).byQuantity.distance.counts, old, layoutId);
  }
});

test('段と指ごとの押下は、1本の指で2つのキーを押す押下をキーの数で数える', () => {
  const counted = countBandQuantities([stroke(0, 0, press('RI', 0, [1, 2]), press('LM', 0, [3]))], 1, []).byQuantity;
  assert.deepEqual(counted.row.counts, [0, 1, 1, 1, 0]);
  assert.equal(counted.row.total, 3);
  assert.equal(counted.fingerPresses.counts[6], 2); // 右人差し指
  assert.equal(counted.fingerPresses.counts[2], 1); // 左中指
  assert.equal(counted.presses.counts[2], 1); // 3キー以上
});

test('確定の打鍵も、範囲の重なりで同じまとまりに入れ、打ち方・押下数・手・段・指で数える', () => {
  // 確定の打鍵（左親指）と、同じ範囲を打つ入力のステップ（右人差し指）
  const strokes = [stroke(0, 0, press('LT', 0, [0])), stroke(0, 0, press('RI', 1, [1]))];
  const counted = countBandQuantities(strokes, 1, []).byQuantity;
  assert.deepEqual(counted.action.counts, [0, 0, 1, 0]);
  assert.deepEqual(counted.presses.counts, [0, 1, 0]);
  assert.deepEqual(counted.hand.counts, [0, 1, 0, 0]);
  assert.deepEqual(counted.row.counts, [0, 1, 0, 0, 1]);
  assert.equal(counted.fingerPresses.counts[4], 1); // 左親指
});

test('打てない文字を含む打鍵のまとまりは、かなもステップも数えず、分母が0になれば割合は決まらない', () => {
  // 位置1を打てない。位置0〜1を覆うまとまりは全部数えない
  const strokes = [stroke(0, 1, press('LI', 1), press('RI', 1)), stroke(2, 2, press('LM', 1))];
  const counted = countBandQuantities(strokes, 3, [1]);
  assert.equal(counted.skipped, 1);
  assert.equal(counted.byQuantity.distance.total, 1);
  assert.equal(counted.byQuantity.row.total, 1);
  assert.equal(counted.byQuantity.fingerDistance.total, 1);
  const none = countBandQuantities([stroke(0, 0, press('LI', 1))], 1, [0]);
  for (const id of BAND_QUANTITY_IDS) {
    assert.equal(none.byQuantity[id].total, 0, id);
    assert.equal(bandShares(none.byQuantity[id]), undefined, id);
  }
});

test('範囲外と重複した打てない文字の位置は、数に入れない', () => {
  const counted = countBandQuantities([stroke(0, 0, press('LI', 1)), stroke(1, 1, press('LI', 1))], 2, [1, 1, 9, -1]);
  assert.equal(counted.skipped, 1);
});

test('区分ごとの割合の和は、どの量でも丸める前で1になる', () => {
  const text = 'きょうは、いいてんきですね。あしたもはれるでしょう';
  for (const layoutId of ['qwerty', 'jis-kana', 'nicola', 'kawasemi-plus', 'tk-onchoku']) {
    const counted = traceBandCounts(traceOf(layoutId, text));
    for (const id of BAND_QUANTITY_IDS) {
      const quantity = counted.byQuantity[id];
      assert.equal(quantity.counts.length, BAND_COUNT_OF[id], `${layoutId} ${id}`);
      const shares = bandShares(quantity)!;
      assert.ok(Math.abs(shares.reduce((sum, share) => sum + share, 0) - 1) < 1e-12, `${layoutId} ${id}`);
    }
  }
});
