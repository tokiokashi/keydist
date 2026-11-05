import assert from 'node:assert/strict';
import test from 'node:test';
import { createEngineCache } from '#engine/cache.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import type { Setup } from '#input/setup/index.ts';
import { SAMPLE_TEXTS } from '#input/text/samples.ts';
import { COMPARISON_COLUMN_IDS, type ComparisonColumnId } from '../comparison-column-text.ts';
import { computeComparisonRowValues, type ComparisonRowValues } from '../comparison-column-values.ts';
import { computeTraceScalars, movedPressMetrics, rightLeftPerPressRatio } from '#interpretation/metrics.ts';
import { ALL_FINGERS, PHYSICAL_SHAPES, type Finger, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Trace } from '#trace/generate.ts';
import { convertToReading, type NotationExcess, type ReadingToken } from '#input/text/reading.ts';
import { SCATTER_PRESET_AXES, scatterAxisProblem, scatterContour } from './axes.ts';

/**
 * 等位線の値が、`Metrics`と`analyzeHandRhythm`の値（比較表の列）と一致することを、組み込みの全配列で検査する。
 * 条件: 日本語のサンプルテキスト（かな配列と英字の配列の両方で計算できる）、物理配列は配列の既定（JIS配列を求める配列はJIS）、
 * 指の割り当てと窓幅は既定（`EMPTY_SETTINGS_OVERRIDES`）。
 */

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

const TEXT = SAMPLE_TEXTS.ja.modern!;

function rowOf(
  layoutId: string,
  text: string,
  notationExcess?: NotationExcess,
): { readonly row: ComparisonRowValues; readonly inputChars: number; readonly trace: Trace } {
  const shapeId = LAYOUT_BY_ID.get(layoutId)?.requiresJisShape === true ? 'jis-row-staggered' : 'row-staggered';
  const setup: Setup = { id: 'setup-a', number: 1, layoutId, shapeId };
  const resolution = resolveEngineInput({
    target: { kind: 'setup', setupId: setup.id },
    setups: new Map([[setup.id, setup]]),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text,
    language: 'ja',
    notationExcess,
  });
  assert.ok(resolution.ok, layoutId);
  if (!resolution.ok) throw new Error('unreachable');
  const cache = createEngineCache();
  const { trace } = cache.getTrace(resolution.input);
  return { row: computeComparisonRowValues(cache.getInterpretation(resolution.input).metrics, trace), inputChars: trace.inputChars, trace };
}

/** 恒等式に出る列。この列どうしの全ての組を、等位線の値と突き合わせる。 */
const IDENTITY_COLUMNS: readonly ComparisonColumnId[] = [
  'actions',
  'perCharSteps',
  'meanPerStroke',
  'totalUnits',
  'perCharUnits',
  'perActionPresses',
  'perCharPresses',
  'perPressUnits',
  'sameFingerRate',
  'sameFinger',
  'handSwitches',
  'handContinuations',
  'sameHandContinuationRate',
  'rightHandPressShare',
  'rightHandDistanceShare',
  'rightLeftPerPressRatio',
  'movedPressShare',
  'perMovedPressUnits',
  'textCharsPerAction',
  'actionsPerUnit',
  'textCharsPerUnit',
  'unitsPerTextChar',
];

function relativeError(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-12);
}

const ALL_ROWS = [...LAYOUT_BY_ID.keys()].map((layoutId) => ({ layoutId, ...rowOf(layoutId, TEXT) }));

/**
 * 漢字を読みに直したテキスト。読みの字数と表記の字数が違うので、文字数 `W` が入力かな数 `C` と違う。
 * 辞書は使わず、語と読みを手で与える。
 */
const KANJI_SOURCE = '今日は晴れです。私は日本語の文章を打ちます。今日は京都へ行きます。';
const KANJI_WORDS: ReadonlyArray<readonly [string, string | null]> = [
  ['今日', 'キョウ'],
  ['は', null],
  ['晴れ', 'ハレ'],
  ['です', null],
  ['。', null],
  ['私', 'ワタシ'],
  ['は', null],
  ['日本語', 'ニホンゴ'],
  ['の', null],
  ['文章', 'ブンショウ'],
  ['を', null],
  ['打ち', 'ウチ'],
  ['ます', null],
  ['。', null],
  ['今日', 'キョウ'],
  ['は', null],
  ['京都', 'キョウト'],
  ['へ', null],
  ['行き', 'イキ'],
  ['ます', null],
  ['。', null],
];

function kanjiTokens(): ReadingToken[] {
  const encoder = new TextEncoder();
  let byteStart = 0;
  return KANJI_WORDS.map(([surface, reading]) => {
    const byteEnd = byteStart + encoder.encode(surface).length;
    const token = { surface, byteStart, byteEnd, reading, isUnknown: false };
    byteStart = byteEnd;
    return token;
  });
}

