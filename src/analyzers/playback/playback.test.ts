import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { builtinTextById } from '#input/text/builtin.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride, type SettingsCascadeOverrides } from '#engine/settings-items.ts';
import { DEFAULT_EXTRACTION_ASSETS } from '#analyzers/contract.ts';
import { basisIdOf, singleExtractionKeyOf, traceKeyOf } from '#engine/keys.ts';
import { resolveEngineInput, type ResolvedInput } from '#engine/resolved-input.ts';
import { createEngineCache } from '#engine/cache.ts';
import { checkOptionsDiscipline } from '#analyzers/options.ts';
import { DEFAULT_PLAYBACK_SPEED_MULTIPLIER, DEFAULT_PLAYBACK_STEPS_PER_SECOND } from '#interpretation/timing/playback.ts';
import type { PlaybackCalibration } from '#interpretation/timing/calibration.ts';
import { reconcilePlaybackStateAfterAnalysisRefresh } from '#interpretation/timing/playback.ts';
import { bigramFlowDefinition } from '#analyzers/bigram-flow/extract.ts';
import { playbackDefinition, type PlaybackExtracted } from './extract.ts';
import { derivePlaybackFrame, type PlaybackFrame } from './frame.ts';
import { DEFAULT_PLAYBACK_OPTIONS, playbackOptions, type PlaybackOptions } from './options.ts';
import {
  initialPlaybackState,
  pausePlayback,
  playbackScheduleOf,
  seekPlayback,
  startPlayback,
  stepPlaybackBy,
  stopPlayback,
  tickPlayback,
} from './session.ts';
import { playbackCalculationNotes } from './calculation-notes.ts';
import {
  calibrationPartChanges,
  calibrationWithParts,
  playbackAssetsKeyOf,
  playbackTimingConditions as timingConditionsOf,
} from './timing-conditions.ts';
import { sameHandDirectedFingerPairKey, sameHandFingerPairKey } from '#interpretation/timing/calibration.ts';
import { playbackSimultaneousOverheadMs } from '#interpretation/timing/playback.ts';
import { strokeSimultaneousKind } from '#interpretation/timing/stroke-structure.ts';

/** 既定の解析設定で、個人速度の保存値が無い時の時間の設定。 */
/** 配列図の4つの表示をすべて出す設定。既定は4つとも非表示。 */
const SHOW_ALL_FIGURE = {
  showFingerPositions: true,
  showPlannedKeys: true,
  showTrail: true,
  showOrderLabels: true,
} as const;

const defaultTiming = () => timingConditionsOf(DEFAULT_PLAYBACK_OPTIONS, DEFAULT_EXTRACTION_ASSETS);

/**
 * 打鍵再生Analyzerを、実際のengine経路（解決 → Trace → 構造解析 → 抽出）で検証する。
 * 時間の期待値は`spec/playback-timing.md`の式から手で導く。基準速度の既定は1.25ステップ/秒で、1ステップは800ms。
 */

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

function resolve(
  layoutId: string,
  text: string,
  language: 'en' | 'ja' = 'en',
  overrides: SettingsCascadeOverrides = EMPTY_SETTINGS_OVERRIDES,
  personalSpeed?: PlaybackCalibration,
): ResolvedInput {
  const setup: Setup = { id: 'setup-playback', number: 1, layoutId, shapeId: 'row-staggered' };
  const result = resolveEngineInput({
    target: { kind: 'setup', setupId: setup.id },
    setups: new Map([[setup.id, setup]]),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides,
    ...(personalSpeed === undefined ? {} : { personalSpeed }),
    text,
    language,
  });
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error));
  if (!result.ok) throw new Error('unreachable');
  return result.input;
}

function prepare(layoutId: string, text: string, language: 'en' | 'ja' = 'en') {
  const input = resolve(layoutId, text, language);
  const cache = createEngineCache();
  const { trace } = cache.getTrace(input);
  assert.ok(trace);
  const extracted = cache.getExtraction(input, playbackDefinition, DEFAULT_PLAYBACK_OPTIONS).extracted;
  return { input, trace, extracted };
}

function frameAt(
  layoutId: string,
  text: string,
  cursor: number,
  options: Partial<PlaybackOptions> = {},
  elapsedMs = 0,
  language: 'en' | 'ja' = 'en',
): { frame: PlaybackFrame; extracted: PlaybackExtracted } {
  const { input, trace, extracted } = prepare(layoutId, text, language);
  const timing = defaultTiming();
  const frame = derivePlaybackFrame({
    layout: input.layout,
    geometry: input.geometry,
    trace,
    analysis: extracted.analysis,
    windowSize: extracted.windowSize,
    schedule: playbackScheduleOf(extracted.analysis, input.geometry, timing),
    timing,
    options: { ...DEFAULT_PLAYBACK_OPTIONS, ...options },
    cursor,
    elapsedMs,
  });
  return { frame, extracted };
}

// ---------------------------------------------------------------------------
// 抽出
// ---------------------------------------------------------------------------

test('抽出は構造解析の結果をそのまま持ち、打鍵の列とステップ数が一致する', () => {
  const { trace, extracted } = prepare('qwerty', 'fjdk');
  assert.equal(extracted.analysis.strokes.length, trace.strokes.length);
  assert.equal(extracted.analysis.strokes.length, 4);
  assert.equal(extracted.windowSize, 3);
});

test('解析設定は、時間と速度平均の17項目だけが抽出のキーに入り、残りは表示だけが変わる', () => {
  assert.deepEqual(Object.keys(playbackOptions.items).sort(), [
    'allFingerMovementDelay',
    'applyPersonalSpeed',
    'commaAfterMs',
    'commaBeforeMs',
    'fingerPreparationSeconds',
    'keyFeedbackStyle',
    'periodAfterMs',
    'periodBeforeMs',
    'rateAverage',
    'rateHalfLifeSeconds',
    'rateWindow',
    'sameFingerDelay',
    'sameHandSpeed',
    'scale',
    'showArpeggio',
    'showChain',
    'showFingerPositions',
    'showOrderLabels',
    'showPlannedKeys',
    'showRomajiInput',
    'showRomajiPlan',
    'showSameFingerMotion',
    'showTrail',
    'speedMultiplier',
    'stepsPerSecond',
    'trailSteps',
    'useCrossHandDirection',
    'useFingerValues',
    'useKeystrokeOverhead',
    'useSimultaneousOverhead',
  ]);
  assert.deepEqual(playbackOptions.extractKeyOf(DEFAULT_PLAYBACK_OPTIONS), {
    stepsPerSecond: 1.25,
    speedMultiplier: 1,
    sameFingerDelay: true,
    allFingerMovementDelay: true,
    applyPersonalSpeed: true,
    sameHandSpeed: 'directed',
    useCrossHandDirection: true,
    useFingerValues: true,
    useSimultaneousOverhead: true,
    useKeystrokeOverhead: true,
    commaBeforeMs: 0,
    commaAfterMs: 0,
    periodBeforeMs: 0,
    periodAfterMs: 0,
    rateAverage: 'sma',
    rateWindow: 10,
    rateHalfLifeSeconds: 1,
  });
  assert.deepEqual(checkOptionsDiscipline(playbackOptions, playbackDefinition.optionsDiscipline), { keyViolations: [], viewExtractionViolations: [] });
});

test('表示設定を替えても同じ抽出結果が返る（Traceも抽出も作り直さない）', () => {
  const input = resolve('qwerty', 'fjdk');
  const cache = createEngineCache();
  const first = cache.getExtraction(input, playbackDefinition, DEFAULT_PLAYBACK_OPTIONS).extracted;
  const second = cache.getExtraction(input, playbackDefinition, { ...DEFAULT_PLAYBACK_OPTIONS, scale: 2, showChain: true }).extracted;
  assert.equal(second, first);
});

// ---------------------------------------------------------------------------
// 速度の推移（spec/playback-timing.md §5）
// ---------------------------------------------------------------------------

/** 解析設定の一部だけを替えた打鍵再生の抽出。 */
function extractionOf(input: ResolvedInput, options: Partial<PlaybackOptions> = {}, cache = createEngineCache()): PlaybackExtracted {
  return cache.getExtraction(input, playbackDefinition, { ...DEFAULT_PLAYBACK_OPTIONS, ...options }).extracted;
}

/** 解析設定の一部だけを替えた時の、抽出のキー。 */
function extractionKeyOf(input: ResolvedInput, options: Partial<PlaybackOptions> = {}): string {
  return singleExtractionKeyOf(input, playbackDefinition, { ...DEFAULT_PLAYBACK_OPTIONS, ...options });
}

test('速度の推移（SMA・窓幅10）: 完了した入力単位だけをかなに数え、位置0には値が無い（§5.1）', () => {
  // 条件: 配列qwerty・ローマ字（訓令式）・物理配列row-staggered・指の割り当ては既定・テキスト「かあ」（k・a・aの3打鍵）。
  // どのステップも指が違うか同じキーの連打で、表示時間は800ms。窓の合計は800ms×窓のStroke数。
  const { rateChart } = extractionOf(resolve('qwerty', 'かあ', 'ja'));
  assert.deepEqual(
    rateChart.map((point) => point.cursor),
    [0, 1, 2, 3],
  );
  assert.deepEqual([rateChart[0].kanaPerSecond, rateChart[0].actionsPerSecond], [undefined, undefined]);
  // アクション/秒 = Stroke数 × 1000 / D = 1000 / 800
  assert.deepEqual(
    rateChart.map((point) => point.actionsPerSecond),
    [undefined, 1.25, 1.25, 1.25],
  );
  // かな/秒 = 窓の中で始まり終わる入力単位の文字数 × 1000 / D。
  // 位置1は「か」の途中（kだけ）なので数えず、位置2で「か」が完了して1×1000/1600、位置3で「あ」も加わって2×1000/2400
  assert.deepEqual(
    rateChart.map((point) => point.kanaPerSecond),
    [undefined, undefined, 1000 / 1600, 2000 / 2400],
  );
  assert.deepEqual(
    rateChart.map((point) => point.inputText),
    ['', 'か', 'か', 'かあ'],
  );
});

test('速度の推移（SMA）: 時間は再生と同じ時間表を使い、同指連続のステップは長くなる（§3.3・§5.1）', () => {
  // 条件: 配列qwerty・物理配列row-staggered・テキスト「fv」（同じ左人差し指がfからvへ移る）。
  const input = resolve('qwerty', 'fv');
  const extracted = extractionOf(input);
  const f = input.geometry.keys.get('f')!;
  const v = input.geometry.keys.get('v')!;
  const moved = Math.hypot(f.x - v.x, f.y - v.y);
  assert.deepEqual(extracted.schedule, playbackScheduleOf(extracted.analysis, input.geometry, defaultTiming()));
  // 窓の合計Dは時間表の終わり: 800+800×移動距離
  const total = 800 + 800 * moved;
  assert.ok(Math.abs(extracted.schedule[1].endMs - total) < 1e-6);
  assert.ok(Math.abs(extracted.rateChart[2].actionsPerSecond! - 2000 / total) < 1e-9);
  assert.ok(Math.abs(extracted.rateChart[2].kanaPerSecond! - 2000 / total) < 1e-9);
  assert.equal(extracted.rateChart[2].actionsPerSecond, 1.1803398874989484);
});

test('速度の推移（SMA）: 窓幅を小さくすると、古いStrokeが窓から外れる', () => {
  // 条件: 配列qwerty・テキスト「fv」・窓幅1。位置2の窓は2打鍵目だけで、D = 800 × 移動距離
  const input = resolve('qwerty', 'fv');
  const extracted = extractionOf(input, { rateWindow: 1 });
  const second = extracted.schedule[1].endMs - extracted.schedule[1].startMs;
  assert.ok(Math.abs(extracted.rateChart[2].actionsPerSecond! - 1000 / second) < 1e-9);
  assert.ok(Math.abs(extracted.rateChart[2].kanaPerSecond! - 1000 / second) < 1e-9);
});

