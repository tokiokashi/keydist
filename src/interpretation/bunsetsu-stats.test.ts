import assert from 'node:assert/strict';
import test from 'node:test';
import { generateEngineTrace } from '#engine/pipeline.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import { SAMPLE_TEXT_JA_NEKO } from '#input/text/sample-ja-neko.ts';
import type { Trace } from '#trace/generate.ts';
import { analyzeBunsetsuText, buildBunsetsuTraceBasis, bunsetsuLayoutStats, skippedPositionsOf } from './bunsetsu-stats.ts';
import { boundaryInterior } from './boundary-context.ts';
import { segmentStats } from './segments.ts';
import { buildSpanIndex } from './span-metrics.ts';

/**
 * 手で数えられる小さいテキスト。文字の位置0〜10は `a b c d b c c a b c d`、
 * 文節は `ab | cd | bc | c | ab | cd`（区切りは2・4・6・7・9）。
 *
 * 打鍵の材料:
 * - 位置5と7は打鍵できなかった文字（どのステップも覆わない）。位置7は区切りの直後の1文字
 * - 位置9と10は1つのステップが覆い（距離20は終わりの位置10に帰属）、位置9は打鍵できた文字だがステップが帰属しない
 * - それ以外は位置 `i` で1つずつ、距離は `[1, 2, 3, 4, 5, –, 7, –, 9, ·, 20]`
 */
const CHARS = [...'abcdbccabcd'];
const BUNSETSU = [2, 4, 6, 7, 9];

function stroke(kanaStart: number, kanaEnd: number, distance: number): Trace['strokes'][number] {
  return { kanaStart, kanaEnd, distance, presses: [] } as unknown as Trace['strokes'][number];
}

const TRACE = {
  strokes: [stroke(0, 0, 1), stroke(1, 1, 2), stroke(2, 2, 3), stroke(3, 3, 4), stroke(4, 4, 5), stroke(6, 6, 7), stroke(8, 8, 9), stroke(9, 10, 20)],
  skipped: 2,
  inputChars: 11,
} as unknown as Trace;

test('テキストの表: 文節の数・境目の文字の割合・またぐbigramのうち文節の中にも出る並びの割合が、手で数えた値と一致する', () => {
  const { table } = analyzeBunsetsuText(CHARS, BUNSETSU);
  assert.equal(table.charCount, 11);
  assert.equal(table.segmentCount, 6);
  assert.equal(table.boundaryChars, 5);
  assert.equal(table.boundaryCharShare, 5 / 11);
  // またぐbigramはbc（位置2）・db（4）・cc（6）・ca（7）・bc（9）。bcだけが文節の中（位置5）にも出る
  assert.equal(table.crossCount, 5);
  assert.equal(table.crossAlsoInsideCount, 2);
  assert.equal(table.crossAlsoInsideShare, 0.4);
});

test('区切りが無いテキストと空のテキストでは、割合を出さない', () => {
  const none = analyzeBunsetsuText(CHARS, []).table;
  assert.equal(none.segmentCount, 1);
  assert.equal(none.boundaryCharShare, 0);
  assert.equal(none.crossAlsoInsideShare, undefined);
  const empty = analyzeBunsetsuText([], []).table;
  assert.equal(empty.segmentCount, 0);
  assert.equal(empty.boundaryCharShare, undefined);
});

test('どのステップにも覆われない文字が、打鍵できなかった文字になる', () => {
  assert.deepEqual([...skippedPositionsOf(TRACE)], [0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0]);
});

test('境目の文字・内側の文字・先頭の文字・打鍵できなかった文字の距離の和が全距離に一致し、境目の距離の割合はその比になる', () => {
  const structure = analyzeBunsetsuText(CHARS, BUNSETSU);
  const stats = bunsetsuLayoutStats(buildBunsetsuTraceBasis(TRACE), BUNSETSU, structure);
  assert.deepEqual(stats.distanceParts, { first: 1, boundary: 15, interior: 35, skipped: 0, total: 51 });
  const { first, boundary, interior, skipped, total } = stats.distanceParts;
  assert.equal(first + boundary + interior + skipped, total);
  assert.equal(stats.boundaryDistanceShare, 15 / 51);
  assert.equal(stats.skippedChars, 2);
  assert.equal(stats.skippedAfterBoundary, 1);
});