const KANJI_CONVERSION = convertToReading(KANJI_SOURCE, kanjiTokens());
const KANJI_ROWS = [...LAYOUT_BY_ID.keys()].map((layoutId) => ({
  layoutId,
  ...rowOf(layoutId, KANJI_CONVERSION.text, KANJI_CONVERSION.notationExcess),
}));

test('組み込みの全配列: 用意する8つの組み合わせの等位線の値が、比較表の列の値と相対誤差1e-9以内で一致し、線が点を通る（漢字を読みに直したテキストを含む）', () => {
  const expectedColumn = {
    distance: 'perCharUnits',
    press: 'perCharPresses',
    perPress: 'perCharUnits',
    sameFinger: 'sameFinger',
    hand: 'sameHandContinuationRate',
    handShare: 'rightLeftPerPressRatio',
    movedPress: 'perPressUnits',
    charsPerAction: 'textCharsPerUnit',
  } as const;
  assert.ok(ALL_ROWS.length >= 30, `配列の数 ${ALL_ROWS.length}`);
  for (const [preset, axes] of Object.entries(SCATTER_PRESET_AXES) as Array<
    [keyof typeof SCATTER_PRESET_AXES, (typeof SCATTER_PRESET_AXES)[keyof typeof SCATTER_PRESET_AXES]]
  >) {
    for (const { layoutId, row, inputChars } of [...ALL_ROWS, ...KANJI_ROWS]) {
      const contour = scatterContour(axes.x, axes.y, inputChars, 'ja');
      assert.ok(contour, `${preset} ${layoutId}`);
      assert.equal(contour.column, expectedColumn[preset]);
      // 1文字あたりの動作数を軸に取る2つの組み合わせは、軸の積が1文字あたりの量になる（distanceは横軸、pressは縦軸）
      if (preset === 'distance') assert.equal(axes.x, 'perCharSteps');
      if (preset === 'press') assert.equal(axes.y, 'perCharSteps');
      if (preset === 'perPress') assert.deepEqual(axes, { x: 'perCharPresses', y: 'perPressUnits' });
      if (preset === 'handShare') assert.deepEqual(axes, { x: 'rightHandPressShare', y: 'rightHandDistanceShare' });
      if (preset === 'movedPress') assert.deepEqual(axes, { x: 'movedPressShare', y: 'perMovedPressUnits' });
      if (preset === 'charsPerAction') assert.deepEqual(axes, { x: 'textCharsPerAction', y: 'actionsPerUnit' });
      const value = contour.valueAt(row[axes.x], row[axes.y]);
      assert.ok(value !== undefined, `${preset} ${layoutId} ${row[axes.x]} ${row[axes.y]}`);
      assert.ok(relativeError(value, row[contour.column]) <= 1e-9, `${preset} ${layoutId}: ${value} と ${row[contour.column]}`);
      // 点の読み取りに出す値も同じ
      assert.equal(contour.readoutAt(row[axes.x], row[axes.y], row[contour.column]), value);
      // 点の値の線の高さを横軸の値から求め直すと、点の縦軸の値に戻る
      const through = contour.yAt(value, row[axes.x]);
      assert.ok(through !== undefined && relativeError(through, row[axes.y]) <= 1e-9, `${preset} ${layoutId}: ${through} と ${row[axes.y]}`);
    }
  }
});

test('組み込みの全配列: 押下/動作 × 動作数/文字 が 押下/文字 と相対誤差1e-9以内で一致し、押下/動作は押下数 / 動作数', () => {
  for (const { layoutId, row } of ALL_ROWS) {
    assert.ok(relativeError(row.perActionPresses * row.perCharSteps, row.perCharPresses) <= 1e-9, `${layoutId}`);
    assert.ok(row.perActionPresses >= 1, `${layoutId}: 1動作は少なくとも1キーを押す`);
  }
  // 動作が0件なら0
  assert.equal(computeTraceScalars({ strokes: [], inputChars: 0, skipped: 0 } as unknown as Trace).perActionPresses, 0);
});

test('組み込みの全配列: (押下数/文字)×(u/押下)=u/文字と(押下数/動作)×(u/押下)=u/打鍵が相対誤差1e-9以内で成り立ち、u/押下は距離÷押下キー数', () => {
  for (const { layoutId, row } of ALL_ROWS) {
    assert.ok(relativeError(row.perCharPresses * row.perPressUnits, row.perCharUnits) <= 1e-9, `${layoutId} u/文字`);
    assert.ok(relativeError(row.perActionPresses * row.perPressUnits, row.meanPerStroke) <= 1e-9, `${layoutId} u/打鍵`);
    assert.ok(row.perPressUnits > 0, `${layoutId}`);
  }
  // 分母は押下キー数で、距離が0の押下（ホームキー・親指キー）も入る
  for (const { layoutId, row, inputChars } of ALL_ROWS) {
    assert.ok(relativeError(row.perPressUnits, row.totalUnits / (row.perCharPresses * inputChars)) <= 1e-9, `${layoutId} 距離 / 押下キー数`);
  }
  // 押下キー数が0なら0
  assert.equal(computeTraceScalars({ strokes: [], inputChars: 0, skipped: 0 } as unknown as Trace).perPressUnits, 0);
});