test('速度の推移（EWMA）: 時間で減衰させ、最初の有効な値を初期値にする（§5.2）', () => {
  // 条件: 配列qwerty・テキスト「fv」・半減時間1秒。1打鍵目は800ms、2打鍵目は800×移動距離ms。
  const input = resolve('qwerty', 'fv');
  const extracted = extractionOf(input, { rateAverage: 'ewma', rateHalfLifeSeconds: 1 });
  const second = (extracted.schedule[1].endMs - extracted.schedule[1].startMs) / 1000;
  const decay = 2 ** (-second / 1);
  const expected = decay * 1.25 + (1 - decay) * (1 / second);
  assert.equal(extracted.rateChart[1].actionsPerSecond, 1.25);
  assert.ok(Math.abs(extracted.rateChart[2].actionsPerSecond! - expected) < 1e-9);
  // 1 Stroke = 1かなで瞬時値の系列が同じなので、かな/秒もアクション/秒と一致する
  assert.ok(Math.abs(extracted.rateChart[2].kanaPerSecond! - expected) < 1e-9);
  assert.equal(extracted.rateChart[2].actionsPerSecond, 1.1890265225127918);
});

test('解析設定の共有リンク: 時間と速度平均の17項目は既定と違う時だけ書き、読み戻すと同じ値になる', () => {
  assert.equal(playbackOptions.encodeOptionsToUrl(DEFAULT_PLAYBACK_OPTIONS).toString(), '');
  const changed: PlaybackOptions = {
    ...DEFAULT_PLAYBACK_OPTIONS,
    stepsPerSecond: 2.5,
    speedMultiplier: 2,
    sameFingerDelay: false,
    allFingerMovementDelay: false,
    applyPersonalSpeed: false,
    sameHandSpeed: 'pair',
    useCrossHandDirection: false,
    useFingerValues: false,
    useSimultaneousOverhead: false,
    useKeystrokeOverhead: false,
    commaBeforeMs: 300,
    commaAfterMs: 200,
    periodBeforeMs: 100,
    periodAfterMs: 500,
    rateAverage: 'ewma',
    rateWindow: 20,
    rateHalfLifeSeconds: 2,
  };
  const params = playbackOptions.encodeOptionsToUrl(changed);
  assert.equal(params.size, 17);
  const diagnostics: never[] = [];
  const decoded = playbackOptions.decodeOptionsFromUrl(params, diagnostics);
  assert.deepEqual({ ...DEFAULT_PLAYBACK_OPTIONS, ...decoded.values }, changed);
  assert.deepEqual(diagnostics, []);
  // 範囲外・小数の窓幅は捨てて診断を積み、その項目は既定のまま
  const broken = new URLSearchParams({ speed: '99', rateWindow: '2.5', rateAverage: 'median' });
  const brokenDiagnostics: unknown[] = [];
  const result = playbackOptions.decodeOptionsFromUrl(broken, brokenDiagnostics as never);
  assert.deepEqual(result.values, {});
  assert.equal(brokenDiagnostics.length, 3);
});

test('別のAnalyzerの抽出のキーは、個人速度の保存値が変わっても変わらない', () => {
  const withSaved = resolve('qwerty', 'fjdk', 'en', EMPTY_SETTINGS_OVERRIDES, CALIBRATION);
  const withoutSaved = resolve('qwerty', 'fjdk');
  assert.equal(
    singleExtractionKeyOf(withSaved, bigramFlowDefinition, bigramFlowDefinition.defaultOptions),
    singleExtractionKeyOf(withoutSaved, bigramFlowDefinition, bigramFlowDefinition.defaultOptions),
  );
});

/** 保存値の判定だけを確かめるテストで、再生するステップの列の判定を通す値。 */
const ALL_OVERHEAD_USE = { keystroke: true, simultaneous: true } as const;

test('既定と違う計算の知らせ: 使われない項目は挙げず、個人速度で計算している時は基準速度を挙げない', () => {
  const notes = (options: Partial<PlaybackOptions>, use: 'applied' | 'not-applied' | 'missing') =>
    playbackCalculationNotes({ ...DEFAULT_PLAYBACK_OPTIONS, ...options }, use, undefined, undefined, ALL_OVERHEAD_USE);
  assert.deepEqual(notes({}, 'missing'), { personalSpeedInUse: false, keystrokeOverheadInUse: false, simultaneousOverheadInUse: false, changes: [] });
  assert.deepEqual(notes({}, 'applied'), { personalSpeedInUse: true, keystrokeOverheadInUse: false, simultaneousOverheadInUse: false, changes: [] });
  assert.deepEqual(notes({ stepsPerSecond: 2, speedMultiplier: 3 }, 'missing').changes, ['基準速度: 2ステップ/秒', '再生倍率: 3倍']);
  // 個人速度で計算している間、基準速度は数値に入らない。再生倍率は入る
  assert.deepEqual(notes({ stepsPerSecond: 2, speedMultiplier: 3 }, 'applied').changes, ['再生倍率: 3倍']);
  assert.deepEqual(notes({ sameFingerDelay: false, allFingerMovementDelay: false, applyPersonalSpeed: false }, 'not-applied').changes, [
    '同じ指の移動時間を考慮しない',
    '全指の移動時間で律速しない',
    '個人速度を適用しない',
  ]);
  // 平均の方式で使われない側の窓幅・半減時間は挙げない
  assert.deepEqual(notes({ rateWindow: 20, rateHalfLifeSeconds: 2 }, 'missing').changes, ['平均の窓幅: 20打鍵']);
  assert.deepEqual(notes({ rateAverage: 'ewma', rateWindow: 20, rateHalfLifeSeconds: 2 }, 'missing').changes, [
    '平均の方式: EWMA',
    '平均の半減時間: 2秒',
  ]);
});

test('時間表と速度の推移が、固定した値になる', () => {
  // 期待値は固定した実測値。
  // 条件: 配列qwerty・物理配列row-staggered・指の割り当ては既定。個人速度の保存値は、あるとして5アクション/秒
  // （同手別指も5）を使う。
  const rates = (extracted: PlaybackExtracted) => extracted.rateChart.map((point) => [point.cursor, point.kanaPerSecond, point.actionsPerSecond]);
  // 既定の解析設定・テキスト「fv」（同指連続）
  const fv = extractionOf(resolve('qwerty', 'fv'));
  assert.deepEqual(fv.schedule, [
    { strokeIndex: 0, startMs: 0, endMs: 800 },
    { strokeIndex: 1, startMs: 800, endMs: 1694.427190999916 },
  ]);
  assert.deepEqual(rates(fv), [
    [0, undefined, undefined],
    [1, 1.25, 1.25],
    [2, 1.1803398874989484, 1.1803398874989484],
  ]);
  // 既定の解析設定・テキスト「かあ」
  const kana = extractionOf(resolve('qwerty', 'かあ', 'ja'));
  assert.deepEqual(kana.schedule, [
    { strokeIndex: 0, startMs: 0, endMs: 800 },
    { strokeIndex: 1, startMs: 800, endMs: 1600 },
    { strokeIndex: 2, startMs: 1600, endMs: 2400 },
  ]);
  assert.deepEqual(rates(kana), [
    [0, undefined, undefined],
    [1, undefined, 1.25],
    [2, 0.625, 1.25],
    [3, 0.8333333333333334, 1.25],
  ]);
  // 8項目を既定と違う値にして、個人速度を適用しない設定・テキスト「fv」
  const changed = extractionOf(resolve('qwerty', 'fv'), {
    stepsPerSecond: 2.5,
    speedMultiplier: 1.5,
    sameFingerDelay: false,
    allFingerMovementDelay: false,
    applyPersonalSpeed: false,
    rateAverage: 'ewma',
    rateWindow: 5,
    rateHalfLifeSeconds: 2,
  });
  assert.deepEqual(changed.schedule, [
    { strokeIndex: 0, startMs: 0, endMs: 266.6666666666667 },
    { strokeIndex: 1, startMs: 266.6666666666667, endMs: 533.3333333333334 },
  ]);
  assert.deepEqual(rates(changed), [
    [0, undefined, undefined],
    [1, 3.7499999999999996, 3.7499999999999996],
    [2, 3.7499999999999996, 3.7499999999999996],
  ]);
  // 既定の解析設定・個人速度の保存値あり・テキスト「fv」
  const personal = extractionOf(resolve('qwerty', 'fv', 'en', EMPTY_SETTINGS_OVERRIDES, CALIBRATION));
  assert.deepEqual(personal.schedule, [
    { strokeIndex: 0, startMs: 0, endMs: 200 },
    { strokeIndex: 1, startMs: 200, endMs: 511.8033988749895 },
  ]);
  assert.deepEqual(rates(personal), [
    [0, undefined, undefined],
    [1, 5, 5],
    [2, 3.907750523728956, 3.907750523728956],
  ]);
});

test('速度の推移: ChainとArpeggioの区間を点ごとに持つ（表示するかは見る側が決める）', () => {
  // 条件: 配列qwerty・テキスト「fv」。構造解析のChainは打鍵0だけ（f）で、vで切れる
  const fv = extractionOf(resolve('qwerty', 'fv'));
  assert.deepEqual(
    fv.analysis.chains.map((chain) => [chain.startStrokeIndex, chain.endStrokeIndex]),
    [[0, 1]],
  );
  assert.deepEqual(
    fv.rateChart.map((point) => point.chain ?? false),
    [false, true, false],
  );
  // テキスト「asdf」はChain 1本・Arpeggio 1本で、4打鍵すべてが入る
  const asdf = extractionOf(resolve('qwerty', 'asdf'));
  assert.deepEqual(
    asdf.rateChart.slice(1).map((point) => [point.chain, point.arpeggio]),
    [
      [true, true],
      [true, true],
      [true, true],
      [true, true],
    ],
  );
});

test('平均方式・窓幅・半減時間を変えると、Traceと構造解析は作り直さずに抽出だけが変わる', () => {
  const input = resolve('qwerty', 'fv');
  const variants: Partial<PlaybackOptions>[] = [
    {},
    { rateAverage: 'ewma' },
    { rateWindow: 1 },
    // 半減時間はEWMAでだけ値に効くので、方式もEWMAにして半減時間の違いだけを見る
    { rateAverage: 'ewma', rateHalfLifeSeconds: 2 },
  ];
  const cache = createEngineCache();
  const results = variants.map((options) => extractionOf(input, options, cache));

  // Traceのキー・解釈のキー・再生位置の識別子は、入力が同じなので変わらない。抽出のキーだけが違う
  assert.equal(new Set(variants.map((options) => extractionKeyOf(input, options))).size, 4);
  // Traceと解釈は1回だけ作られ、抽出は4回作られる
  assert.deepEqual(
    { trace: cache.size.trace, interpretation: cache.size.interpretation, extraction: cache.size.extraction },
    { trace: 1, interpretation: 1, extraction: 4 },
  );
  // 同じ構造解析を指し、速度の推移だけが変わる
  for (const result of results) assert.equal(result.analysis, results[0].analysis);
  assert.equal(new Set(results.map((result) => JSON.stringify(result.rateChart))).size, 4);
  assert.deepEqual(results[0].schedule, results[1].schedule);
  assert.equal(results[0].basisId, results[1].basisId);
});

test('テキストや構造の条件を変えると、再生位置の識別子が変わる', () => {
  const base = resolve('qwerty', 'fjdk');
  assert.notEqual(basisIdOf(resolve('qwerty', 'fjdl')), basisIdOf(base));
  const chain = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'chainInterpretation', {
    breakOnSameFinger: false,
    breakOnTriggerOnly: false,
    breakOnThumbOnly: true,
    breakOnOppositeHandSimultaneous: false,
  });
  assert.ok(chain.ok);
  if (chain.ok) assert.notEqual(basisIdOf(resolve('qwerty', 'fjdk', 'en', chain.overrides)), basisIdOf(base));
});

// ---------------------------------------------------------------------------
// 時間モデルの条件（spec/playback-timing.md §2・§2.1）
// ---------------------------------------------------------------------------

/** 通常速度5アクション/秒（200ms）の個人速度。方向別・組別の値は持たず、異手も同手別指も通常速度に落ちる。 */
const CALIBRATION: PlaybackCalibration = {
  actionsPerSecond: 5,
  sameHandDifferentFingerActionsPerSecond: 5,
  sameHandDifferentFingerActionsPerSecondByPair: {},
  fingerRepeatMs: {},
  fingerMoveMsPerUnit: {},
  fallbackRepeatMs: 1000 / 5,
  fallbackMoveMsPerUnit: 1000 / 10,
  measuredAt: 1,
};

