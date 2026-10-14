import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride, type SettingsCascadeOverrides } from '#engine/settings-items.ts';
import { DEFAULT_EXTRACTION_ASSETS } from '#analyzers/contract.ts';
import { basisIdOf, singleExtractionKeyOf, traceKeyOf } from '#engine/keys.ts';
import { resolveEngineInput, type ResolvedInput } from '#engine/resolved-input.ts';
import { createEngineCache } from '#engine/cache.ts';
import { checkOptionsDiscipline } from '#analyzers/options.ts';
import {
  DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
  DEFAULT_PLAYBACK_STEPS_PER_SECOND,
} from '#interpretation/timing/playback.ts';
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
import { playbackTimingConditions as timingConditionsOf } from './timing-conditions.ts';

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

test('解析設定は、時間と速度平均の8項目だけが抽出のキーに入り、残りは表示だけが変わる', () => {
  assert.deepEqual(Object.keys(playbackOptions.items).sort(), [
    'allFingerMovementDelay',
    'applyPersonalSpeed',
    'fingerPreparationSeconds',
    'keyFeedbackStyle',
    'rateAverage',
    'rateHalfLifeSeconds',
    'rateWindow',
    'sameFingerDelay',
    'scale',
    'showArpeggio',
    'showChain',
    'showFingerPositions',
    'showOrderLabels',
    'showPlannedKeys',
    'showRomajiPlan',
    'showSameFingerMotion',
    'showTrail',
    'speedMultiplier',
    'stepsPerSecond',
    'trailSteps',
  ]);
  assert.deepEqual(playbackOptions.extractKeyOf(DEFAULT_PLAYBACK_OPTIONS), {
    stepsPerSecond: 1.25,
    speedMultiplier: 1,
    sameFingerDelay: true,
    allFingerMovementDelay: true,
    applyPersonalSpeed: true,
    rateAverage: 'sma',
    rateWindow: 10,
    rateHalfLifeSeconds: 1,
  });
  assert.deepEqual(
    checkOptionsDiscipline(playbackOptions, playbackDefinition.optionsDiscipline),
    { keyViolations: [], viewExtractionViolations: [] },
  );
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
function extractionOf(
  input: ResolvedInput,
  options: Partial<PlaybackOptions> = {},
  cache = createEngineCache(),
): PlaybackExtracted {
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
  assert.deepEqual(rateChart.map((point) => point.cursor), [0, 1, 2, 3]);
  assert.deepEqual([rateChart[0].kanaPerSecond, rateChart[0].actionsPerSecond], [undefined, undefined]);
  // アクション/秒 = Stroke数 × 1000 / D = 1000 / 800
  assert.deepEqual(rateChart.map((point) => point.actionsPerSecond), [undefined, 1.25, 1.25, 1.25]);
  // かな/秒 = 窓の中で始まり終わる入力単位の文字数 × 1000 / D。
  // 位置1は「か」の途中（kだけ）なので数えず、位置2で「か」が完了して1×1000/1600、位置3で「あ」も加わって2×1000/2400
  assert.deepEqual(rateChart.map((point) => point.kanaPerSecond), [undefined, undefined, 1000 / 1600, 2000 / 2400]);
  assert.deepEqual(rateChart.map((point) => point.inputText), ['', 'か', 'か', 'かあ']);
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

test('解析設定の共有リンク: 時間と速度平均の8項目は既定と違う時だけ書き、読み戻すと同じ値になる', () => {
  assert.equal(playbackOptions.encodeOptionsToUrl(DEFAULT_PLAYBACK_OPTIONS).toString(), '');
  const changed: PlaybackOptions = {
    ...DEFAULT_PLAYBACK_OPTIONS,
    stepsPerSecond: 2.5,
    speedMultiplier: 2,
    sameFingerDelay: false,
    allFingerMovementDelay: false,
    applyPersonalSpeed: false,
    rateAverage: 'ewma',
    rateWindow: 20,
    rateHalfLifeSeconds: 2,
  };
  const params = playbackOptions.encodeOptionsToUrl(changed);
  assert.equal(params.size, 8);
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

test('既定と違う計算の知らせ: 使われない項目は挙げず、個人速度で計算している時は基準速度を挙げない', () => {
  const notes = (options: Partial<PlaybackOptions>, use: 'applied' | 'not-applied' | 'missing') =>
    playbackCalculationNotes({ ...DEFAULT_PLAYBACK_OPTIONS, ...options }, use);
  assert.deepEqual(notes({}, 'missing'), { personalSpeedInUse: false, keystrokeOverheadInUse: false, changes: [] });
  assert.deepEqual(notes({}, 'applied'), { personalSpeedInUse: true, keystrokeOverheadInUse: false, changes: [] });
  assert.deepEqual(notes({ stepsPerSecond: 2, speedMultiplier: 3 }, 'missing').changes, ['基準速度: 2ステップ/秒', '再生倍率: 3倍']);
  // 個人速度で計算している間、基準速度は数値に入らない。再生倍率は入る
  assert.deepEqual(notes({ stepsPerSecond: 2, speedMultiplier: 3 }, 'applied').changes, ['再生倍率: 3倍']);
  assert.deepEqual(
    notes({ sameFingerDelay: false, allFingerMovementDelay: false, applyPersonalSpeed: false }, 'not-applied').changes,
    ['指の移動速度を考慮しない', '全指の移動時間で律速しない', '個人速度を適用しない'],
  );
  // 平均の方式で使われない側の窓幅・半減時間は挙げない
  assert.deepEqual(notes({ rateWindow: 20, rateHalfLifeSeconds: 2 }, 'missing').changes, ['平均の窓幅: 20打鍵']);
  assert.deepEqual(
    notes({ rateAverage: 'ewma', rateWindow: 20, rateHalfLifeSeconds: 2 }, 'missing').changes,
    ['平均の方式: EWMA', '平均の半減時間: 2秒'],
  );
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
  assert.deepEqual(rates(fv), [[0, undefined, undefined], [1, 1.25, 1.25], [2, 1.1803398874989484, 1.1803398874989484]]);
  // 既定の解析設定・テキスト「かあ」
  const kana = extractionOf(resolve('qwerty', 'かあ', 'ja'));
  assert.deepEqual(kana.schedule, [
    { strokeIndex: 0, startMs: 0, endMs: 800 },
    { strokeIndex: 1, startMs: 800, endMs: 1600 },
    { strokeIndex: 2, startMs: 1600, endMs: 2400 },
  ]);
  assert.deepEqual(rates(kana), [[0, undefined, undefined], [1, undefined, 1.25], [2, 0.625, 1.25], [3, 0.8333333333333334, 1.25]]);
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
  assert.deepEqual(rates(changed), [[0, undefined, undefined], [1, 3.7499999999999996, 3.7499999999999996], [2, 3.7499999999999996, 3.7499999999999996]]);
  // 既定の解析設定・個人速度の保存値あり・テキスト「fv」
  const personal = extractionOf(resolve('qwerty', 'fv', 'en', EMPTY_SETTINGS_OVERRIDES, CALIBRATION));
  assert.deepEqual(personal.schedule, [
    { strokeIndex: 0, startMs: 0, endMs: 200 },
    { strokeIndex: 1, startMs: 200, endMs: 400 },
  ]);
  assert.deepEqual(rates(personal), [[0, undefined, undefined], [1, 5, 5], [2, 5, 5]]);
});

test('速度の推移: ChainとArpeggioの区間を点ごとに持つ（表示するかは見る側が決める）', () => {
  // 条件: 配列qwerty・テキスト「fv」。構造解析のChainは打鍵0だけ（f）で、vで切れる
  const fv = extractionOf(resolve('qwerty', 'fv'));
  assert.deepEqual(fv.analysis.chains.map((chain) => [chain.startStrokeIndex, chain.endStrokeIndex]), [[0, 1]]);
  assert.deepEqual(fv.rateChart.map((point) => point.chain ?? false), [false, true, false]);
  // テキスト「asdf」はChain 1本・Arpeggio 1本で、4打鍵すべてが入る
  const asdf = extractionOf(resolve('qwerty', 'asdf'));
  assert.deepEqual(asdf.rateChart.slice(1).map((point) => [point.chain, point.arpeggio]), [
    [true, true], [true, true], [true, true], [true, true],
  ]);
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
  fingerSpeedUnitsPerSecond: {},
  fallbackFingerSpeedUnitsPerSecond: 10,
  measuredAt: 1,
};

const STEP_ENDS = (extracted: PlaybackExtracted) => extracted.schedule.map((step) => step.endMs);

test('基準速度・再生倍率・指の移動速度の考慮の設定が、再生の時間表に届く', () => {
  // 条件: 配列qwerty・物理配列row-staggered・テキスト「fjdk」（どの隣り合うステップも指が違う）。既定は800ms。
  const fjdk = resolve('qwerty', 'fjdk');
  assert.deepEqual(STEP_ENDS(extractionOf(fjdk)), [800, 1600, 2400, 3200]);
  // 基準速度2.5ステップ/秒 → 400ms
  const faster = extractionOf(fjdk, { stepsPerSecond: 2.5 });
  assert.deepEqual(STEP_ENDS(faster), [400, 800, 1200, 1600]);
  // 再生倍率2は最後に掛かる → 400ms
  const doubled = extractionOf(fjdk, { speedMultiplier: 2 });
  assert.deepEqual(STEP_ENDS(doubled), [400, 800, 1200, 1600]);
  // 指の移動速度を考慮しなければ、同指連続のステップも800msになる（テキスト「fv」）
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
  assert.deepEqual(on.schedule.map((step) => step.strokeIndex), off.schedule.map((step) => step.strokeIndex));
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
    playbackCalculationNotes(DEFAULT_PLAYBACK_OPTIONS, use, calibration);
  const withOverhead = { ...CALIBRATION, keystrokeOverheadMs: { other: 60 } };
  assert.equal(notes('applied', withOverhead).keystrokeOverheadInUse, true);
  assert.equal(notes('applied', CALIBRATION).keystrokeOverheadInUse, false);
  assert.equal(notes('applied', { ...CALIBRATION, keystrokeOverheadMs: {} }).keystrokeOverheadInUse, false);
  assert.equal(notes('applied').keystrokeOverheadInUse, false);
  assert.equal(notes('not-applied', withOverhead).keystrokeOverheadInUse, false);
  assert.equal(notes('missing', withOverhead).keystrokeOverheadInUse, false);
});

test('既定と違う計算の知らせ: 打鍵の上乗せは、時間に入る種類が0より大きい値を持つ時だけ足していると示す', () => {
  const notes = (sameFingerDelay: boolean, keystrokeOverheadMs: PlaybackCalibration['keystrokeOverheadMs']) =>
    playbackCalculationNotes(
      { ...DEFAULT_PLAYBACK_OPTIONS, sameFingerDelay },
      'applied',
      { ...CALIBRATION, keystrokeOverheadMs },
    ).keystrokeOverheadInUse;
  // 同指連続の値だけの時は、指の移動速度を考慮する時だけ時間に入る
  assert.equal(notes(true, { sfb: 40 }), true);
  assert.equal(notes(false, { sfb: 40 }), false);
  // 他の種類の値は、指の移動速度によらず時間に入る
  for (const kind of ['arpeggio', 'chain', 'other', 'repeat'] as const) {
    assert.equal(notes(true, { [kind]: 40 }), true, kind);
    assert.equal(notes(false, { [kind]: 40 }), true, kind);
  }
  assert.equal(notes(false, { sfb: 40, other: 10 }), true);
  // 全ての値が0なら、足さない
  assert.equal(notes(true, { arpeggio: 0, chain: 0, other: 0, repeat: 0, sfb: 0 }), false);
  assert.equal(notes(false, { other: 0, sfb: 0 }), false);
  assert.equal(notes(true, { other: 0, sfb: 40 }), true);
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
  assert.ok(Math.abs((schedule[1].endMs - schedule[1].startMs) - 800 * moved) < 1e-6);
  assert.equal(schedule[1].startMs, schedule[0].endMs);
});

test('同じキーの連打は同指連続に数えず、通常の800ms（§3.2）', () => {
  const { input, extracted } = prepare('qwerty', 'ff');
  const schedule = playbackScheduleOf(extracted.analysis, input.geometry, defaultTiming());
  assert.deepEqual(schedule.map((step) => step.endMs - step.startMs), [800, 800]);
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
  assert.deepEqual([...frame.plannedOrders].sort(), [['f', 1], ['j', 2]]);
});

test('1打鍵目の後: 押したキー・履歴・予定・入力の履歴が揃う', () => {
  const { frame } = frameAt('qwerty', 'fjd', 1, SHOW_ALL_FIGURE);
  assert.equal(frame.cursor, 1);
  assert.deepEqual([...frame.activeKeys], ['f']);
  assert.equal(frame.typedText, 'f');
  assert.equal(frame.trailKeys.get('f'), 1);
  assert.deepEqual([...frame.trailOrders], [['f', 1]]);
  // これから押すキーは次のステップから数える
  assert.deepEqual([...frame.plannedOrders].sort(), [['d', 2], ['j', 1]]);
  assert.deepEqual(frame.inputPreview.map((segment) => [segment.text, segment.kind]), [
    ['f', 'current'],
    ['j', 'planned'],
    ['d', 'planned'],
  ]);
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
  assert.deepEqual([...plannedWithOrders.plannedOrders].sort(), [['d', 2], ['j', 1]]);
  assert.equal(plannedWithOrders.trailOrders.size, 0);
  const trailWithOrders = frameAt('qwerty', 'fjd', 1, { showTrail: true, showOrderLabels: true }).frame;
  assert.deepEqual([...trailWithOrders.trailOrders], [['f', 1]]);
  assert.equal(trailWithOrders.plannedOrders.size, 0);
});

test('押下履歴を残すステップ数は、履歴が残る長さを決める', () => {
  const trailAt = (trailSteps: number) =>
    [...frameAt('qwerty', 'fjdksl', 6, { showTrail: true, trailSteps }).frame.trailKeys.keys()].sort();
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

test('配列図の表示の6項目は、既定と違う時だけURLに書き、読み戻すと同じ値になり、範囲外は捨てる', () => {
  const changed: PlaybackOptions = {
    ...DEFAULT_PLAYBACK_OPTIONS,
    showFingerPositions: true,
    showPlannedKeys: true,
    showRomajiPlan: false,
    showTrail: true,
    trailSteps: 12,
    showOrderLabels: true,
  };
  const params = playbackOptions.encodeOptionsToUrl(changed);
  assert.equal(params.size, 6);
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
  assert.deepEqual(
    [on.frame.motions[0].fromKey, on.frame.motions[0].toKey, on.frame.motions[0].kind],
    ['f', 'v', 'sameFinger'],
  );
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

test('予定ローマ字のキーは、既定で出て、今の単位のまだ押していないキーだけを、これから押すキーとは独立に出す', () => {
  assert.equal(DEFAULT_PLAYBACK_OPTIONS.showRomajiPlan, true);
  // 「か」(ka)の1打鍵目の後は、aだけが残る
  const base = frameAt('qwerty', 'か', 1, {}, 0, 'ja').frame;
  assert.deepEqual([...base.romajiPlannedKeys.keys()], ['a']);
  assert.equal(base.plannedKeys.size, 0);
  // 単位を打ち終えた位置と再生位置0では、残りが無いので出ない
  assert.equal(frameAt('qwerty', 'か', 2, {}, 0, 'ja').frame.romajiPlannedKeys.size, 0);
  assert.equal(frameAt('qwerty', 'か', 0, {}, 0, 'ja').frame.romajiPlannedKeys.size, 0);
  // 押下予定キーを出しても、予定ローマ字のキーは変わらない
  const withPlanned = frameAt('qwerty', 'か', 1, { showPlannedKeys: true }, 0, 'ja').frame;
  assert.deepEqual([...withPlanned.romajiPlannedKeys], [...base.romajiPlannedKeys]);
  assert.deepEqual([...withPlanned.plannedKeys.keys()], ['a']);
  // 切ると、予定ローマ字のキーだけが消え、他の表示は変わらない
  const off = frameAt('qwerty', 'か', 1, { showRomajiPlan: false, showPlannedKeys: true }, 0, 'ja').frame;
  assert.equal(off.romajiPlannedKeys.size, 0);
  assert.deepEqual([...off.plannedKeys], [...withPlanned.plannedKeys]);
  // ローマ字の規則を持たない配列では出ない
  assert.equal(frameAt('qwerty', 'fjd', 1).frame.romajiPlannedKeys.size, 0);
});

test('順番ラベルが表示の時、予定ローマ字のキーにも順番が付き、両方に入るキーでは押下予定キーと同じ番号になる', () => {
  const both = frameAt('qwerty', 'か', 1, { showPlannedKeys: true, showOrderLabels: true }, 0, 'ja').frame;
  assert.deepEqual([...both.romajiPlannedOrders], [['a', 1]]);
  assert.equal(both.plannedOrders.get('a'), both.romajiPlannedOrders.get('a'));
  const romajiOnly = frameAt('qwerty', 'か', 1, { showOrderLabels: true }, 0, 'ja').frame;
  assert.deepEqual([...romajiOnly.romajiPlannedOrders], [['a', 1]]);
  assert.equal(romajiOnly.plannedOrders.size, 0);
  // 順番ラベルを出さない間は付かない
  assert.equal(frameAt('qwerty', 'か', 1, {}, 0, 'ja').frame.romajiPlannedOrders.size, 0);
});