test('組み込みの全配列: 動いた押下の割合と動いた押下1回あたりの距離が、Traceの押下ごとの移動距離から数え直した値と一致し、積がu/押下になる', () => {
  let someMoved = false;
  for (const { layoutId, row, trace } of ALL_ROWS) {
    let distance = 0;
    let pressKeys = 0;
    let movedKeys = 0;
    for (const stroke of trace.strokes) {
      for (const press of stroke.presses) {
        distance += press.distance;
        pressKeys += press.keys.length;
        if (press.distance > 0) movedKeys += press.keys.length;
      }
    }
    assert.ok(movedKeys > 0 && movedKeys <= pressKeys, layoutId);
    someMoved = someMoved || movedKeys < pressKeys;
    assert.ok(relativeError(row.movedPressShare, (movedKeys / pressKeys) * 100) <= 1e-9, `${layoutId} 割合`);
    assert.ok(relativeError(row.perMovedPressUnits, distance / movedKeys) <= 1e-9, `${layoutId} 距離`);
    assert.ok(relativeError((row.movedPressShare / 100) * row.perMovedPressUnits, row.perPressUnits) <= 1e-9, `${layoutId} u/押下`);
  }
  // 距離が0の押下がある配列では割合が100%を下回る（検査が自明に通らない）
  assert.ok(someMoved);
});

test('動いた押下の割合と距離: 押下が無ければ0、動いた押下が無ければ距離は0、2キーの同時押しは2と数える', () => {
  const press = (distance: number, keyCount: number) => ({ distance, keys: Array.from({ length: keyCount }, (_, i) => `k${i}`) });
  const traceOf = (...presses: Array<ReturnType<typeof press>>) =>
    ({
      strokes: presses.map((p) => ({ distance: p.distance, presses: [{ ...p, finger: 'LI', sfb: false }] })),
      inputChars: 1,
      skipped: 0,
    }) as unknown as Trace;
  const movedOf = movedPressMetrics;
  const empty = movedOf(traceOf());
  assert.equal(empty.movedPressShare, 0);
  assert.equal(empty.perMovedPressUnits, 0);
  // 距離0の押下だけ: 押下はあるが動いた押下は無い
  const still = movedOf(traceOf(press(0, 1), press(0, 2)));
  assert.equal(still.movedPressShare, 0);
  assert.equal(still.perMovedPressUnits, 0);
  // 1キーで距離0、1キーで距離3、2キー同時押しで距離6: 押下キー数4、動いた押下キー数3
  const mixed = movedOf(traceOf(press(0, 1), press(3, 1), press(6, 2)));
  assert.equal(mixed.movedPressShare, 75);
  assert.equal(mixed.perMovedPressUnits, 3);
});

function byFinger(values: Partial<Record<Finger, number>>): Record<Finger, number> {
  return Object.fromEntries(ALL_FINGERS.map((finger) => [finger, values[finger] ?? 0])) as Record<Finger, number>;
}

test('組み込みの全配列: 右手u/押下比は、右手距離率・右手押下率から求めた比と相対誤差1e-9以内で一致する', () => {
  for (const { layoutId, row } of ALL_ROWS) {
    const p = row.rightHandPressShare;
    const d = row.rightHandDistanceShare;
    assert.ok(Number.isFinite(row.rightLeftPerPressRatio), layoutId);
    const fromShares = d / (100 - d) / (p / (100 - p));
    assert.ok(relativeError(row.rightLeftPerPressRatio, fromShares) <= 1e-9, `${layoutId}: ${row.rightLeftPerPressRatio} と ${fromShares}`);
  }
});

test('右手u/押下比: 片手の押下が0か左手の距離が0なら値を持たず、右手の距離だけが0なら0', () => {
  // 右手は距離2u・押下4、左手は距離1u・押下1（親指を含む）
  assert.equal(rightLeftPerPressRatio(byFinger({ RI: 1.5, RT: 0.5, LI: 1 }), byFinger({ RI: 3, RT: 1, LT: 1 })), 0.5);
  // 右手の押下が0
  assert.equal(rightLeftPerPressRatio(byFinger({ LI: 1 }), byFinger({ LI: 2 })), null);
  // 左手の押下が0
  assert.equal(rightLeftPerPressRatio(byFinger({ RI: 1 }), byFinger({ RI: 2 })), null);
  // 両手の押下があり、左手の距離が0
  assert.equal(rightLeftPerPressRatio(byFinger({ RI: 1 }), byFinger({ RI: 2, LI: 2 })), null);
  // 両手の距離が0（右手の割合は慣例で0%）
  assert.equal(rightLeftPerPressRatio(byFinger({}), byFinger({ RI: 2, LI: 2 })), null);
  // 右手の距離だけが0
  assert.equal(rightLeftPerPressRatio(byFinger({ LI: 3 }), byFinger({ RI: 2, LI: 2 })), 0);
});