const STEP_ENDS = (extracted: PlaybackExtracted) => extracted.schedule.map((step) => step.endMs);

test('基準速度・再生倍率・同じ指の移動時間の考慮の設定が、再生の時間表に届く', () => {
  // 条件: 配列qwerty・物理配列row-staggered・テキスト「fjdk」（どの隣り合うステップも指が違う）。既定は800ms。
  const fjdk = resolve('qwerty', 'fjdk');
  assert.deepEqual(STEP_ENDS(extractionOf(fjdk)), [800, 1600, 2400, 3200]);
  // 基準速度2.5ステップ/秒 → 400ms
  const faster = extractionOf(fjdk, { stepsPerSecond: 2.5 });
  assert.deepEqual(STEP_ENDS(faster), [400, 800, 1200, 1600]);
  // 再生倍率2は最後に掛かる → 400ms
  const doubled = extractionOf(fjdk, { speedMultiplier: 2 });
  assert.deepEqual(STEP_ENDS(doubled), [400, 800, 1200, 1600]);
  // 同じ指の移動時間を考慮しなければ、同指連続のステップも800msになる（テキスト「fv」）
  const fv = resolve('qwerty', 'fv');
  const off = extractionOf(fv, { sameFingerDelay: false, allFingerMovementDelay: false });
  assert.deepEqual(STEP_ENDS(off), [800, 1600]);
  assert.ok(STEP_ENDS(extractionOf(fv))[1] > 1600);
  // 設定の値は抽出が持つ時間の設定にも載る
  assert.equal(faster.timing.stepsPerSecond, 2.5);
  assert.equal(doubled.timing.speedMultiplier, 2);
  assert.equal(off.timing.sameFingerDelay, false);
});

test('全指の移動時間で律速する設定が、抽出の時間表に届く', () => {
  // 条件: 配列qwerty・物理配列row-staggered・テキスト「fv」。fからvへ移る指の移動時間が基本の時間を超えれば、終了時刻が延びる。
  const fv = resolve('qwerty', 'fv');
  const on = extractionOf(fv);
  const off = extractionOf(fv, { allFingerMovementDelay: false });
  assert.equal(on.timing.allFingerMovementDelay, true);
  assert.equal(off.timing.allFingerMovementDelay, false);
  assert.deepEqual(
    on.schedule.map((step) => step.strokeIndex),
    off.schedule.map((step) => step.strokeIndex),
  );
  assert.ok(on.schedule[1].endMs >= off.schedule[1].endMs);
});

test('時間モデルの設定を変えても、Traceと構造解析は作り直さずに抽出だけが変わる', () => {
  const input = resolve('qwerty', 'fv');
  const variants: Partial<PlaybackOptions>[] = [
    {},
    { stepsPerSecond: 2.5 },
    { speedMultiplier: 2 },
    { sameFingerDelay: false },
    { allFingerMovementDelay: false },
  ];
  const cache = createEngineCache();
  const results = variants.map((options) => extractionOf(input, options, cache));
  assert.equal(new Set(variants.map((options) => extractionKeyOf(input, options))).size, 5);
  assert.deepEqual(
    { trace: cache.size.trace, interpretation: cache.size.interpretation, extraction: cache.size.extraction },
    { trace: 1, interpretation: 1, extraction: 5 },
  );
  for (const result of results) assert.equal(result.analysis, results[0].analysis);
  for (const result of results) assert.equal(result.basisId, results[0].basisId);
});

test('個人速度: 適用する設定で保存値があれば、その値で時間を求め、抽出のキーに保存値が入る（§2.1）', () => {
  // 条件: 配列qwerty・テキスト「fjdk」・通常速度5アクション/秒 → 1000/5 = 200ms。再生倍率は1。
  const base = resolve('qwerty', 'fjdk');
  const applied = resolve('qwerty', 'fjdk', 'en', EMPTY_SETTINGS_OVERRIDES, CALIBRATION);
  const appliedResult = extractionOf(applied);
  assert.deepEqual(STEP_ENDS(appliedResult), [200, 400, 600, 800]);
  assert.equal(appliedResult.personalSpeedUse, 'applied');
  assert.equal(appliedResult.timing.calibration, CALIBRATION);
  // 個人速度で計算している間、基準速度の設定は時間に入らない
  assert.deepEqual(STEP_ENDS(extractionOf(applied, { stepsPerSecond: 10 })), [200, 400, 600, 800]);
  // 保存値が変われば、キーが変わって抽出を作り直す。Traceと構造解析は同じ
  const remeasured = resolve('qwerty', 'fjdk', 'en', EMPTY_SETTINGS_OVERRIDES, { ...CALIBRATION, actionsPerSecond: 10 });
  assert.deepEqual(STEP_ENDS(extractionOf(remeasured)), [100, 200, 300, 400]);
  assert.notEqual(extractionKeyOf(remeasured), extractionKeyOf(applied));
  assert.notEqual(extractionKeyOf(applied), extractionKeyOf(base));
  assert.equal(traceKeyOf(remeasured), traceKeyOf(applied));
  assert.equal(basisIdOf(remeasured), basisIdOf(base));
});

test('個人速度: 打鍵の上乗せは構造の種類で選ばれて時間表に入り、抽出のキーが変わる（§3.1.1）', () => {
  // 条件: 配列qwerty・物理配列row-staggered・通常速度5アクション/秒（200ms）・同手別指も5・既定の解析設定。
  // 「fjdk」は手が交互で、Chain・Arpeggioに入らない。どの遷移もその他
  const overhead = { arpeggio: 10, chain: 30, other: 70 };
  const withOverhead = { ...CALIBRATION, keystrokeOverheadMs: overhead };
  const fjdk = resolve('qwerty', 'fjdk', 'en', EMPTY_SETTINGS_OVERRIDES, withOverhead);
  assert.deepEqual(STEP_ENDS(extractionOf(fjdk)), [270, 540, 810, 1080]);
  // 「asdf」はChain 1本・Arpeggio 1本で4打鍵すべてが入る。最初のステップはその他、残りの遷移はArpeggio
  const asdf = extractionOf(resolve('qwerty', 'asdf', 'en', EMPTY_SETTINGS_OVERRIDES, withOverhead));
  assert.deepEqual(STEP_ENDS(asdf), [270, 480, 690, 900]);
  // 再生倍率は打鍵の上乗せを足した後に掛かる
  assert.deepEqual(STEP_ENDS(extractionOf(fjdk, { speedMultiplier: 2 })), [135, 270, 405, 540]);
  // 打鍵の上乗せを持たない保存値とはキーが違い、打鍵の上乗せが変わってもキーが変わる
  const plain = resolve('qwerty', 'fjdk', 'en', EMPTY_SETTINGS_OVERRIDES, CALIBRATION);
  assert.notEqual(extractionKeyOf(fjdk), extractionKeyOf(plain));
  const changed = resolve('qwerty', 'fjdk', 'en', EMPTY_SETTINGS_OVERRIDES, { ...CALIBRATION, keystrokeOverheadMs: { other: 71 } });
  assert.notEqual(extractionKeyOf(fjdk), extractionKeyOf(changed));
  // 個人速度を適用しない設定では打鍵の上乗せも入らない
  assert.deepEqual(STEP_ENDS(extractionOf(fjdk, { applyPersonalSpeed: false })), [800, 1600, 2400, 3200]);
});

test('既定と違う計算の知らせ: 個人速度で計算していて打鍵の上乗せを足している時だけ、そのことを挙げる', () => {
  const notes = (use: 'applied' | 'not-applied' | 'missing', calibration?: PlaybackCalibration) =>
    playbackCalculationNotes(DEFAULT_PLAYBACK_OPTIONS, use, calibration, undefined, ALL_OVERHEAD_USE);
  const withOverhead = { ...CALIBRATION, keystrokeOverheadMs: { other: 60 } };
  assert.equal(notes('applied', withOverhead).keystrokeOverheadInUse, true);
  assert.equal(notes('applied', CALIBRATION).keystrokeOverheadInUse, false);
  assert.equal(notes('applied', { ...CALIBRATION, keystrokeOverheadMs: {} }).keystrokeOverheadInUse, false);
  assert.equal(notes('applied').keystrokeOverheadInUse, false);
  assert.equal(notes('not-applied', withOverhead).keystrokeOverheadInUse, false);
  assert.equal(notes('missing', withOverhead).keystrokeOverheadInUse, false);
});

test('既定と違う計算の知らせ: 個人速度で計算していて同時押しの上乗せが0以外の時だけ、そのことを挙げる', () => {
  const notes = (use: 'applied' | 'not-applied' | 'missing', calibration?: PlaybackCalibration) =>
    playbackCalculationNotes(DEFAULT_PLAYBACK_OPTIONS, use, calibration, undefined, ALL_OVERHEAD_USE);
  const withC = { ...CALIBRATION, simultaneousOverheadMs: { thumb: 50 } };
  assert.equal(notes('applied', withC).simultaneousOverheadInUse, true);
  assert.equal(notes('applied', { ...CALIBRATION, simultaneousOverheadMs: { thumb: 0 } }).simultaneousOverheadInUse, false);
  assert.equal(notes('applied', CALIBRATION).simultaneousOverheadInUse, false);
  assert.equal(notes('not-applied', withC).simultaneousOverheadInUse, false);
  assert.equal(notes('missing', withC).simultaneousOverheadInUse, false);
});

test('既定と違う計算の知らせ: 打鍵の上乗せは、時間に入る種類が0以外の値を持つ時だけ足していると示す', () => {
  const notes = (sameFingerDelay: boolean, keystrokeOverheadMs: NonNullable<PlaybackCalibration['keystrokeOverheadMs']>) =>
    playbackCalculationNotes(
      { ...DEFAULT_PLAYBACK_OPTIONS, sameFingerDelay },
      'applied',
      { ...CALIBRATION, keystrokeOverheadMs },
      undefined,
      ALL_OVERHEAD_USE,
    ).keystrokeOverheadInUse;
  // 同指連続の値だけの時は、同じ指の移動時間を考慮する時だけ時間に入る
  assert.equal(notes(true, { sfb: 40 }), true);
  assert.equal(notes(false, { sfb: 40 }), false);
  // 他の種類の値は、同じ指の移動時間の考慮によらず時間に入る
  for (const kind of ['arpeggio', 'chain', 'other', 'repeat'] as const) {
    assert.equal(notes(true, { [kind]: 40 }), true, kind);
    assert.equal(notes(false, { [kind]: 40 }), true, kind);
  }
  assert.equal(notes(false, { sfb: 40, other: 10 }), true);
  // 全ての値が0なら、足さない
  assert.equal(notes(true, { arpeggio: 0, chain: 0, other: 0, repeat: 0, sfb: 0 }), false);
  assert.equal(notes(false, { other: 0, sfb: 0 }), false);
  assert.equal(notes(true, { other: 0, sfb: 40 }), true);
  // 負の値も時間に入っている
  assert.equal(notes(true, { other: -20 }), true);
  assert.equal(notes(false, { sfb: -20 }), false);
  assert.equal(notes(true, { sfb: -20 }), true);
  assert.equal(notes(false, { sfb: -20, repeat: -1 }), true);
});

test('個人速度: 保存値が無ければ個人速度無しの時間で、そのことを抽出が伝える（§2.1）', () => {
  const missing = extractionOf(resolve('qwerty', 'fjdk'));
  assert.equal(missing.personalSpeedUse, 'missing');
  assert.equal(missing.timing.calibration, undefined);
  assert.deepEqual(STEP_ENDS(missing), [800, 1600, 2400, 3200]);
});