test('境目の文字と内側の文字の1文字あたりの距離と標準偏差は、打鍵できなかった文字を数えない', () => {
  const stats = bunsetsuLayoutStats(buildBunsetsuTraceBasis(TRACE), BUNSETSU, analyzeBunsetsuText(CHARS, BUNSETSU));
  // 境目の文字: 位置2・4・6・9（位置7は打鍵できなかった文字）。位置9は打鍵できた文字で距離0
  assert.equal(stats.boundary.chars, 4);
  assert.equal(stats.boundary.perChar, 15 / 4);
  assert.ok(Math.abs(stats.boundary.deviation! - Math.sqrt(26.75 / 4)) < 1e-12);
  // 内側の文字: 位置1・3・8・10（位置5は打鍵できなかった文字）
  assert.equal(stats.interior.chars, 4);
  assert.equal(stats.interior.perChar, 35 / 4);
  assert.ok(Math.abs(stats.interior.deviation! - Math.sqrt(194.75 / 4)) < 1e-12);
});

test('打鍵できなかった文字を分母に数えるboundaryInteriorとは、境目の文字の1文字あたりの距離が違う', () => {
  const stats = bunsetsuLayoutStats(buildBunsetsuTraceBasis(TRACE), BUNSETSU, analyzeBunsetsuText(CHARS, BUNSETSU));
  const counted = boundaryInterior(buildSpanIndex(TRACE), BUNSETSU);
  assert.equal(counted.boundaryDistance, stats.distanceParts.boundary);
  assert.equal(counted.boundaryPerChar, 15 / 5);
  assert.equal(stats.boundary.perChar, 15 / 4);
});

test('1文節の距離の標準偏差と90%点は、先頭の文字を含む文節の距離の和から求まる', () => {
  const stats = bunsetsuLayoutStats(buildBunsetsuTraceBasis(TRACE), BUNSETSU, analyzeBunsetsuText(CHARS, BUNSETSU));
  // 文節の距離: [3, 7, 5, 7, 9, 20]（和51、平均8.5）
  assert.equal(stats.segmentDistance.count, 6);
  assert.ok(Math.abs(stats.segmentDistance.deviation! - Math.sqrt(179.5 / 6)) < 1e-12);
  // 小さい順に [3, 5, 7, 7, 9, 20]。⌈0.9 × 6⌉ = 6番目
  assert.equal(stats.segmentDistance.p90, 20);
});

test('文節ごとの1文字あたりの距離の中央値と90%点が定義どおりで、Run Chartの区間の値と一致する', () => {
  const stats = bunsetsuLayoutStats(buildBunsetsuTraceBasis(TRACE), BUNSETSU, analyzeBunsetsuText(CHARS, BUNSETSU));
  // 文字数 [2, 2, 2, 1, 2, 2] で割った値: [1.5, 3.5, 2.5, 7, 4.5, 10]。小さい順の6個の中央値は中央2つの平均
  assert.equal(stats.segmentPerChar.count, 6);
  assert.equal(stats.segmentPerChar.median, (3.5 + 4.5) / 2);
  assert.equal(stats.segmentPerChar.p90, 10);
  const run = segmentStats(buildSpanIndex(TRACE), BUNSETSU).byMetric.perCharUnits;
  assert.equal(stats.segmentPerChar.median, run.median);
  assert.equal(stats.segmentPerChar.p90, run.p90);
  assert.equal(stats.segmentPerChar.count, run.count);
});

test('頻出の文節: 文字数1の文節を除き、回数の多い順（同じ回数は最初に出た順）に並び、セルは内側の文字の距離の和 / 文字数の和になる', () => {
  const structure = analyzeBunsetsuText(CHARS, BUNSETSU);
  // abは位置0と7、cdは位置2と9、bcは位置4。文節c（位置6）は文字数1なので除く
  assert.deepEqual(
    structure.segments.map(({ text, count }) => ({ text, count })),
    [
      { text: 'ab', count: 2 },
      { text: 'cd', count: 2 },
      { text: 'bc', count: 1 },
    ],
  );
  const stats = bunsetsuLayoutStats(buildBunsetsuTraceBasis(TRACE), BUNSETSU, structure);
  // abの内側の文字は位置1（距離2）と位置8（距離9）。cdは位置3（4）と位置10（20）。bcの内側の位置5は打鍵できなかった文字
  assert.deepEqual(stats.frequentSegmentCells, [(2 + 9) / 2, (4 + 20) / 2, undefined]);
});

test('頻出のまたぐbigram: セルはまたいだ出現と文節の中の出現のそれぞれの平均距離で、文節の中に出ない並びはundefinedになる', () => {
  const structure = analyzeBunsetsuText(CHARS, BUNSETSU);
  assert.deepEqual(
    structure.bigrams.map(({ pair, crossCount, insideCount }) => ({ pair, crossCount, insideCount })),
    [
      { pair: 'bc', crossCount: 2, insideCount: 1 },
      { pair: 'db', crossCount: 1, insideCount: 0 },
      { pair: 'cc', crossCount: 1, insideCount: 0 },
      { pair: 'ca', crossCount: 1, insideCount: 0 },
    ],
  );
  const stats = bunsetsuLayoutStats(buildBunsetsuTraceBasis(TRACE), BUNSETSU, structure);
  assert.deepEqual(stats.frequentBigramCells, [
    // bc: またいだ出現の2文字目は位置2（距離3）と位置9（距離0）。文節の中の出現の2文字目は位置5で、打鍵できなかった文字
    { cross: (3 + 0) / 2, inside: undefined },
    { cross: 5, inside: undefined },
    { cross: 7, inside: undefined },
    // ca: 2文字目の位置7は打鍵できなかった文字
    { cross: undefined, inside: undefined },
  ]);
});