test('組み込みの全配列: 恒等式の列どうしの全ての組で、等位線の値が比較表の列の値と一致し、線が点を通る', () => {
  let drawn = 0;
  for (const x of IDENTITY_COLUMNS) {
    for (const y of IDENTITY_COLUMNS) {
      for (const { layoutId, row, inputChars } of [...ALL_ROWS, ...KANJI_ROWS]) {
        const contour = scatterContour(x, y, inputChars, 'ja');
        if (contour === undefined) continue;
        drawn += 1;
        const value = contour.valueAt(row[x], row[y]);
        if (value === undefined) continue;
        assert.ok(relativeError(value, row[contour.column]) <= 1e-9, `${x} × ${y} ${layoutId}: ${value} と ${row[contour.column]}`);
        // 点を通る線の高さを、点の値から逆に求めると、点の縦軸の値に戻る
        const through = contour.yAt(value, row[x]);
        if (through !== undefined)
          assert.ok(relativeError(through, row[y]) <= 1e-9 || Math.abs(through - row[y]) <= 1e-9, `${x} × ${y} ${layoutId}: ${through} と ${row[y]}`);
      }
    }
  }
  assert.ok(drawn > 0);
});

test('自由に選ぶ: 等位線を引く組と、その量（総数と1文字あたりの選び方を含む）', () => {
  const column = (x: ComparisonColumnId, y: ComparisonColumnId) => scatterContour(x, y, 100, 'ja')?.column;
  // 距離 = 動作数 × u/打鍵
  assert.equal(column('actions', 'meanPerStroke'), 'totalUnits');
  assert.equal(column('meanPerStroke', 'actions'), 'totalUnits');
  assert.equal(column('totalUnits', 'meanPerStroke'), 'actions');
  assert.equal(column('perCharUnits', 'meanPerStroke'), 'perCharSteps');
  assert.equal(column('perCharSteps', 'meanPerStroke'), 'perCharUnits');
  assert.equal(column('actions', 'totalUnits'), 'meanPerStroke');
  assert.equal(column('perCharSteps', 'perCharUnits'), 'meanPerStroke');
  // 総数と1文字あたりが混ざった軸でも、残る量は決まる
  assert.equal(column('actions', 'perCharUnits'), 'meanPerStroke');
  assert.equal(column('perCharSteps', 'totalUnits'), 'meanPerStroke');
  // 押下 = 動作数 × 押下/動作。押下は1文字あたりの列だけが比較表にある
  assert.equal(column('perCharSteps', 'perActionPresses'), 'perCharPresses');
  assert.equal(column('perActionPresses', 'perCharSteps'), 'perCharPresses');
  assert.equal(column('perCharSteps', 'perCharPresses'), 'perActionPresses');
  assert.equal(column('actions', 'perCharPresses'), 'perActionPresses');
  assert.equal(column('perActionPresses', 'perCharPresses'), 'perCharSteps');
  assert.equal(column('perCharPresses', 'perActionPresses'), 'perCharSteps');
  // 残りの量の押下の総数が比較表に無い組には引かない
  assert.equal(column('actions', 'perActionPresses'), undefined);
  assert.equal(column('perActionPresses', 'actions'), undefined);
  // 距離 = 押下数 × u/押下。押下は1文字あたりの列だけが比較表にある
  assert.equal(column('perCharPresses', 'perPressUnits'), 'perCharUnits');
  assert.equal(column('perPressUnits', 'perCharPresses'), 'perCharUnits');
  assert.equal(column('perCharPresses', 'perCharUnits'), 'perPressUnits');
  assert.equal(column('perPressUnits', 'perCharUnits'), 'perCharPresses');
  assert.equal(column('perCharUnits', 'perCharPresses'), 'perPressUnits');
  assert.equal(column('perCharUnits', 'perPressUnits'), 'perCharPresses');
  assert.equal(column('totalUnits', 'perCharPresses'), 'perPressUnits');
  assert.equal(column('perCharPresses', 'totalUnits'), 'perPressUnits');
  assert.equal(column('totalUnits', 'perPressUnits'), undefined);
  assert.equal(column('perPressUnits', 'totalUnits'), undefined);
  // u/打鍵 = 押下数/動作 × u/押下
  assert.equal(column('perActionPresses', 'perPressUnits'), 'meanPerStroke');
  assert.equal(column('perActionPresses', 'meanPerStroke'), 'perPressUnits');
  assert.equal(column('perPressUnits', 'meanPerStroke'), 'perActionPresses');
  assert.equal(column('meanPerStroke', 'perPressUnits'), 'perActionPresses');
  assert.equal(column('perPressUnits', 'perActionPresses'), 'meanPerStroke');
  assert.equal(column('meanPerStroke', 'perActionPresses'), 'perPressUnits');
  // 右手u/押下比 =（右手距離率 ÷（100 − 右手距離率））÷（右手押下率 ÷（100 − 右手押下率））。3つとも比率で、順は問わない
  assert.equal(column('rightHandPressShare', 'rightHandDistanceShare'), 'rightLeftPerPressRatio');
  assert.equal(column('rightHandDistanceShare', 'rightHandPressShare'), 'rightLeftPerPressRatio');
  assert.equal(column('rightHandPressShare', 'rightLeftPerPressRatio'), 'rightHandDistanceShare');
  assert.equal(column('rightLeftPerPressRatio', 'rightHandPressShare'), 'rightHandDistanceShare');
  assert.equal(column('rightHandDistanceShare', 'rightLeftPerPressRatio'), 'rightHandPressShare');
  assert.equal(column('rightLeftPerPressRatio', 'rightHandDistanceShare'), 'rightHandPressShare');
  assert.equal(column('rightLeftPerPressRatio', 'perPressUnits'), undefined);
  // u/押下 = 動いた押下率 ÷ 100 × u/動いた押下。順は問わない
  assert.equal(column('movedPressShare', 'perMovedPressUnits'), 'perPressUnits');
  assert.equal(column('perMovedPressUnits', 'movedPressShare'), 'perPressUnits');
  assert.equal(column('movedPressShare', 'perPressUnits'), 'perMovedPressUnits');
  assert.equal(column('perPressUnits', 'movedPressShare'), 'perMovedPressUnits');
  assert.equal(column('perMovedPressUnits', 'perPressUnits'), 'movedPressShare');
  assert.equal(column('perPressUnits', 'perMovedPressUnits'), 'movedPressShare');
  // 距離 = 動いた押下キー数 × u/動いた押下。動いた押下キー数の総数は比較表に列が無いので、線を引かない
  assert.equal(column('totalUnits', 'perMovedPressUnits'), undefined);
  assert.equal(column('perMovedPressUnits', 'totalUnits'), undefined);
  assert.equal(column('perCharUnits', 'perMovedPressUnits'), undefined);
  assert.equal(column('perMovedPressUnits', 'perCharUnits'), undefined);
  // 文字/u = 文字/アクション × アクション/u。順は問わない
  assert.equal(column('textCharsPerAction', 'actionsPerUnit'), 'textCharsPerUnit');
  assert.equal(column('actionsPerUnit', 'textCharsPerAction'), 'textCharsPerUnit');
  assert.equal(column('textCharsPerAction', 'textCharsPerUnit'), 'actionsPerUnit');
  assert.equal(column('textCharsPerUnit', 'textCharsPerAction'), 'actionsPerUnit');
  assert.equal(column('actionsPerUnit', 'textCharsPerUnit'), 'textCharsPerAction');
  assert.equal(column('textCharsPerUnit', 'actionsPerUnit'), 'textCharsPerAction');
  // u/アクション = 文字/アクション × u/文字。順は問わない
  assert.equal(column('textCharsPerAction', 'unitsPerTextChar'), 'meanPerStroke');
  assert.equal(column('unitsPerTextChar', 'textCharsPerAction'), 'meanPerStroke');
  assert.equal(column('textCharsPerAction', 'meanPerStroke'), 'unitsPerTextChar');
  assert.equal(column('meanPerStroke', 'textCharsPerAction'), 'unitsPerTextChar');
  assert.equal(column('unitsPerTextChar', 'meanPerStroke'), 'textCharsPerAction');
  assert.equal(column('meanPerStroke', 'unitsPerTextChar'), 'textCharsPerAction');
  // 4つの列の間のほかの組には、線を引かない
  assert.equal(column('actionsPerUnit', 'unitsPerTextChar'), undefined);
  assert.equal(column('unitsPerTextChar', 'actionsPerUnit'), undefined);
  assert.equal(column('textCharsPerUnit', 'meanPerStroke'), undefined);
  assert.equal(column('textCharsPerAction', 'perCharUnits'), undefined);
  // 同指 = 動作数 × 同指率 / 100
  assert.equal(column('actions', 'sameFingerRate'), 'sameFinger');
  assert.equal(column('sameFinger', 'sameFingerRate'), 'actions');
  assert.equal(column('actions', 'sameFinger'), 'sameFingerRate');
  assert.equal(column('perCharSteps', 'sameFinger'), 'sameFingerRate');
  // 残りの量が比較表の列に無い（同指を入力文字数で割った量）組には引かない
  assert.equal(column('perCharSteps', 'sameFingerRate'), undefined);
  // 同じ手の続きの割合
  assert.equal(column('handSwitches', 'handContinuations'), 'sameHandContinuationRate');
  assert.equal(column('handSwitches', 'sameHandContinuationRate'), 'handContinuations');
  assert.equal(column('handContinuations', 'sameHandContinuationRate'), 'handSwitches');
  // 恒等式の2つの量に当たらない組には引かない
  assert.equal(column('meanPerStroke', 'sameFingerRate'), undefined);
  assert.equal(column('actions', 'handSwitches'), undefined);
  assert.equal(column('singleTapRate', 'perCharPresses'), undefined);
});