test('個人速度: 適用しない設定なら、保存値があっても個人速度無しの時間で、保存値はキーに入らない（§2.1）', () => {
  const off = { applyPersonalSpeed: false } as const;
  const withSaved = resolve('qwerty', 'fjdk', 'en', EMPTY_SETTINGS_OVERRIDES, CALIBRATION);
  const withoutSaved = resolve('qwerty', 'fjdk');
  const result = extractionOf(withSaved, off);
  assert.equal(result.personalSpeedUse, 'not-applied');
  assert.deepEqual(STEP_ENDS(result), [800, 1600, 2400, 3200]);
  // 適用しない間に測り直しても、抽出は作り直さない
  assert.equal(extractionKeyOf(withSaved, off), extractionKeyOf(withoutSaved, off));
  const remeasured = resolve('qwerty', 'fjdk', 'en', EMPTY_SETTINGS_OVERRIDES, { ...CALIBRATION, actionsPerSecond: 10 });
  assert.equal(extractionKeyOf(remeasured, off), extractionKeyOf(withSaved, off));
  // 同じ入力でも、適用する設定と適用しない設定ではキーが違う
  assert.notEqual(extractionKeyOf(withSaved, off), extractionKeyOf(withSaved));
  const cache = createEngineCache();
  extractionOf(withSaved, off, cache);
  extractionOf(remeasured, off, cache);
  assert.equal(cache.size.extraction, 1);
});

test('個人速度: 適用する設定では、保存値が無い入力と有る入力でキーが違い、測り直すと作り直す（§2.1）', () => {
  const withoutSaved = resolve('qwerty', 'fjdk');
  const withSaved = resolve('qwerty', 'fjdk', 'en', EMPTY_SETTINGS_OVERRIDES, CALIBRATION);
  assert.notEqual(extractionKeyOf(withSaved), extractionKeyOf(withoutSaved));
  const cache = createEngineCache();
  extractionOf(withSaved, {}, cache);
  extractionOf(resolve('qwerty', 'fjdk', 'en', EMPTY_SETTINGS_OVERRIDES, { ...CALIBRATION, actionsPerSecond: 10 }), {}, cache);
  assert.equal(cache.size.extraction, 2);
  assert.equal(cache.size.trace, 1);
});

test('時間の設定を変えると、カーソルと再生中かどうかを保ち、経過時間は進捗率のまま新しい時間表へ写す（§4.0）', () => {
  // 条件: 配列qwerty・テキスト「fjdk」。基準速度1.25（800ms）→ 2.5（400ms）。2打目の途中（400ms経過 = 進捗率0.5）で変える
  const input = resolve('qwerty', 'fjdk');
  const slow = extractionOf(input);
  const fast = extractionOf(input, { stepsPerSecond: 2.5 });
  assert.equal(fast.basisId, slow.basisId);
  const before = { ...initialPlaybackState(slow.timing), cursor: 1, elapsedMs: 400, playing: true };
  const after = reconcilePlaybackStateAfterAnalysisRefresh(
    before,
    initialPlaybackState(fast.timing),
    slow.analysis,
    fast.analysis,
    before.cursor,
    slow.schedule,
    fast.schedule,
  );
  assert.equal(after.cursor, 1);
  assert.equal(after.playing, true);
  assert.equal(after.elapsedMs, 200);
  assert.equal(after.stepsPerSecond, 2.5);
});

// ---------------------------------------------------------------------------
// 再生の時間（spec/playback-timing.md）
// ---------------------------------------------------------------------------

test('時間の設定は仕様 §2の既定値で、個人速度の保存値が無い間は個人速度を使わない', () => {
  assert.deepEqual(defaultTiming(), {
    stepsPerSecond: 1.25,
    speedMultiplier: 1,
    sameFingerDelay: true,
    allFingerMovementDelay: true,
    calibration: undefined,
  });
  assert.equal(DEFAULT_PLAYBACK_STEPS_PER_SECOND, 1.25);
  assert.equal(DEFAULT_PLAYBACK_SPEED_MULTIPLIER, 1);
});

test('同指連続を含まないステップは、どれも800msで、時間表は切れ目なく積まれる（§3.2・§4.1）', () => {
  // f（左人差し指）→ j（右人差し指）→ d（左中指）→ k（右中指）。どの隣り合うステップも指が違う。
  const { input, extracted } = prepare('qwerty', 'fjdk');
  const schedule = playbackScheduleOf(extracted.analysis, input.geometry, defaultTiming());
  assert.deepEqual(schedule, [
    { strokeIndex: 0, startMs: 0, endMs: 800 },
    { strokeIndex: 1, startMs: 800, endMs: 1600 },
    { strokeIndex: 2, startMs: 1600, endMs: 2400 },
    { strokeIndex: 3, startMs: 2400, endMs: 3200 },
  ]);
});

test('同指連続のステップは、移動距離を正規化して掛けた時間になる（§3.3）', () => {
  // f→vは同じ左人差し指が別のキーへ移る。距離はキー中心間の距離で、物理配列の座標から求める。
  const { input, extracted } = prepare('qwerty', 'fv');
  const f = input.geometry.keys.get('f')!;
  const v = input.geometry.keys.get('v')!;
  const moved = Math.hypot(f.x - v.x, f.y - v.y);
  assert.ok(moved > 1, `この物理配列でf→vは1uを超える: ${moved}`);
  const schedule = playbackScheduleOf(extracted.analysis, input.geometry, defaultTiming());
  assert.equal(schedule[0].endMs - schedule[0].startMs, 800);
  assert.ok(Math.abs(schedule[1].endMs - schedule[1].startMs - 800 * moved) < 1e-6);
  assert.equal(schedule[1].startMs, schedule[0].endMs);
});

test('同じキーの連打は同指連続に数えず、通常の800ms（§3.2）', () => {
  const { input, extracted } = prepare('qwerty', 'ff');
  const schedule = playbackScheduleOf(extracted.analysis, input.geometry, defaultTiming());
  assert.deepEqual(
    schedule.map((step) => step.endMs - step.startMs),
    [800, 800],
  );
});

// ---------------------------------------------------------------------------
// 再生位置の遷移
// ---------------------------------------------------------------------------

test('再生位置: 開始・一時停止・停止・1ステップ・シーク', () => {
  const timing = defaultTiming();
  const initial = initialPlaybackState(timing);
  assert.deepEqual([initial.cursor, initial.playing, initial.elapsedMs], [0, false, 0]);

  const playing = startPlayback(initial, 4);
  assert.equal(playing.playing, true);
  assert.equal(pausePlayback(playing).playing, false);
  // 打鍵が無い・最後まで進んでいる時は始めない
  assert.equal(startPlayback(initial, 0).playing, false);
  assert.equal(startPlayback({ ...initial, cursor: 4 }, 4).playing, false);

  const stepped = stepPlaybackBy(initial, 1, 4);
  assert.equal(stepped.cursor, 1);
  assert.equal(stepPlaybackBy(stepped, -1, 4).cursor, 0);
  // 先頭より前・末尾より先へは進まない
  assert.equal(stepPlaybackBy(initial, -1, 4).cursor, 0);
  assert.equal(stepPlaybackBy({ ...initial, cursor: 4 }, 1, 4).cursor, 4);
  // 再生中の1ステップ移動は無視する
  assert.equal(stepPlaybackBy(playing, 1, 4).cursor, 0);

  const sought = seekPlayback({ ...playing, elapsedMs: 300 }, 3, 4);
  assert.deepEqual([sought.cursor, sought.elapsedMs, sought.playing], [3, 0, true]);
  assert.equal(seekPlayback(initial, 99, 4).cursor, 4);
  assert.equal(seekPlayback(initial, -5, 4).cursor, 0);

  const stopped = stopPlayback({ ...playing, cursor: 3, elapsedMs: 200 });
  assert.deepEqual([stopped.cursor, stopped.elapsedMs, stopped.playing], [0, 0, false]);
});

test('時間の経過: 800msのステップ1つぶんでカーソルが1つ進み、最後まで進むと止まる（§4）', () => {
  const { input, extracted } = prepare('qwerty', 'fjdk');
  const timing = defaultTiming();
  const schedule = playbackScheduleOf(extracted.analysis, input.geometry, timing);
  let state = startPlayback(initialPlaybackState(timing), 4);
  // 1フレームの経過時間は100msまで。800msを8フレームで進める
  for (let frame = 0; frame < 7; frame++) state = tickPlayback(state, 100, extracted.analysis, schedule);
  assert.equal(state.cursor, 0);
  state = tickPlayback(state, 100, extracted.analysis, schedule);
  assert.equal(state.cursor, 1);
  for (let frame = 0; frame < 8 * 3; frame++) state = tickPlayback(state, 100, extracted.analysis, schedule);
  assert.equal(state.cursor, 4);
  assert.equal(state.playing, false);
  assert.equal(state.elapsedMs, 0);
});

// ---------------------------------------------------------------------------
// 配列図に出す値
// ---------------------------------------------------------------------------

test('開始前: 打鍵の表示は無く、帰属は「開始前」、指はホームに居る', () => {
  const { frame } = frameAt('qwerty', 'fj', 0, SHOW_ALL_FIGURE);
  assert.equal(frame.total, 2);
  assert.equal(frame.currentText, '—');
  assert.equal(frame.layerLabel, '開始前');
  assert.equal(frame.activeKeys.size, 0);
  assert.equal(frame.fingerPositionKeys.get('f'), 'LI');
  assert.equal(frame.fingerPositionKeys.get('j'), 'RI');
  // 先読みN=3のうち、これから押すfとjが予定に出る
  assert.deepEqual([...frame.plannedOrders].sort(), [
    ['f', 1],
    ['j', 2],
  ]);
});

test('1打鍵目の後: 押したキー・履歴・予定・入力の履歴が揃う', () => {
  const { frame } = frameAt('qwerty', 'fjd', 1, SHOW_ALL_FIGURE);
  assert.equal(frame.cursor, 1);
  assert.deepEqual([...frame.activeKeys], ['f']);
  assert.equal(frame.typedText, 'f');
  assert.equal(frame.trailKeys.get('f'), 1);
  assert.deepEqual([...frame.trailOrders], [['f', 1]]);
  // これから押すキーは次のステップから数える
  assert.deepEqual([...frame.plannedOrders].sort(), [
    ['d', 2],
    ['j', 1],
  ]);
  assert.deepEqual(
    frame.inputPreview.map((segment) => [segment.text, segment.kind]),
    [
      ['f', 'current'],
      ['j', 'planned'],
      ['d', 'planned'],
    ],
  );
  assert.equal(frame.structureLabel, '—');
});

test('最後まで進んだ後でも値が求まり、カーソルは総数で止まる', () => {
  const { frame } = frameAt('qwerty', 'fj', 99, SHOW_ALL_FIGURE);
  assert.equal(frame.cursor, 2);
  assert.equal(frame.plannedKeys.size, 0);
  assert.deepEqual([...frame.activeKeys], ['j']);
});

test('指位置の準備時間: 0秒では打鍵の瞬間に切り替わり、準備時間があると次の押下より前に動く（§4.1）', () => {
  // f→v: 左人差し指がfからvへ動く。時間表では2打鍵目の終わりが押下の時刻。
  const before = frameAt('qwerty', 'fv', 1, { ...SHOW_ALL_FIGURE, fingerPreparationSeconds: 0 }, 790);
  assert.equal(before.frame.fingerPositionKeys.get('f'), 'LI');
  assert.equal(before.frame.fingerPositionKeys.has('v'), false);

  // 準備時間を長くしても、物理的に間に合わない間は動かない。経過0msではまだvに着かない
  const early = frameAt('qwerty', 'fv', 1, { ...SHOW_ALL_FIGURE, fingerPreparationSeconds: 5 }, 0);
  assert.equal(early.frame.fingerPositionKeys.has('v'), false);
  // 次の押下の時刻（2打鍵目の終わり）に着く。1打鍵目の終わりからの経過時間は、2打鍵目の表示時間
  const { input, extracted } = prepare('qwerty', 'fv');
  const schedule = playbackScheduleOf(extracted.analysis, input.geometry, defaultTiming());
  const arrived = frameAt('qwerty', 'fv', 1, { ...SHOW_ALL_FIGURE, fingerPreparationSeconds: 5 }, schedule[1].endMs - schedule[0].endMs);
  assert.equal(arrived.frame.fingerPositionKeys.get('v'), 'LI');
  assert.equal(arrived.frame.fingerPositionKeys.has('f'), false);
});