test('2つの一覧は出現回数の順に並び、配列（Trace）の値で並び替わらない', () => {
  const structure = analyzeBunsetsuText(CHARS, BUNSETSU);
  const other = { ...TRACE, strokes: TRACE.strokes.map((item) => ({ ...item, distance: 1000 - item.distance })) } as Trace;
  // 一覧の行（並び）はテキストだけから決まるので、Traceを渡さずに求めた構造をそのまま使える
  const a = bunsetsuLayoutStats(buildBunsetsuTraceBasis(TRACE), BUNSETSU, structure);
  const b = bunsetsuLayoutStats(buildBunsetsuTraceBasis(other), BUNSETSU, structure);
  assert.equal(a.frequentSegmentCells.length, structure.segments.length);
  assert.equal(b.frequentBigramCells.length, structure.bigrams.length);
  for (const rows of [structure.segments.map((row) => row.count), structure.bigrams.map((row) => row.crossCount)]) {
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1]! >= rows[i]!);
  }
});

test('上位の一覧は20行までで、同じ回数は最初に出た順に並ぶ', () => {
  // 60種の文字を並べ、文字数2の文節を30個作る。どの文節も1回なので、最初に出た順の先頭20個になる
  const chars = Array.from({ length: 60 }, (_, index) => String.fromCodePoint(0x3042 + index));
  const bunsetsu = Array.from({ length: 29 }, (_, index) => (index + 1) * 2);
  const structure = analyzeBunsetsuText(chars, bunsetsu);
  assert.equal(structure.segments.length, 20);
  assert.equal(structure.bigrams.length, 20);
  assert.equal(structure.segments[0]!.text, chars.slice(0, 2).join(''));
  assert.equal(structure.segments[1]!.text, chars.slice(2, 4).join(''));
});

// ---------------------------------------------------------------------------
// 打鍵できなかった文字の位置が、Traceの数と一致するか（アプリと同じ経路で作ったTrace）
// ---------------------------------------------------------------------------

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

function traceFor(layoutId: string, text: string): Trace | undefined {
  const result = resolveEngineInput({
    target: { kind: 'layout', layoutId },
    setups: new Map(),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text,
    language: 'ja',
  });
  return result.ok ? generateEngineTrace(result.input).trace : undefined;
}

/** 改行・漢字・記号・英字・配列に無いかなを含む、既定の日本語サンプル以外の1本。 */
const MIXED_TEXT = 'いろは、にほへと。\nちりぬるを（わかよ）たれそ\n\nABC 123つねならむ漢字ゔぁ〜\n';

test('打鍵できなかった文字の位置の数が、組み込みの全配列でTraceのskippedと一致する（既定の日本語サンプルと、改行などを含む1本）', () => {
  let resolved = 0;
  let withSkipped = 0;
  for (const layoutId of LAYOUT_BY_ID.keys()) {
    for (const text of [SAMPLE_TEXT_JA_NEKO, MIXED_TEXT]) {
      const trace = traceFor(layoutId, text);
      if (trace === undefined) continue;
      resolved++;
      const skipped = skippedPositionsOf(trace);
      const count = skipped.reduce((sum, value) => sum + value, 0);
      assert.equal(count, trace.skipped, `${layoutId}: 位置から数えた打鍵できなかった文字${count}が、Traceの${trace.skipped}と違う`);
      assert.equal(skipped.length, trace.inputChars);
      if (trace.skipped > 0) withSkipped++;
    }
  }
  assert.ok(resolved >= 30, `解決できた組が少ない: ${resolved}`);
  assert.ok(withSkipped > 0, '打鍵できなかった文字が出る組が無く、検査になっていない');
});

test('打鍵できなかった文字には距離が帰属しない', () => {
  for (const layoutId of ['qwerty', 'jis-kana']) {
    const trace = traceFor(layoutId, MIXED_TEXT)!;
    const basis = buildBunsetsuTraceBasis(trace);
    for (let position = 0; position < trace.inputChars; position++) {
      if (basis.skipped[position] === 1) assert.equal(basis.index.distanceAt[position], 0, `${layoutId}: 位置${position}`);
    }
  }
});