/** 同じテキストなら積または比が全配列で一定になる2列の組（順は問わない）。 */
const PROPORTIONAL_PAIRS: ReadonlyArray<readonly [ComparisonColumnId, ComparisonColumnId]> = [
  ['actions', 'perCharSteps'],
  ['totalUnits', 'perCharUnits'],
  ['meanPerStroke', 'actionsPerUnit'],
  ['textCharsPerUnit', 'unitsPerTextChar'],
  ['textCharsPerAction', 'perCharSteps'],
  ['textCharsPerUnit', 'perCharUnits'],
  ['unitsPerTextChar', 'perCharUnits'],
  ['actions', 'textCharsPerAction'],
  ['totalUnits', 'unitsPerTextChar'],
  ['totalUnits', 'textCharsPerUnit'],
];

test('自由に選ぶ: 選べない組は、同じ列と、積または比が一定になる2列', () => {
  assert.equal(scatterAxisProblem('actions', 'actions'), 'same');
  for (const [a, b] of PROPORTIONAL_PAIRS) {
    assert.equal(scatterAxisProblem(a, b), 'proportional', `${a} ${b}`);
    assert.equal(scatterAxisProblem(b, a), 'proportional', `${b} ${a}`);
    // 選べない組には等位線も引かない
    assert.equal(scatterContour(a, b, 100, 'ja'), undefined, `${a} ${b}`);
  }
  assert.equal(scatterAxisProblem('actions', 'perCharUnits'), undefined);
  assert.equal(scatterAxisProblem('actions', 'meanPerStroke'), undefined);
  assert.equal(scatterContour('totalUnits', 'totalUnits', 100, 'ja'), undefined);
  // 他の列は、同じ列でなければ選べる
  const proportional = new Set(PROPORTIONAL_PAIRS.flatMap(([a, b]) => [`${a}:${b}`, `${b}:${a}`]));
  for (const x of COMPARISON_COLUMN_IDS) {
    for (const y of COMPARISON_COLUMN_IDS) {
      if (x === y) continue;
      assert.equal(scatterAxisProblem(x, y), proportional.has(`${x}:${y}`) ? 'proportional' : undefined, `${x} ${y}`);
    }
  }
});