test('配列図の表示の既定値は、指の位置・押下予定キー・押下履歴・順番ラベルが非表示で、履歴は5ステップ', () => {
  assert.deepEqual(
    [
      DEFAULT_PLAYBACK_OPTIONS.showFingerPositions,
      DEFAULT_PLAYBACK_OPTIONS.showPlannedKeys,
      DEFAULT_PLAYBACK_OPTIONS.showTrail,
      DEFAULT_PLAYBACK_OPTIONS.showOrderLabels,
      DEFAULT_PLAYBACK_OPTIONS.trailSteps,
    ],
    [false, false, false, false, 5],
  );
  const { frame } = frameAt('qwerty', 'fjd', 1);
  assert.equal(frame.fingerPositionKeys.size, 0);
  assert.equal(frame.trailKeys.size, 0);
  assert.equal(frame.plannedKeys.size, 0);
  assert.equal(frame.plannedOrders.size, 0);
  assert.equal(frame.trailOrders.size, 0);
  // 押した瞬間のキーと入力の履歴は、この設定に関わらず出る
  assert.deepEqual([...frame.activeKeys], ['f']);
  assert.equal(frame.inputPreview.length, 3);
});

test('配列図の4つの切り替えは、それぞれ自分の表示だけを出し入れする', () => {
  const only = (key: keyof typeof SHOW_ALL_FIGURE) => frameAt('qwerty', 'fjd', 1, { [key]: true }).frame;
  const sizes = (frame: PlaybackFrame) => [
    frame.fingerPositionKeys.size > 0,
    frame.plannedKeys.size > 0,
    frame.trailKeys.size > 0,
    frame.plannedOrders.size + frame.trailOrders.size > 0,
  ];
  assert.deepEqual(sizes(only('showFingerPositions')), [true, false, false, false]);
  assert.deepEqual(sizes(only('showPlannedKeys')), [false, true, false, false]);
  assert.deepEqual(sizes(only('showTrail')), [false, false, true, false]);
  // 順番ラベルだけを出しても、ラベルを付ける先の予定キーも履歴も出ていないので何も出ない
  assert.deepEqual(sizes(only('showOrderLabels')), [false, false, false, false]);
  // 順番ラベルは、出ている表示にだけ付く
  const plannedWithOrders = frameAt('qwerty', 'fjd', 1, { showPlannedKeys: true, showOrderLabels: true }).frame;
  assert.deepEqual([...plannedWithOrders.plannedOrders].sort(), [
    ['d', 2],
    ['j', 1],
  ]);
  assert.equal(plannedWithOrders.trailOrders.size, 0);
  const trailWithOrders = frameAt('qwerty', 'fjd', 1, { showTrail: true, showOrderLabels: true }).frame;
  assert.deepEqual([...trailWithOrders.trailOrders], [['f', 1]]);
  assert.equal(trailWithOrders.plannedOrders.size, 0);
});

test('押下履歴を残すステップ数は、履歴が残る長さを決める', () => {
  const trailAt = (trailSteps: number) => [...frameAt('qwerty', 'fjdksl', 6, { showTrail: true, trailSteps }).frame.trailKeys.keys()].sort();
  assert.deepEqual(trailAt(1), ['l']);
  assert.deepEqual(trailAt(3), ['k', 'l', 's']);
  assert.equal(trailAt(5).length, 5);
  // 履歴を出さない間は、ステップ数を変えても何も出ない
  assert.equal(frameAt('qwerty', 'fjdksl', 6, { trailSteps: 20 }).frame.trailKeys.size, 0);
});

test('順番ラベルを出さなくても、ChainとArpeggioの順番は設定に従って出る', () => {
  const { frame } = frameAt('qwerty', 'asdf', 2, { showChain: true, showOrderLabels: false });
  assert.equal(frame.chainOrders.get('s'), 2);
});

test('配列図の表示の7項目は、既定と違う時だけURLに書き、読み戻すと同じ値になり、範囲外は捨てる', () => {
  const changed: PlaybackOptions = {
    ...DEFAULT_PLAYBACK_OPTIONS,
    showFingerPositions: true,
    showPlannedKeys: true,
    showRomajiInput: false,
    showRomajiPlan: false,
    showTrail: true,
    trailSteps: 12,
    showOrderLabels: true,
  };
  const params = playbackOptions.encodeOptionsToUrl(changed);
  assert.equal(params.size, 7);
  const diagnostics: never[] = [];
  const decoded = playbackOptions.decodeOptionsFromUrl(params, diagnostics);
  assert.deepEqual({ ...DEFAULT_PLAYBACK_OPTIONS, ...decoded.values }, changed);
  assert.deepEqual(diagnostics, []);
  for (const raw of ['0', '21', '2.5']) {
    const broken: unknown[] = [];
    const result = playbackOptions.decodeOptionsFromUrl(new URLSearchParams({ trailSteps: raw }), broken as never);
    assert.deepEqual(result.values, {}, raw);
    assert.equal(broken.length, 1, raw);
  }
});

test('同指移動の動的表示: 設定が真の時だけ、同じ指の移動元から移動先への動きが出る', () => {
  const off = frameAt('qwerty', 'fv', 2);
  assert.deepEqual(off.frame.motions, []);
  const on = frameAt('qwerty', 'fv', 2, { showSameFingerMotion: true });
  assert.equal(on.frame.motions.length, 1);
  assert.deepEqual([on.frame.motions[0].fromKey, on.frame.motions[0].toKey, on.frame.motions[0].kind], ['f', 'v', 'sameFinger']);
  // 動く長さはそのステップの表示時間で、1500msを超えない
  assert.ok(on.frame.motions[0].durationMs >= 150 && on.frame.motions[0].durationMs <= 1500);
});

test('Arpeggioの動的表示: 動きの種類はArpeggioの値になる', () => {
  // 条件: 配列qwerty・テキスト「asdf」。Arpeggioだけを出す
  const { frame } = frameAt('qwerty', 'asdf', 2, { showArpeggio: true });
  assert.ok(frame.motions.length > 0);
  assert.ok(frame.motions.every((motion) => motion.kind === 'arpeggio'));
});

test('ChainとArpeggioの両方に入るキーは、動くキーが1つでArpeggioの値になる', () => {
  // 条件: 配列qwerty・テキスト「asdf」。4打鍵がChainにもArpeggioにも入る
  for (const cursor of [2, 3, 4]) {
    const chainOnly = frameAt('qwerty', 'asdf', cursor, { showChain: true }).frame.motions;
    const arpeggioOnly = frameAt('qwerty', 'asdf', cursor, { showArpeggio: true }).frame.motions;
    const both = frameAt('qwerty', 'asdf', cursor, { showChain: true, showArpeggio: true }).frame.motions;
    assert.ok(chainOnly.length > 0 && arpeggioOnly.length > 0, `cursor ${cursor}`);
    const targets = both.map((motion) => motion.toKey);
    assert.equal(new Set(targets).size, targets.length, `行き先ごとに動くキーは1つ（${cursor}打目）`);
    assert.deepEqual(both, arpeggioOnly, `Arpeggioの動き（出発位置を含む）だけが残る（${cursor}打目）`);
  }
});

test('Chainの動的表示: 設定が真の時だけ、区間の中の順番が出る', () => {
  // 同じ手の指を内側へ4打。構造解析がChainを作る並びを使う。
  const text = 'asdf';
  const { extracted } = frameAt('qwerty', text, 0);
  assert.ok(extracted.analysis.chains.length > 0, 'この並びはChainになる');
  const off = frameAt('qwerty', text, 2);
  assert.equal(off.frame.chainOrders.size, 0);
  const on = frameAt('qwerty', text, 2, { showChain: true });
  assert.ok(on.frame.chainOrders.size > 0);
  assert.equal(on.frame.chainOrders.get('s'), 2);
});

test('ローマ字入力では、今の入力単位（かな）と、その予定綴りと打鍵済みの綴りが出る', () => {
  // 「か」はkとaの2打鍵。1打鍵目の後は「k」を打ち終え、予定綴りは「ka」
  const { frame } = frameAt('qwerty', 'か', 1, {}, 0, 'ja');
  assert.equal(frame.isRomaji, true);
  assert.equal(frame.kanaText, 'か');
  assert.equal(frame.plannedText, 'ka');
  assert.equal(frame.typedText, 'k');
});

test('今のかなの残りキーは、既定で出て、今の単位のまだ押していないキーだけを、これから押すキーとは独立に出す', () => {
  assert.equal(DEFAULT_PLAYBACK_OPTIONS.showRomajiPlan, true);
  // 「か」(ka)の1打鍵目の後は、aだけが残る
  const base = frameAt('qwerty', 'か', 1, {}, 0, 'ja').frame;
  assert.deepEqual([...base.romajiPlannedKeys.keys()], ['a']);
  assert.equal(base.plannedKeys.size, 0);
  // 単位を打ち終えた位置と再生位置0では、残りが無いので出ない
  assert.equal(frameAt('qwerty', 'か', 2, {}, 0, 'ja').frame.romajiPlannedKeys.size, 0);
  assert.equal(frameAt('qwerty', 'か', 0, {}, 0, 'ja').frame.romajiPlannedKeys.size, 0);
  // 押下予定キーを出しても、今のかなの残りキーは変わらない
  const withPlanned = frameAt('qwerty', 'か', 1, { showPlannedKeys: true }, 0, 'ja').frame;
  assert.deepEqual([...withPlanned.romajiPlannedKeys], [...base.romajiPlannedKeys]);
  assert.deepEqual([...withPlanned.plannedKeys.keys()], ['a']);
  // 切ると、今のかなの残りキーだけが消え、他の表示は変わらない
  const off = frameAt('qwerty', 'か', 1, { showRomajiPlan: false, showPlannedKeys: true }, 0, 'ja').frame;
  assert.equal(off.romajiPlannedKeys.size, 0);
  assert.deepEqual([...off.plannedKeys], [...withPlanned.plannedKeys]);
  // ローマ字の規則を持たない配列では出ない
  assert.equal(frameAt('qwerty', 'fjd', 1).frame.romajiPlannedKeys.size, 0);
});

test('順番ラベルが表示の時、今のかなの残りキーにも順番が付き、両方に入るキーでは押下予定キーと同じ番号になる', () => {
  const both = frameAt('qwerty', 'か', 1, { showPlannedKeys: true, showOrderLabels: true }, 0, 'ja').frame;
  assert.deepEqual([...both.romajiPlannedOrders], [['a', 1]]);
  assert.equal(both.plannedOrders.get('a'), both.romajiPlannedOrders.get('a'));
  const romajiOnly = frameAt('qwerty', 'か', 1, { showOrderLabels: true }, 0, 'ja').frame;
  assert.deepEqual([...romajiOnly.romajiPlannedOrders], [['a', 1]]);
  assert.equal(romajiOnly.plannedOrders.size, 0);
  // 順番ラベルを出さない間は付かない
  assert.equal(frameAt('qwerty', 'か', 1, {}, 0, 'ja').frame.romajiPlannedOrders.size, 0);
});

test('入力の行のローマ字表示は、ローマ字の配列で既定で出て、切るとかなの入力の行のまま変わらない', () => {
  assert.equal(DEFAULT_PLAYBACK_OPTIONS.showRomajiInput, true);
  const render = (segments: readonly { kind: string; kana: string; romaji?: { typed: string; remaining: string } }[] | undefined) =>
    segments?.map((s) => `${s.kind}:${s.romaji === undefined ? s.kana : `${s.romaji.typed}|${s.romaji.remaining}`}`);
  // 条件: 配列qwerty・既定のローマ字規則・テキスト「って」。「って」は1つの単位で、綴りはtte
  const on = frameAt('qwerty', 'って', 1, {}, 0, 'ja').frame;
  assert.deepEqual(render(on.romajiInputPreview), ['current:t|te']);
  assert.equal(on.kanaText, 'って');
  assert.deepEqual(render(frameAt('qwerty', 'って', 3, {}, 0, 'ja').frame.romajiInputPreview), ['current:って']);
  // 切ると入力の行の材料は出さず、かなの入力の行と状態の行の値は、入れ替える前と同じ
  const off = frameAt('qwerty', 'って', 1, { showRomajiInput: false }, 0, 'ja').frame;
  assert.equal(off.romajiInputPreview, undefined);
  assert.deepEqual(off.inputPreview, on.inputPreview);
  assert.equal(off.typedText, 't');
  assert.equal(off.plannedText, 'tte');
  // 配列図の緑の塗りは、設定によらず同じ
  assert.deepEqual([...off.romajiPlannedKeys], [...on.romajiPlannedKeys]);
  // ローマ字の規則を持たない配列では、設定によらず出ない
  assert.equal(frameAt('qwerty', 'fjd', 1).frame.romajiInputPreview, undefined);
  assert.equal(frameAt('qwerty', 'fjd', 1, { showRomajiInput: false }).frame.romajiInputPreview, undefined);
});