test('組み込みの全配列: 選べない組の2列は、積または比が全配列で一定になる（漢字を読みに直したテキストを含む）', () => {
  for (const rows of [ALL_ROWS, KANJI_ROWS]) {
    for (const [a, b] of PROPORTIONAL_PAIRS) {
      const products = rows.map(({ row }) => row[a] * row[b]);
      const ratios = rows.map(({ row }) => row[a] / row[b]);
      const constant = (values: readonly number[]) => values.every((value) => relativeError(value, values[0]!) <= 1e-9);
      assert.ok(constant(products) || constant(ratios), `${a} ${b}`);
    }
  }
});

test('文字数W: 漢字を読みに直したテキストでは入力かな数Cから読みと表記の字数の差を引いた数になり、漢字を含まないテキストではCと同じ', () => {
  const reading = [...KANJI_CONVERSION.text].length;
  assert.equal(reading, [...'きょうははれです。わたしはにほんごのぶんしょうをうちます。きょうはきょうとへいきます。'].length);
  const sourceLength = [...KANJI_SOURCE].length;
  assert.equal(KANJI_CONVERSION.notationExcess.defaultSymbols, sourceLength - reading);
  assert.equal(KANJI_CONVERSION.notationExcess.allSymbols, sourceLength - reading);
  assert.ok(sourceLength < reading);
  for (const { layoutId, row, inputChars } of KANJI_ROWS) {
    assert.equal(inputChars, reading, layoutId);
    // 表記の字数で数えた字の数: 読みに直さなかった字は1字を1と数え、元の文の字数に戻る
    assert.ok(relativeError(row.textCharsPerAction * row.actions, sourceLength) <= 1e-9, `${layoutId} W`);
    assert.ok(relativeError(row.unitsPerTextChar * sourceLength, row.totalUnits) <= 1e-9, `${layoutId} D/W`);
  }
  // 漢字を含まないテキストでは文字数と入力かな数が同じ
  for (const { layoutId, row, inputChars } of ALL_ROWS) {
    assert.ok(relativeError(row.textCharsPerAction * row.actions, inputChars) <= 1e-9, `${layoutId} W=C`);
    assert.ok(relativeError(row.unitsPerTextChar, row.perCharUnits) <= 1e-9, `${layoutId} u/文字=u/かな`);
  }
});