test('複数の指が担当するキー: 押した指を持ち、指の位置は基本の指ではなく実際に押した指のキーに出る', () => {
  const written = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'fingerAssignmentId', 'qwerty-optimized');
  assert.ok(written.ok);
  if (!written.ok) return;
  const input = resolve('qwerty', 'mn', 'en', written.overrides);
  const cache = createEngineCache();
  const { trace } = cache.getTrace(input);
  assert.ok(trace);
  const extracted = cache.getExtraction(input, playbackDefinition, DEFAULT_PLAYBACK_OPTIONS).extracted;
  const timing = defaultTiming();
  const frame = derivePlaybackFrame({
    layout: input.layout,
    geometry: input.geometry,
    trace,
    analysis: extracted.analysis,
    windowSize: extracted.windowSize,
    schedule: playbackScheduleOf(extracted.analysis, input.geometry, timing),
    timing,
    options: { ...DEFAULT_PLAYBACK_OPTIONS, ...SHOW_ALL_FIGURE },
    cursor: 1,
    elapsedMs: 0,
  });
  // mの基本の指は右人差し指だが、この入力では右親指が押す
  assert.equal(input.geometry.keys.get('m')?.finger, 'RI');
  assert.deepEqual(frame.pressedFingers, ['RT']);
  assert.equal(frame.fingerPositionKeys.get('m'), 'RT');
});

test('押した指: 基本の指だけが担当するキーでは、基本の指が出る', () => {
  const { frame } = frameAt('qwerty', 'fj', 1, SHOW_ALL_FIGURE);
  assert.deepEqual(frame.pressedFingers, ['LI']);
});

// ---------------------------------------------------------------------------
// 保存値の部分ごとに使うかの設定（spec/playback-timing.md §2.1・§2.2）
// ---------------------------------------------------------------------------

const PAIR_KEY = sameHandFingerPairKey('LI', 'LM') ?? '';
const DIRECTED_KEY = sameHandDirectedFingerPairKey('LI', 'LM') ?? '';

/** 通常速度5（200ms）に、方向別・組ごと・向きと組ごと・指ごとの値・両方の上乗せを足した保存値。 */
const FULL_CALIBRATION: PlaybackCalibration = {
  ...CALIBRATION,
  actionsPerSecondByDirection: { 'L→R': 10, 'R→L': 20 },
  sameHandDifferentFingerActionsPerSecondByPair: { [PAIR_KEY]: 10 },
  sameHandDifferentFingerActionsPerDirectedPair: { [DIRECTED_KEY]: 20 },
  fingerRepeatMs: { LI: 100 },
  fingerMoveMsPerUnit: { LI: 400 },
  keystrokeOverheadMs: { other: 60, sfb: 30 },
  simultaneousOverheadMs: { thumb: 50 },
};

test('部分の設定: 全部使う設定は、保存値をそのまま時間の計算に渡す', () => {
  const timing = timingConditionsOf(DEFAULT_PLAYBACK_OPTIONS, { ...DEFAULT_EXTRACTION_ASSETS, personalSpeed: FULL_CALIBRATION });
  assert.deepEqual(timing.calibration, FULL_CALIBRATION);
});

test('部分の設定: 異手の方向別の速度を使わない時、異手のステップは通常速度の時間になる', () => {
  // 条件: 配列qwerty・テキスト「fjdk」（毎ステップ異手）。通常速度200ms、L→Rは100ms、R→Lは50ms。最初のステップは通常速度。
  const input = resolve('qwerty', 'fjdk', 'en', EMPTY_SETTINGS_OVERRIDES, FULL_CALIBRATION);
  const base = { useKeystrokeOverhead: false };
  assert.deepEqual(STEP_ENDS(extractionOf(input, base)), [200, 300, 350, 450]);
  assert.deepEqual(STEP_ENDS(extractionOf(input, { ...base, useCrossHandDirection: false })), [200, 400, 600, 800]);
});

test('部分の設定: 同手・別指の速度は、使う段を組と向きごと・組ごと・代表値だけから選ぶ', () => {
  // 条件: 配列qwerty・テキスト「fd」（LIからLMへ）。向きと組ごと20、組ごと10、代表値5アクション/秒。
  const input = resolve('qwerty', 'fd', 'en', EMPTY_SETTINGS_OVERRIDES, FULL_CALIBRATION);
  const base = { useKeystrokeOverhead: false };
  assert.deepEqual(STEP_ENDS(extractionOf(input, base)), [200, 250]);
  assert.deepEqual(STEP_ENDS(extractionOf(input, { ...base, sameHandSpeed: 'pair' })), [200, 300]);
  assert.deepEqual(STEP_ENDS(extractionOf(input, { ...base, sameHandSpeed: 'representative' })), [200, 400]);
  // 順序なしの組の値を持たない保存値の「組ごと」は代表値になる
  const noPair = resolve('qwerty', 'fd', 'en', EMPTY_SETTINGS_OVERRIDES, {
    ...FULL_CALIBRATION,
    sameHandDifferentFingerActionsPerSecondByPair: {},
  });
  assert.deepEqual(STEP_ENDS(extractionOf(noPair, { ...base, sameHandSpeed: 'pair' })), [200, 400]);
});

test('部分の設定: 指ごとの値を使わない時、全部の指に代表値の続け打ちと移動の時間を使う', () => {
  // 条件: 配列qwerty・テキスト「fv」（同指連続）。allFingerMovementDelayは偽で、sameFingerDelayは真。
  // 指ごとの値はLIがr=100・m=400、代表値はr=200・m=100。移動の時間はr+距離×m。
  const input = resolve('qwerty', 'fv', 'en', EMPTY_SETTINGS_OVERRIDES, FULL_CALIBRATION);
  const base = { useKeystrokeOverhead: false, allFingerMovementDelay: false };
  const used = extractionOf(input, base);
  const press = used.analysis.strokes[1].presses.find((p) => p.sfb);
  assert.ok(press);
  assert.equal(press.finger, 'LI');
  assert.ok(press.distance > 0.5);
  assert.deepEqual(STEP_ENDS(used), [200, 200 + Math.max(200, 100 + press.distance * 400)]);
  const unused = extractionOf(input, { ...base, useFingerValues: false });
  assert.deepEqual(STEP_ENDS(unused), [200, 200 + Math.max(200, 200 + press.distance * 100)]);
});

test('部分の設定: 打鍵の上乗せを使わない時、上乗せ無しで、同指連続はsを持たない式になる', () => {
  // 条件: 配列qwerty・allFingerMovementDelayは偽。「その他」の上乗せ60ms、同指連続の差s=30ms。
  const fjdk = resolve('qwerty', 'fjdk', 'en', EMPTY_SETTINGS_OVERRIDES, FULL_CALIBRATION);
  const base = { useCrossHandDirection: false, allFingerMovementDelay: false };
  assert.deepEqual(STEP_ENDS(extractionOf(fjdk, base)), [260, 520, 780, 1040]);
  assert.deepEqual(STEP_ENDS(extractionOf(fjdk, { ...base, useKeystrokeOverhead: false })), [200, 400, 600, 800]);
  // 同指連続: 使う時はmax(normalMs, 移動)+s、使わない時はmax(normalMs+o, 移動)でo=0
  const fv = resolve('qwerty', 'fv', 'en', EMPTY_SETTINGS_OVERRIDES, FULL_CALIBRATION);
  const used = extractionOf(fv, base);
  const press = used.analysis.strokes[1].presses.find((p) => p.sfb);
  assert.ok(press);
  const movement = 100 + press.distance * 400;
  assert.deepEqual(STEP_ENDS(used), [260, 260 + Math.max(200, movement) + 30]);
  const unused = extractionOf(fv, { ...base, useKeystrokeOverhead: false });
  assert.deepEqual(STEP_ENDS(unused), [200, 200 + Math.max(200, movement)]);
});

test('部分の設定: 同時押しの上乗せを使わない時、同時押しのステップに足さない', () => {
  // 親指を含む同時押しのストローク。使う時はthumbの50ms、使わない時は0。
  const thumbStroke = {
    presses: [
      { finger: 'RT' as const, keys: [] },
      { finger: 'RI' as const, keys: [] },
    ],
  };
  const parts = { ...DEFAULT_PLAYBACK_OPTIONS, useSimultaneousOverhead: false };
  assert.equal(playbackSimultaneousOverheadMs(thumbStroke, FULL_CALIBRATION), 50);
  assert.equal(playbackSimultaneousOverheadMs(thumbStroke, calibrationWithParts(FULL_CALIBRATION, parts)), 0);
  assert.equal(calibrationWithParts(FULL_CALIBRATION, parts).simultaneousOverheadMs, undefined);
});

test('部分の設定: 外す項目は設定ごとに別で、他の項目は残る', () => {
  const keys = (calibration: PlaybackCalibration) => Object.keys(calibration).sort();
  const full = keys(FULL_CALIBRATION);
  const without = (...omit: string[]) => full.filter((key) => !omit.includes(key));
  const parts = DEFAULT_PLAYBACK_OPTIONS;
  assert.deepEqual(keys(calibrationWithParts(FULL_CALIBRATION, { ...parts, useCrossHandDirection: false })), without('actionsPerSecondByDirection'));
  assert.deepEqual(
    keys(calibrationWithParts(FULL_CALIBRATION, { ...parts, sameHandSpeed: 'pair' })),
    without('sameHandDifferentFingerActionsPerDirectedPair'),
  );
  const representative = calibrationWithParts(FULL_CALIBRATION, { ...parts, sameHandSpeed: 'representative' });
  assert.deepEqual(keys(representative), without('sameHandDifferentFingerActionsPerDirectedPair'));
  assert.deepEqual(representative.sameHandDifferentFingerActionsPerSecondByPair, {});
  const fingers = calibrationWithParts(FULL_CALIBRATION, { ...parts, useFingerValues: false });
  assert.deepEqual([fingers.fingerRepeatMs, fingers.fingerMoveMsPerUnit], [{}, {}]);
  assert.deepEqual(keys(fingers), full);
  assert.deepEqual(keys(calibrationWithParts(FULL_CALIBRATION, { ...parts, useKeystrokeOverhead: false })), without('keystrokeOverheadMs'));
});

test('部分の設定の示し方: 外す項目を保存値が持つ時だけ、既定と違う設定を名前と値で示す', () => {
  const changes = (options: Partial<PlaybackOptions>, saved: PlaybackCalibration | undefined) =>
    calibrationPartChanges({ ...DEFAULT_PLAYBACK_OPTIONS, ...options }, saved);
  assert.deepEqual(changes({}, FULL_CALIBRATION), []);
  assert.deepEqual(changes({ sameHandSpeed: 'pair' }, FULL_CALIBRATION), ['同手・別指の速度: 組ごと']);
  assert.deepEqual(changes({ sameHandSpeed: 'representative' }, FULL_CALIBRATION), ['同手・別指の速度: 代表値だけ']);
  assert.deepEqual(changes({ useCrossHandDirection: false }, FULL_CALIBRATION), ['異手の方向別の速度を使わない']);
  assert.deepEqual(changes({ useFingerValues: false }, FULL_CALIBRATION), ['指ごとの値を使わない']);
  assert.deepEqual(changes({ useSimultaneousOverhead: false }, FULL_CALIBRATION), ['同時押しの上乗せを使わない']);
  assert.deepEqual(changes({ useKeystrokeOverhead: false }, FULL_CALIBRATION), ['打鍵の上乗せを使わない']);
  // 個人速度で計算していない時は示さない
  const all = {
    sameHandSpeed: 'representative',
    useCrossHandDirection: false,
    useFingerValues: false,
    useSimultaneousOverhead: false,
    useKeystrokeOverhead: false,
  } as const;
  assert.deepEqual(changes({ ...all, applyPersonalSpeed: false }, FULL_CALIBRATION), []);
  assert.deepEqual(changes(all, undefined), []);
  // 保存値が外す項目を持たない時は示さない
  const pairOnly = { ...CALIBRATION, sameHandDifferentFingerActionsPerSecondByPair: { [PAIR_KEY]: 10 } };
  assert.deepEqual(changes(all, CALIBRATION), []);
  assert.deepEqual(changes({ sameHandSpeed: 'pair' }, pairOnly), []);
  assert.deepEqual(changes({ sameHandSpeed: 'representative' }, pairOnly), ['同手・別指の速度: 代表値だけ']);
  assert.deepEqual(changes({ useCrossHandDirection: false }, { ...CALIBRATION, actionsPerSecondByDirection: {} }), []);
  assert.deepEqual(changes({ useFingerValues: false }, CALIBRATION), []);
  // 上乗せは、今の「足している」の判定が足していないとする時は示さない
  const zero = { ...CALIBRATION, keystrokeOverheadMs: { other: 0 }, simultaneousOverheadMs: { thumb: 0 } };
  assert.deepEqual(changes({ useKeystrokeOverhead: false, useSimultaneousOverhead: false }, zero), []);
  const sfbOnly = { ...CALIBRATION, keystrokeOverheadMs: { sfb: 30 } };
  assert.deepEqual(changes({ useKeystrokeOverhead: false, sameFingerDelay: false }, sfbOnly), []);
  assert.deepEqual(changes({ useKeystrokeOverhead: false }, sfbOnly), ['打鍵の上乗せを使わない']);
});

test('部分の設定の示し方: 抽出の結果から、ペインの知らせに名前と値が載り、上乗せを足している表示は出ない', () => {
  const input = resolve('qwerty', 'fjdk', 'en', EMPTY_SETTINGS_OVERRIDES, FULL_CALIBRATION);
  const notesOf = (options: Partial<PlaybackOptions>) => {
    const merged = { ...DEFAULT_PLAYBACK_OPTIONS, ...options };
    const extracted = extractionOf(input, options);
    return playbackCalculationNotes(merged, extracted.personalSpeedUse, extracted.timing.calibration, extracted.savedCalibration, extracted.overheadUse);
  };
  const defaults = notesOf({});
  assert.deepEqual(defaults.changes, []);
  assert.equal(defaults.keystrokeOverheadInUse, true);
  // 「fjdk」は同時押しのストロークを持たないので、同時押しの上乗せを保存していても足していない
  assert.equal(defaults.simultaneousOverheadInUse, false);
  const off = notesOf({ useKeystrokeOverhead: false, useSimultaneousOverhead: false });
  assert.deepEqual(off.changes, ['同時押しの上乗せを使わない', '打鍵の上乗せを使わない']);
  assert.equal(off.keystrokeOverheadInUse, false);
  assert.equal(off.simultaneousOverheadInUse, false);
  // 個人速度を適用しない時は示さない
  assert.deepEqual(notesOf({ applyPersonalSpeed: false, useFingerValues: false }).changes, ['個人速度を適用しない']);
});

test('既定と違う計算の知らせ: 同時押しの上乗せは、再生するステップに同時押しのストロークがある時だけ足していると示す', () => {
  // 条件: 保存値は親指・両手・片手の同時押しの上乗せ50msを持つ。既定の解析設定。
  // QWERTYの「fjdk」は単打だけ。NICOLAの「が」は同時押しのストローク（親指との同時押し）を含む。
  const saved = { ...CALIBRATION, simultaneousOverheadMs: { thumb: 50, 'both-hands': 50, 'one-hand': 50 } };
  const simultaneousOf = (layoutId: string, text: string, calibration: PlaybackCalibration = saved) => {
    const extracted = extractionOf(resolve(layoutId, text, 'ja', EMPTY_SETTINGS_OVERRIDES, calibration));
    return {
      hasSimultaneousStroke: extracted.analysis.strokes.some((stroke) => strokeSimultaneousKind(stroke) !== undefined),
      notes: playbackCalculationNotes(
        DEFAULT_PLAYBACK_OPTIONS,
        extracted.personalSpeedUse,
        extracted.timing.calibration,
        extracted.savedCalibration,
        extracted.overheadUse,
      ),
    };
  };
  const qwerty = simultaneousOf('qwerty', 'fjdk');
  assert.equal(qwerty.hasSimultaneousStroke, false);
  assert.equal(qwerty.notes.simultaneousOverheadInUse, false);
  const nicola = simultaneousOf('nicola', 'が');
  assert.equal(nicola.hasSimultaneousStroke, true);
  assert.equal(nicola.notes.simultaneousOverheadInUse, true);
  // 同時押しのストロークがあっても、そのストロークの分け方の値が0なら足していない
  const zero = simultaneousOf('nicola', 'が', { ...CALIBRATION, simultaneousOverheadMs: { thumb: 0, 'both-hands': 0, 'one-hand': 0 } });
  assert.equal(zero.notes.simultaneousOverheadInUse, false);
  // 別の分け方の値だけを持つ時は、代わりに使わないので足していない
  const otherKind = simultaneousOf('nicola', 'が', { ...CALIBRATION, simultaneousOverheadMs: { thumb: 0, 'one-hand': 50 } });
  assert.equal(otherKind.hasSimultaneousStroke, true);
  assert.equal(otherKind.notes.simultaneousOverheadInUse, false);
});

test('既定と違う計算の知らせ: 打鍵の上乗せは、再生するステップに入る種類の値が0でない時だけ足していると示す', () => {
  // 条件: 配列qwerty・既定の解析設定。「fjdk」は同指連続を持たず、全ステップが「その他」。「edc」は同じ指で違う位置を続けて打つ（同指連続）。
  const notesOf = (
    text: string,
    keystrokeOverheadMs: NonNullable<PlaybackCalibration['keystrokeOverheadMs']>,
    options: Partial<PlaybackOptions> = {},
  ) => {
    const extracted = extractionOf(resolve('qwerty', text, 'en', EMPTY_SETTINGS_OVERRIDES, { ...CALIBRATION, keystrokeOverheadMs }), options);
    return playbackCalculationNotes(
      { ...DEFAULT_PLAYBACK_OPTIONS, ...options },
      extracted.personalSpeedUse,
      extracted.timing.calibration,
      extracted.savedCalibration,
      extracted.overheadUse,
    ).keystrokeOverheadInUse;
  };
  assert.ok(extractionOf(resolve('qwerty', 'edc')).analysis.strokes.some((stroke) => stroke.presses.some((press) => press.sfb)));
  // 同指連続の値だけを持ち、再生に同指連続のステップが無い時は足していない
  assert.equal(notesOf('fjdk', { sfb: 40 }), false);
  assert.equal(notesOf('edc', { sfb: 40 }), true);
  // 同指連続のステップが無い再生でも、入る種類の値が0でなければ足している
  assert.equal(notesOf('fjdk', { other: 40 }), true);
  // 入る種類の値が0で、他の種類だけが0でない時は足していない（種類をまたいで判定しない）
  assert.equal(notesOf('fjdk', { other: 0, chain: 40, arpeggio: 40 }), false);
  // 続け打ちの値は、続け打ちのステップがある時だけ入る
  assert.equal(notesOf('fjdk', { repeat: 40 }), false);
  assert.equal(notesOf('ff', { repeat: 40 }), true);
  // 同じ指の移動時間を考慮しない時、同指連続のステップは構造の種類の値で判定する
  assert.equal(notesOf('edc', { sfb: 40 }, { sameFingerDelay: false }), false);
  assert.equal(notesOf('edc', { sfb: 40, other: 10 }, { sameFingerDelay: false }), true);
});

// ---------------------------------------------------------------------------
// 読点・句点の前後の待機（spec/playback-timing.md §3.9）
// ---------------------------------------------------------------------------

const WAIT_OPTIONS: Partial<PlaybackOptions> = { commaBeforeMs: 300, commaAfterMs: 200, periodBeforeMs: 100, periodAfterMs: 500 };

/** 日本語のテキストで、全角の `，` `．` を評価に渡す（記号をすべて残す）。qwertyはこの2文字を打てずに読み飛ばす。 */
function keepSymbolsOverrides(): SettingsCascadeOverrides {
  const written = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'keepSymbols', true);
  assert.ok(written.ok);
  if (!written.ok) throw new Error('unreachable');
  return written.overrides;
}

/** ステップごとの打鍵の時間（表示時間から待機を除いた時間）。 */
const typingMsOf = (extracted: PlaybackExtracted) => extracted.schedule.map((step) => step.endMs - step.startMs - (step.waitMs ?? 0));

test('待機: 待機が0の時、時間表・総時間は待機を持たない時間表と一致する', () => {
  // 条件: 配列qwerty・ローマ字（訓令式）・物理配列row-staggered・既定の解析設定（待機は4つとも0）・日本語のテキスト。
  const input = resolve('qwerty', 'あ、い。う', 'ja');
  const extracted = extractionOf(input);
  assert.deepEqual(extracted.schedule, playbackScheduleOf(extracted.analysis, input.geometry, defaultTiming()));
  assert.ok(extracted.schedule.every((step) => step.waitMs === undefined));
  const last = extracted.schedule[extracted.schedule.length - 1];
  assert.deepEqual(extracted.timeTotals, { typingMs: last.endMs, totalMs: last.endMs });
});

test('待機: 打てる読点・句点の前の待機は入力単位の最初のステップの前、後の待機は最後のステップの後に入る', () => {
  // 条件: 配列qwerty・ローマ字・テキスト「あ、い。」（a , i . の4打鍵）・待機は読点 前300/後200、句点 前100/後500。
  const input = resolve('qwerty', 'あ、い。', 'ja');
  const plain = extractionOf(input);
  const waited = extractionOf(input, WAIT_OPTIONS);
  assert.deepEqual(
    waited.schedule.map((step) => step.waitMs ?? 0),
    [0, 300, 200, 100],
  );
  // 句点の後の待機は最後のステップの後なので、どのステップにも入らず総時間にだけ入る
  assert.equal(waited.timeTotals.typingMs, plain.timeTotals.typingMs);
  assert.equal(waited.timeTotals.totalMs, plain.timeTotals.totalMs + 300 + 200 + 100 + 500);
  // 待機は挿入だけで、各ステップの打鍵の時間は変わらない
  assert.deepEqual(typingMsOf(waited), typingMsOf(plain));
  for (let index = 1; index < waited.schedule.length; index++) {
    assert.equal(waited.schedule[index].startMs, waited.schedule[index - 1].endMs);
  }
});

test('待機: 配列が打てない読点・句点でも、テキストのその位置に前後の待機を足す', () => {
  // 条件: 配列qwerty・ローマ字・記号をすべて残す・テキスト「あ，い．う」。qwertyは全角の「，」「．」を打てず、a・i・uの3打鍵だけが残る。
  const overrides = keepSymbolsOverrides();
  const input = resolve('qwerty', 'あ，い．う', 'ja', overrides);
  assert.equal(createEngineCache().getTrace(input).trace.skipped, 2);
  const plain = extractionOf(input);
  const waited = extractionOf(input, WAIT_OPTIONS);
  assert.equal(waited.schedule.length, 3);
  // 「，」は あ と い の間（前300+後200）、「．」は い と う の間（前100+後500）
  assert.deepEqual(
    waited.schedule.map((step) => step.waitMs ?? 0),
    [0, 500, 600],
  );
  assert.equal(waited.timeTotals.totalMs, plain.timeTotals.totalMs + 1100);
  // 打てる配列と打てない配列で、同じテキストの待機の合計が同じになる
  const typable = extractionOf(resolve('qwerty', 'あ、い。う', 'ja'), WAIT_OPTIONS);
  const typableWait = typable.timeTotals.totalMs - typable.timeTotals.typingMs;
  assert.equal(waited.timeTotals.totalMs - waited.timeTotals.typingMs, typableWait);
});

test('待機: 文末の打てない句点の待機は、総時間にだけ入る', () => {
  // 条件: 配列qwerty・ローマ字・記号をすべて残す・テキスト「あい．」。
  const input = resolve('qwerty', 'あい．', 'ja', keepSymbolsOverrides());
  const plain = extractionOf(input);
  const waited = extractionOf(input, { periodBeforeMs: 100, periodAfterMs: 500 });
  assert.ok(waited.schedule.every((step) => step.waitMs === undefined));
  assert.equal(waited.timeTotals.typingMs, plain.timeTotals.typingMs);
  assert.equal(waited.timeTotals.totalMs, plain.timeTotals.typingMs + 600);
});