test('組み込みの全配列: コスパ×アクション/uが文字/uと、コスパ×u/文字がu/アクションと、アクション/u×u/アクションが1と一致する（W≠Cのテキストを含む）', () => {
  let someDifferent = false;
  for (const { layoutId, row } of [...ALL_ROWS, ...KANJI_ROWS]) {
    if (!(row.actions > 0 && row.totalUnits > 0)) continue;
    assert.ok(relativeError(row.textCharsPerAction * row.actionsPerUnit, row.textCharsPerUnit) <= 1e-9, `${layoutId} 文字/u`);
    assert.ok(relativeError(row.textCharsPerAction * row.unitsPerTextChar, row.meanPerStroke) <= 1e-9, `${layoutId} u/アクション`);
    assert.ok(relativeError(row.actionsPerUnit * row.meanPerStroke, 1) <= 1e-9, `${layoutId} 逆数`);
    someDifferent = someDifferent || relativeError(row.unitsPerTextChar, row.perCharUnits) > 1e-6;
  }
  assert.ok(someDifferent, 'W≠Cの行がある');
});

test('点の読み取り: 等位線の量の列が値を持たない対象には、軸の値から式で求まっても値を出さない', () => {
  const handShare = scatterContour('rightHandPressShare', 'rightHandDistanceShare', 100, 'ja')!;
  // 両手の距離が0の対象は、右手距離率が慣例で0%になる。式では0が求まるが、比の列は値を持たない
  assert.equal(handShare.valueAt(50, 0), 0);
  assert.equal(handShare.readoutAt(50, 0, NaN), undefined);
  // 右手の距離だけが0の対象は、比の列が0を持つので0を出す
  assert.equal(handShare.readoutAt(50, 0, 0), 0);
  assert.equal(handShare.readoutAt(20, 50, 4), 4);
  // 自由に選ぶ組でも、等位線の量の列で決める
  const byRatio = scatterContour('rightLeftPerPressRatio', 'rightHandDistanceShare', 100, 'ja')!;
  assert.equal(byRatio.column, 'rightHandPressShare');
  assert.equal(byRatio.readoutAt(4, 50, 20), 20);
  // 値を持たない列の無い恒等式は今までどおり
  assert.equal(scatterContour('actions', 'meanPerStroke', 100, 'ja')!.readoutAt(30, 4, 120), 120);
});

test('文字数に関わる恒等式: 分母が0の点では等位線の値を出さない', () => {
  const perUnit = scatterContour('textCharsPerAction', 'actionsPerUnit', 100, 'ja')!;
  assert.equal(perUnit.column, 'textCharsPerUnit');
  assert.equal(perUnit.valueAt(2, 3), 6);
  const byUnit = scatterContour('actionsPerUnit', 'textCharsPerUnit', 100, 'ja')!;
  assert.equal(byUnit.column, 'textCharsPerAction');
  assert.equal(byUnit.valueAt(0, 6), undefined);
  assert.equal(byUnit.valueAt(3, 6), 2);
  const perAction = scatterContour('textCharsPerAction', 'unitsPerTextChar', 100, 'ja')!;
  assert.equal(perAction.column, 'meanPerStroke');
  assert.equal(perAction.valueAt(2, 3), 6);
  const byChar = scatterContour('meanPerStroke', 'textCharsPerAction', 100, 'ja')!;
  assert.equal(byChar.column, 'unitsPerTextChar');
  assert.equal(byChar.valueAt(6, 0), undefined);
  assert.equal(byChar.valueAt(6, 2), 3);
  // 点の読み取りは、等位線の量の列が値を持たない対象には出さない
  assert.equal(perUnit.readoutAt(2, 3, NaN), undefined);
  assert.equal(perUnit.readoutAt(2, 3, 6), 6);
});