test('待機: 打鍵の時間は待機の有無で変わらない（全指の移動時間で律速する設定でも）', () => {
  // 条件: 配列qwerty・ローマ字・テキストは同指連続・続け打ちを含む。待機は挿入だけなので、指が待機の間に動けた分の短縮は起きない。
  for (const text of ['ああ、ああ。', 'えでc、ふぇ。ふぇ', 'ああ、ああ。ええ、']) {
    const input = resolve('qwerty', text, 'ja');
    for (const allFingerMovementDelay of [true, false]) {
      const plain = extractionOf(input, { allFingerMovementDelay });
      const waited = extractionOf(input, { ...WAIT_OPTIONS, allFingerMovementDelay });
      assert.deepEqual(typingMsOf(waited), typingMsOf(plain), text);
    }
  }
});

/** 確定scheduleの各ステップの表示時間（待機を含む）[ms]。 */
const displayMsOf = (extracted: PlaybackExtracted) => extracted.schedule.map((step) => step.endMs - step.startMs);

test('待機: SMAのアクション/秒は、窓のステップの表示時間（待機を含む）の合計で求める', () => {
  // 条件: 配列qwerty・ローマ字・テキスト「あ、い。う、ええ。」・SMA窓幅3・待機は4つとも0でない。
  const input = resolve('qwerty', 'あ、い。う、ええ。', 'ja');
  const average = { rateAverage: 'sma', rateWindow: 3 } as const;
  const plain = extractionOf(input, average);
  const waited = extractionOf(input, { ...average, ...WAIT_OPTIONS });
  const durations = displayMsOf(waited);
  assert.ok(durations.some((ms, index) => ms > displayMsOf(plain)[index]));
  for (const point of waited.rateChart) {
    if (point.actionsPerSecond === undefined) continue;
    const window = durations.slice(Math.max(0, point.cursor - 3), point.cursor);
    const expected = (window.length * 1000) / window.reduce((sum, ms) => sum + ms, 0);
    assert.ok(Math.abs(point.actionsPerSecond - expected) < 1e-9, `cursor ${point.cursor}`);
  }
  // 待機の分だけ、待機を含む窓の値は待機0の時より下がる
  const lower = waited.rateChart.filter((point, index) => (point.actionsPerSecond ?? Infinity) < (plain.rateChart[index].actionsPerSecond ?? -Infinity));
  assert.ok(lower.length > 0);
  for (const point of waited.rateChart) {
    const base = plain.rateChart.find((candidate) => candidate.cursor === point.cursor);
    if (point.actionsPerSecond !== undefined && base?.actionsPerSecond !== undefined) assert.ok(point.actionsPerSecond <= base.actionsPerSecond + 1e-9);
  }
});

test('待機: EWMAは待機を含む表示時間で減衰し、待機が複数打鍵のかなの先頭に付くとかなの値が大きく下がる', () => {
  // 条件: 配列qwerty・ローマ字・テキスト「あ、かあ」・EWMA半減時間1秒・読点の後の待機だけ2000ms。
  // 「か」はk・aの2打鍵で、待機は先頭のkの表示時間に付く。
  const input = resolve('qwerty', 'あ、かあ', 'ja');
  const average = { rateAverage: 'ewma', rateHalfLifeSeconds: 1 } as const;
  const plain = extractionOf(input, average);
  const waited = extractionOf(input, { ...average, commaAfterMs: 2000 });
  const waitedStep = waited.schedule.findIndex((step) => (step.waitMs ?? 0) > 0);
  assert.equal(waited.schedule[waitedStep].waitMs, 2000);
  const at = (extracted: PlaybackExtracted, cursor: number) => extracted.rateChart.find((point) => point.cursor === cursor);
  // 待機のあるステップを打ち終えた時、待機分の減衰が掛かる
  const before = at(waited, waitedStep);
  const after = at(waited, waitedStep + 1);
  const plainAfter = at(plain, waitedStep + 1);
  assert.ok(before?.kanaPerSecond !== undefined && after?.kanaPerSecond !== undefined && plainAfter?.kanaPerSecond !== undefined);
  const durationMs = displayMsOf(waited)[waitedStep];
  assert.ok(durationMs >= 2000);
  const decay = 2 ** (-durationMs / 1000);
  assert.ok(Math.abs(after.kanaPerSecond - before.kanaPerSecond * decay) < 1e-9);
  assert.ok(after.kanaPerSecond < plainAfter.kanaPerSecond);
  // 待機を含む表示時間の分だけアクション/秒の瞬時値も下がる
  assert.ok((after.actionsPerSecond ?? 0) < (plainAfter.actionsPerSecond ?? 0));
});

test('待機: 待機が全部0なら、速度の推移は待機を足さない時と同じ値になる', () => {
  // 条件: 配列qwerty・ローマ字・テキスト「あ、い。う、ええ。」・SMA窓幅3とEWMA半減時間1秒・待機は4つとも0。
  const input = resolve('qwerty', 'あ、い。う、ええ。', 'ja');
  for (const average of [
    { rateAverage: 'sma', rateWindow: 3 },
    { rateAverage: 'ewma', rateHalfLifeSeconds: 1 },
  ] as const) {
    const plain = extractionOf(input, average);
    const zero = extractionOf(input, { ...average, commaBeforeMs: 0, commaAfterMs: 0, periodBeforeMs: 0, periodAfterMs: 0 });
    assert.deepEqual(zero.rateChart, plain.rateChart);
  }
});

test('待機: 最後のステップより後の待機は、速度の推移に入らない', () => {
  // 条件: 配列qwerty・ローマ字・テキスト「あい。」・句点の後の待機だけ1000ms・SMA窓幅3とEWMA半減時間1秒。
  const input = resolve('qwerty', 'あい。', 'ja');
  for (const average of [
    { rateAverage: 'sma', rateWindow: 3 },
    { rateAverage: 'ewma', rateHalfLifeSeconds: 1 },
  ] as const) {
    const plain = extractionOf(input, average);
    const waited = extractionOf(input, { ...average, periodAfterMs: 1000 });
    assert.ok(waited.timeTotals.totalMs > plain.timeTotals.totalMs);
    assert.deepEqual(waited.rateChart, plain.rateChart);
  }
});

test('待機: 既定のサンプルの長いテキストでも、打鍵時間は待機0の時と一致し、速度の推移は待機の分だけ下がる', () => {
  // 条件: 組み込みのサンプル「ja.legacy」・配列qwertyとcolemak・SMA窓幅10とEWMA半減時間1秒。
  const sample = builtinTextById('builtin:ja.legacy');
  assert.ok(sample);
  for (const layoutId of ['qwerty', 'colemak']) {
    const input = resolve(layoutId, sample.text, 'ja');
    for (const average of [{ rateAverage: 'sma' }, { rateAverage: 'ewma' }] as const) {
      const plain = extractionOf(input, average);
      const waited = extractionOf(input, { ...average, ...WAIT_OPTIONS });
      assert.notEqual(waited.timeTotals.totalMs, plain.timeTotals.totalMs);
      assert.equal(waited.timeTotals.typingMs, plain.timeTotals.typingMs);
      assert.notDeepEqual(waited.rateChart, plain.rateChart);
    }
  }
});

test('待機: チェーン・Roll・Redirect・Arpeggioの判定と遷移の数は待機で変わらない', () => {
  const input = resolve('qwerty', 'あ、い。う、ええ。', 'ja');
  const cache = createEngineCache();
  const plain = extractionOf(input, {}, cache);
  const waited = extractionOf(input, WAIT_OPTIONS, cache);
  // 構造解析は待機を参照せず、同じ入力から同じ結果を使う
  assert.equal(waited.analysis, plain.analysis);
  assert.equal(waited.analysis.transitions.length, plain.analysis.transitions.length);
  assert.equal(waited.basisId, plain.basisId);
});

test('待機: 英語のテキストの , . には待機を足さない', () => {
  // 条件: 配列qwerty・英字をそのまま打つ・テキスト「a, b. c」・待機は4つとも0でない。
  const input = resolve('qwerty', 'a, b. c', 'en');
  const plain = extractionOf(input);
  const waited = extractionOf(input, WAIT_OPTIONS);
  assert.deepEqual(waited.schedule, plain.schedule);
  assert.deepEqual(waited.timeTotals, plain.timeTotals);
  assert.deepEqual(waited.waitUse, { commaBeforeMs: false, commaAfterMs: false, periodBeforeMs: false, periodAfterMs: false });
});

test('待機: 日本語のテキストに半角の , . が残っても、読点・句点として待機を足す', () => {
  // 条件: 配列qwerty・ローマ字・テキスト「あ,い.う」。qwertyは半角の「,」「.」を直接持つので、前処理で書き換わらずそのまま打つ。
  const input = resolve('qwerty', 'あ,い.う', 'ja');
  const waited = extractionOf(input, WAIT_OPTIONS);
  assert.deepEqual(
    waited.schedule.map((step) => step.waitMs ?? 0),
    [0, 300, 200, 100, 500],
  );
});

test('待機: テキストの言語が違えば、抽出のキーに入る資産が違う', () => {
  const ja = playbackAssetsKeyOf(DEFAULT_PLAYBACK_OPTIONS, { ...DEFAULT_EXTRACTION_ASSETS, textLanguage: 'ja' });
  const en = playbackAssetsKeyOf(DEFAULT_PLAYBACK_OPTIONS, { ...DEFAULT_EXTRACTION_ASSETS, textLanguage: 'en' });
  assert.notDeepEqual(ja, en);
  // 個人速度を適用しない設定でも、言語はキーに入る
  const notApplied = { ...DEFAULT_PLAYBACK_OPTIONS, applyPersonalSpeed: false };
  assert.notDeepEqual(
    playbackAssetsKeyOf(notApplied, { ...DEFAULT_EXTRACTION_ASSETS, textLanguage: 'ja' }),
    playbackAssetsKeyOf(notApplied, { ...DEFAULT_EXTRACTION_ASSETS, textLanguage: 'en' }),
  );
});

test('待機: 既定と違う計算の知らせには、テキストに足す位置がある待機だけを出す', () => {
  // 条件: 配列qwerty・ローマ字・テキスト「あ、い」（読点だけ）・待機は4つとも0でない。
  const notesOf = (text: string, language: 'en' | 'ja', options: Partial<PlaybackOptions>) => {
    const extracted = extractionOf(resolve('qwerty', text, language), options);
    return playbackCalculationNotes(
      { ...DEFAULT_PLAYBACK_OPTIONS, ...options },
      extracted.personalSpeedUse,
      extracted.timing.calibration,
      extracted.savedCalibration,
      extracted.overheadUse,
      extracted.waitUse,
    ).changes;
  };
  assert.deepEqual(
    notesOf('あ、い', 'ja', WAIT_OPTIONS).filter((change) => change.includes('待機')),
    ['読点の前の待機: 300ミリ秒', '読点の後の待機: 200ミリ秒'],
  );
  assert.deepEqual(
    notesOf('あ、い', 'ja', {}).filter((change) => change.includes('待機')),
    [],
  );
  assert.deepEqual(
    notesOf('a, b', 'en', WAIT_OPTIONS).filter((change) => change.includes('待機')),
    [],
  );
});

test('待機: 再生は待機を含めた表示時間で進み、待機の間はカーソルが動かない', () => {
  // 条件: 配列qwerty・ローマ字・テキスト「あ、い」・読点の前300ms。基準速度の既定で1ステップ800ms。2打鍵目の表示時間は800+300ms。
  const input = resolve('qwerty', 'あ、い', 'ja');
  const extracted = extractionOf(input, { commaBeforeMs: 300 });
  assert.deepEqual(
    extracted.schedule.slice(0, 2).map((step) => step.endMs - step.startMs),
    [800, 1100],
  );
  let state = startPlayback(seekPlayback(initialPlaybackState(extracted.timing), 1, 3), 3);
  for (let elapsed = 0; elapsed < 1000; elapsed += 100) state = tickPlayback(state, 100, extracted.analysis, extracted.schedule);
  // 1000ms経過: 2打鍵目の表示時間1100msの手前なので、カーソルは動かない
  assert.equal(state.cursor, 1);
  state = tickPlayback(state, 100, extracted.analysis, extracted.schedule);
  assert.equal(state.cursor, 2);
});