test('分母が0の点では等位線の値を出さない', () => {
  const distance = scatterContour('actions', 'meanPerStroke', 100, 'ja')!;
  // 距離 = 動作数 × u/打鍵 は、どちらが0でも右辺が決まるので値は0
  assert.equal(distance.valueAt(0, 0), 0);
  const byDistance = scatterContour('totalUnits', 'meanPerStroke', 100, 'ja')!;
  assert.equal(byDistance.column, 'actions');
  // 動作数 = 距離 / u/打鍵 は、u/打鍵が0の点で決まらない
  assert.equal(byDistance.valueAt(0, 0), undefined);
  assert.equal(byDistance.valueAt(120, 0), undefined);
  assert.equal(byDistance.valueAt(120, 4), 30);
  const ratio = scatterContour('actions', 'sameFinger', 100, 'ja')!;
  assert.equal(ratio.column, 'sameFingerRate');
  assert.equal(ratio.valueAt(0, 0), undefined);
  assert.equal(ratio.valueAt(200, 10), 5);
  // 押下/動作 = 押下/文字 ÷ 動作数/文字。動作数が0の点では決まらない
  const perAction = scatterContour('perCharSteps', 'perCharPresses', 100, 'ja')!;
  assert.equal(perAction.column, 'perActionPresses');
  assert.equal(perAction.valueAt(0, 0), undefined);
  assert.equal(perAction.valueAt(0.5, 1.5), 3);
  assert.ok(scatterContour('perCharSteps', 'perActionPresses', 0, 'ja') === undefined);
  // u/押下 = 距離 / 押下数。押下数が0の点では決まらない（u/文字 = 押下数/文字 × u/押下 の右辺は、どちらが0でも0）
  const perPress = scatterContour('perCharPresses', 'perCharUnits', 100, 'ja')!;
  assert.equal(perPress.column, 'perPressUnits');
  assert.equal(perPress.valueAt(0, 0), undefined);
  assert.equal(perPress.valueAt(2, 3), 1.5);
  const perChar = scatterContour('perCharPresses', 'perPressUnits', 100, 'ja')!;
  assert.equal(perChar.column, 'perCharUnits');
  assert.equal(perChar.valueAt(0, 0), 0);
  assert.equal(perChar.valueAt(2, 1.5), 3);
  const presses = scatterContour('perPressUnits', 'perCharUnits', 100, 'ja')!;
  assert.equal(presses.column, 'perCharPresses');
  assert.equal(presses.valueAt(0, 3), undefined);
  assert.equal(presses.valueAt(1.5, 3), 2);
  // 押下数/動作 = u/打鍵 ÷ u/押下。u/押下が0の点では決まらない
  const actionPresses = scatterContour('perPressUnits', 'meanPerStroke', 100, 'ja')!;
  assert.equal(actionPresses.column, 'perActionPresses');
  assert.equal(actionPresses.valueAt(0, 3), undefined);
  assert.equal(actionPresses.valueAt(1.5, 3), 2);
  const stroke = scatterContour('perActionPresses', 'perPressUnits', 100, 'ja')!;
  assert.equal(stroke.valueAt(2, 1.5), 3);
  assert.equal(scatterContour('perActionPresses', 'meanPerStroke', 100, 'ja')!.valueAt(0, 3), undefined);
  assert.equal(scatterContour('perCharPresses', 'perPressUnits', 0, 'ja'), undefined);
  const hand = scatterContour('handSwitches', 'handContinuations', 100, 'ja')!;
  assert.equal(hand.valueAt(0, 0), undefined);
  assert.equal(hand.valueAt(30, 10), 25);
  const continuations = scatterContour('handSwitches', 'sameHandContinuationRate', 100, 'ja')!;
  assert.equal(continuations.valueAt(30, 100), undefined);
  assert.equal(continuations.valueAt(30, 50), 30);
  const switches = scatterContour('handContinuations', 'sameHandContinuationRate', 100, 'ja')!;
  assert.equal(switches.valueAt(30, 0), undefined);
  // 右手u/押下比。右手の押下が0%・100%、右手の距離が100%の点では決まらない
  const handShare = scatterContour('rightHandPressShare', 'rightHandDistanceShare', 100, 'ja')!;
  assert.equal(handShare.valueAt(0, 0), undefined);
  assert.equal(handShare.valueAt(100, 100), undefined);
  assert.equal(handShare.valueAt(50, 100), undefined);
  assert.equal(handShare.valueAt(50, 50), 1);
  assert.equal(handShare.valueAt(20, 50), 4);
  // 右手の距離が0%の点は、式では比が0になる
  assert.equal(handShare.valueAt(50, 0), 0);
  const byRatio = scatterContour('rightHandPressShare', 'rightLeftPerPressRatio', 100, 'ja')!;
  assert.equal(byRatio.valueAt(20, 4), 50);
  assert.equal(scatterContour('rightHandDistanceShare', 'rightLeftPerPressRatio', 100, 'ja')!.valueAt(50, 4), 20);
  assert.equal(scatterContour('rightHandDistanceShare', 'rightLeftPerPressRatio', 100, 'ja')!.valueAt(0, 0), undefined);
  // 1文字あたりの軸を取る組は、入力文字数が0の時に総数へ直せないので、線を引かない
  assert.equal(scatterContour('perCharUnits', 'meanPerStroke', 0, 'ja'), undefined);
  assert.ok(scatterContour('actions', 'meanPerStroke', 0, 'ja'));
});
