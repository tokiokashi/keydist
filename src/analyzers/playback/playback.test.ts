import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride, type SettingsCascadeOverrides } from '#engine/settings-items.ts';
import { basisIdOf, interpretationKeyOf, singleExtractionKeyOf, traceKeyOf } from '#engine/keys.ts';
import { resolveEngineInput, type ResolvedInput } from '#engine/resolved-input.ts';
import { createEngineCache } from '#engine/cache.ts';
import { checkOptionsDiscipline } from '#analyzers/options.ts';
import {
  DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
  DEFAULT_PLAYBACK_STEPS_PER_SECOND,
} from '#interpretation/timing/playback.ts';
import type { PlaybackCalibration } from '#interpretation/timing/calibration.ts';
import { reconcilePlaybackStateAfterAnalysisRefresh } from '#interpretation/timing/playback.ts';
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
import { playbackTimingConditions } from './timing-conditions.ts';

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
  const timing = playbackTimingConditions();
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

test('解析設定はすべて表示だけが変わる項目で、抽出のキャッシュキーに入らない', () => {
  assert.deepEqual(Object.keys(playbackOptions.items).sort(), [
    'fingerPreparationSeconds',
    'keyFeedbackStyle',
    'scale',
    'showArpeggio',
    'showChain',
    'showSameFingerMotion',
  ]);
  assert.deepEqual(playbackOptions.extractKeyOf(DEFAULT_PLAYBACK_OPTIONS), {});
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

/** 全体のレベルに速度の平均の条件を置いた上書き。 */
function withRateConditions(values: Partial<{
  playbackRateAverage: 'sma' | 'ewma';
  playbackRateWindow: number;
  playbackRateHalfLifeSeconds: number;
}>): SettingsCascadeOverrides {
  let overrides = EMPTY_SETTINGS_OVERRIDES;
  for (const [id, value] of Object.entries(values) as [keyof typeof values, never][]) {
    const written = setSettingsOverride(overrides, { kind: 'global' }, id, value);
    assert.ok(written.ok);
    if (written.ok) overrides = written.overrides;
  }
  return overrides;
}

function extractionOf(input: ResolvedInput, cache = createEngineCache()): PlaybackExtracted {
  return cache.getExtraction(input, playbackDefinition, DEFAULT_PLAYBACK_OPTIONS).extracted;
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
  assert.deepEqual(extracted.schedule, playbackScheduleOf(extracted.analysis, input.geometry, playbackTimingConditions()));
  // 窓の合計Dは時間表の終わり: 800+800×移動距離
  const total = 800 + 800 * moved;
  assert.ok(Math.abs(extracted.schedule[1].endMs - total) < 1e-6);
  assert.ok(Math.abs(extracted.rateChart[2].actionsPerSecond! - 2000 / total) < 1e-9);
  assert.ok(Math.abs(extracted.rateChart[2].kanaPerSecond! - 2000 / total) < 1e-9);
  assert.equal(extracted.rateChart[2].actionsPerSecond, 1.1803398874989486);
});

test('速度の推移（SMA）: 窓幅を小さくすると、古いStrokeが窓から外れる', () => {
  // 条件: 配列qwerty・テキスト「fv」・窓幅1。位置2の窓は2打鍵目だけで、D = 800 × 移動距離
  const input = resolve('qwerty', 'fv', 'en', withRateConditions({ playbackRateWindow: 1 }));
  const extracted = extractionOf(input);
  const second = extracted.schedule[1].endMs - extracted.schedule[1].startMs;
  assert.ok(Math.abs(extracted.rateChart[2].actionsPerSecond! - 1000 / second) < 1e-9);
  assert.ok(Math.abs(extracted.rateChart[2].kanaPerSecond! - 1000 / second) < 1e-9);
});

test('速度の推移（EWMA）: 時間で減衰させ、最初の有効な値を初期値にする（§5.2）', () => {
  // 条件: 配列qwerty・テキスト「fv」・半減時間1秒。1打鍵目は800ms、2打鍵目は800×移動距離ms。
  const input = resolve('qwerty', 'fv', 'en', withRateConditions({ playbackRateAverage: 'ewma', playbackRateHalfLifeSeconds: 1 }));
  const extracted = extractionOf(input);
  const second = (extracted.schedule[1].endMs - extracted.schedule[1].startMs) / 1000;
  const decay = 2 ** (-second / 1);
  const expected = decay * 1.25 + (1 - decay) * (1 / second);
  assert.equal(extracted.rateChart[1].actionsPerSecond, 1.25);
  assert.ok(Math.abs(extracted.rateChart[2].actionsPerSecond! - expected) < 1e-9);
  // 1 Stroke = 1かなで瞬時値の系列が同じなので、かな/秒もアクション/秒と一致する
  assert.ok(Math.abs(extracted.rateChart[2].kanaPerSecond! - expected) < 1e-9);
  assert.equal(extracted.rateChart[2].actionsPerSecond, 1.1890265225127918);
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
  const base = resolve('qwerty', 'fv');
  const ewma = resolve('qwerty', 'fv', 'en', withRateConditions({ playbackRateAverage: 'ewma' }));
  const narrow = resolve('qwerty', 'fv', 'en', withRateConditions({ playbackRateWindow: 1 }));
  // 半減時間はEWMAでだけ値に効くので、方式もEWMAにして半減時間の違いだけを見る
  const halfLife = resolve('qwerty', 'fv', 'en', withRateConditions({ playbackRateAverage: 'ewma', playbackRateHalfLifeSeconds: 2 }));
  const cache = createEngineCache();
  const results = [base, ewma, narrow, halfLife].map((input) => extractionOf(input, cache));

  // Traceのキー・解釈のキー・再生位置の識別子は変わらない
  for (const input of [ewma, narrow, halfLife]) {
    assert.equal(traceKeyOf(input), traceKeyOf(base));
    assert.equal(interpretationKeyOf(input, traceKeyOf(input)), interpretationKeyOf(base, traceKeyOf(base)));
    assert.equal(basisIdOf(input), basisIdOf(base));
    assert.notEqual(singleExtractionKeyOf(input, 'playback', {}), singleExtractionKeyOf(base, 'playback', {}));
  }
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

/** 全体のレベルに時間モデルの条件を置いた上書き。 */
function withTimingConditions(values: Partial<{
  playbackStepsPerSecond: number;
  playbackSpeedMultiplier: number;
  playbackSameFingerDelay: boolean;
  playbackAllFingerMovementDelay: boolean;
  playbackPersonalSpeed: boolean;
}>): SettingsCascadeOverrides {
  let overrides = EMPTY_SETTINGS_OVERRIDES;
  for (const [id, value] of Object.entries(values) as [keyof typeof values, never][]) {
    const written = setSettingsOverride(overrides, { kind: 'global' }, id, value);
    assert.ok(written.ok);
    if (written.ok) overrides = written.overrides;
  }
  return overrides;
}

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

test('条件の基準速度・再生倍率・指の移動速度の考慮が、再生の時間表に届く', () => {
  // 条件: 配列qwerty・物理配列row-staggered・テキスト「fjdk」（どの隣り合うステップも指が違う）。既定は800ms。
  assert.deepEqual(STEP_ENDS(extractionOf(resolve('qwerty', 'fjdk'))), [800, 1600, 2400, 3200]);
  // 基準速度2.5ステップ/秒 → 400ms
  const faster = resolve('qwerty', 'fjdk', 'en', withTimingConditions({ playbackStepsPerSecond: 2.5 }));
  assert.deepEqual(STEP_ENDS(extractionOf(faster)), [400, 800, 1200, 1600]);
  // 再生倍率2は最後に掛かる → 400ms
  const doubled = resolve('qwerty', 'fjdk', 'en', withTimingConditions({ playbackSpeedMultiplier: 2 }));
  assert.deepEqual(STEP_ENDS(extractionOf(doubled)), [400, 800, 1200, 1600]);
  // 指の移動速度を考慮しなければ、同指連続のステップも800msになる（テキスト「fv」）
  const off = resolve('qwerty', 'fv', 'en', withTimingConditions({ playbackSameFingerDelay: false }));
  assert.deepEqual(STEP_ENDS(extractionOf(off)), [800, 1600]);
  assert.ok(STEP_ENDS(extractionOf(resolve('qwerty', 'fv')))[1] > 1600);
  // 条件の実効値は抽出が持つ値にも載る
  assert.equal(extractionOf(faster).timing.stepsPerSecond, 2.5);
  assert.equal(extractionOf(doubled).timing.speedMultiplier, 2);
  assert.equal(extractionOf(off).timing.sameFingerDelay, false);
});

test('全指の移動時間で律速する条件が、抽出の時間表に届く', () => {
  // 条件: 配列qwerty・物理配列row-staggered・テキスト「fv」。fからvへ移る指の移動時間が基本の時間を超えれば、終了時刻が延びる。
  const base = extractionOf(resolve('qwerty', 'fv'));
  const on = extractionOf(resolve('qwerty', 'fv', 'en', withTimingConditions({ playbackAllFingerMovementDelay: true })));
  assert.equal(on.timing.allFingerMovementDelay, true);
  assert.deepEqual(on.schedule.map((step) => step.strokeIndex), base.schedule.map((step) => step.strokeIndex));
  assert.ok(on.schedule[1].endMs >= base.schedule[1].endMs);
});

test('時間モデルの条件を変えても、Traceと構造解析は作り直さずに抽出だけが変わる', () => {
  const base = resolve('qwerty', 'fv');
  const changed = [
    resolve('qwerty', 'fv', 'en', withTimingConditions({ playbackStepsPerSecond: 2.5 })),
    resolve('qwerty', 'fv', 'en', withTimingConditions({ playbackSpeedMultiplier: 2 })),
    resolve('qwerty', 'fv', 'en', withTimingConditions({ playbackSameFingerDelay: false })),
    resolve('qwerty', 'fv', 'en', withTimingConditions({ playbackAllFingerMovementDelay: true })),
  ];
  const cache = createEngineCache();
  const results = [base, ...changed].map((input) => extractionOf(input, cache));
  for (const input of changed) {
    assert.equal(traceKeyOf(input), traceKeyOf(base));
    assert.equal(interpretationKeyOf(input, traceKeyOf(input)), interpretationKeyOf(base, traceKeyOf(base)));
    assert.equal(basisIdOf(input), basisIdOf(base));
    assert.notEqual(singleExtractionKeyOf(input, 'playback', {}), singleExtractionKeyOf(base, 'playback', {}));
  }
  assert.deepEqual(
    { trace: cache.size.trace, interpretation: cache.size.interpretation, extraction: cache.size.extraction },
    { trace: 1, interpretation: 1, extraction: 5 },
  );
  for (const result of results) assert.equal(result.analysis, results[0].analysis);
});

test('個人速度: 適用する設定で保存値があれば、その値で時間を求め、抽出のキーに保存値が入る（§2.1）', () => {
  // 条件: 配列qwerty・テキスト「fjdk」・通常速度5アクション/秒 → 1000/5 = 200ms。再生倍率は1。
  const base = resolve('qwerty', 'fjdk');
  const applied = resolve('qwerty', 'fjdk', 'en', EMPTY_SETTINGS_OVERRIDES, CALIBRATION);
  const appliedResult = extractionOf(applied);
  assert.deepEqual(STEP_ENDS(appliedResult), [200, 400, 600, 800]);
  assert.equal(appliedResult.personalSpeedUse, 'applied');
  assert.equal(appliedResult.timing.calibration, CALIBRATION);
  // 個人速度で計算している間、基準速度の条件は時間に入らない
  const stepsChanged = resolve('qwerty', 'fjdk', 'en', withTimingConditions({ playbackStepsPerSecond: 10 }), CALIBRATION);
  assert.deepEqual(STEP_ENDS(extractionOf(stepsChanged)), [200, 400, 600, 800]);
  // 保存値が変われば、キーが変わって抽出を作り直す。Traceと構造解析は同じ
  const remeasured = resolve('qwerty', 'fjdk', 'en', EMPTY_SETTINGS_OVERRIDES, { ...CALIBRATION, actionsPerSecond: 10 });
  assert.deepEqual(STEP_ENDS(extractionOf(remeasured)), [100, 200, 300, 400]);
  assert.notEqual(singleExtractionKeyOf(remeasured, 'playback', {}), singleExtractionKeyOf(applied, 'playback', {}));
  assert.notEqual(singleExtractionKeyOf(applied, 'playback', {}), singleExtractionKeyOf(base, 'playback', {}));
  assert.equal(traceKeyOf(remeasured), traceKeyOf(applied));
  assert.equal(basisIdOf(remeasured), basisIdOf(base));
});

test('個人速度: 保存値が無ければ個人速度無しの時間で、そのことを抽出が伝える（§2.1）', () => {
  const missing = extractionOf(resolve('qwerty', 'fjdk'));
  assert.equal(missing.personalSpeedUse, 'missing');
  assert.equal(missing.timing.calibration, undefined);
  assert.deepEqual(STEP_ENDS(missing), [800, 1600, 2400, 3200]);
});

test('個人速度: 適用しない設定なら、保存値があっても個人速度無しの時間で、保存値はキーに入らない（§2.1）', () => {
  const off = withTimingConditions({ playbackPersonalSpeed: false });
  const withSaved = resolve('qwerty', 'fjdk', 'en', off, CALIBRATION);
  const withoutSaved = resolve('qwerty', 'fjdk', 'en', off);
  const result = extractionOf(withSaved);
  assert.equal(result.personalSpeedUse, 'not-applied');
  assert.deepEqual(STEP_ENDS(result), [800, 1600, 2400, 3200]);
  // 適用しない間に測り直しても、抽出は作り直さない
  assert.equal(
    singleExtractionKeyOf(withSaved, 'playback', {}),
    singleExtractionKeyOf(withoutSaved, 'playback', {}),
  );
  const remeasured = resolve('qwerty', 'fjdk', 'en', off, { ...CALIBRATION, actionsPerSecond: 10 });
  assert.equal(singleExtractionKeyOf(remeasured, 'playback', {}), singleExtractionKeyOf(withSaved, 'playback', {}));
});

test('時間の条件を変えると、カーソルと再生中かどうかを保ち、経過時間は進捗率のまま新しい時間表へ写す（§4.0）', () => {
  // 条件: 配列qwerty・テキスト「fjdk」。基準速度1.25（800ms）→ 2.5（400ms）。2打目の途中（400ms経過 = 進捗率0.5）で変える
  const slow = extractionOf(resolve('qwerty', 'fjdk'));
  const fast = extractionOf(resolve('qwerty', 'fjdk', 'en', withTimingConditions({ playbackStepsPerSecond: 2.5 })));
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

test('時間の条件は仕様 §2の既定値で、個人速度の保存値が無い間は個人速度を使わない', () => {
  assert.deepEqual(playbackTimingConditions(), {
    stepsPerSecond: 1.25,
    speedMultiplier: 1,
    sameFingerDelay: true,
    allFingerMovementDelay: false,
    calibration: undefined,
  });
  assert.equal(DEFAULT_PLAYBACK_STEPS_PER_SECOND, 1.25);
  assert.equal(DEFAULT_PLAYBACK_SPEED_MULTIPLIER, 1);
});

test('同指連続を含まないステップは、どれも800msで、時間表は切れ目なく積まれる（§3.2・§4.1）', () => {
  // f（左人差し指）→ j（右人差し指）→ d（左中指）→ k（右中指）。どの隣り合うステップも指が違う。
  const { input, extracted } = prepare('qwerty', 'fjdk');
  const schedule = playbackScheduleOf(extracted.analysis, input.geometry, playbackTimingConditions());
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
  const schedule = playbackScheduleOf(extracted.analysis, input.geometry, playbackTimingConditions());
  assert.equal(schedule[0].endMs - schedule[0].startMs, 800);
  assert.ok(Math.abs((schedule[1].endMs - schedule[1].startMs) - 800 * moved) < 1e-6);
  assert.equal(schedule[1].startMs, schedule[0].endMs);
});

test('同じキーの連打は同指連続に数えず、通常の800ms（§3.2）', () => {
  const { input, extracted } = prepare('qwerty', 'ff');
  const schedule = playbackScheduleOf(extracted.analysis, input.geometry, playbackTimingConditions());
  assert.deepEqual(schedule.map((step) => step.endMs - step.startMs), [800, 800]);
});

// ---------------------------------------------------------------------------
// 再生位置の遷移
// ---------------------------------------------------------------------------

test('再生位置: 開始・一時停止・停止・1ステップ・シーク', () => {
  const timing = playbackTimingConditions();
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
  const timing = playbackTimingConditions();
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
  const { frame } = frameAt('qwerty', 'fj', 0);
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
  const { frame } = frameAt('qwerty', 'fjd', 1);
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
  const { frame } = frameAt('qwerty', 'fj', 99);
  assert.equal(frame.cursor, 2);
  assert.equal(frame.plannedKeys.size, 0);
  assert.deepEqual([...frame.activeKeys], ['j']);
});

test('指位置の準備時間: 0秒では打鍵の瞬間に切り替わり、準備時間があると次の押下より前に動く（§4.1）', () => {
  // f→v: 左人差し指がfからvへ動く。時間表では2打鍵目の終わりが押下の時刻。
  const before = frameAt('qwerty', 'fv', 1, { fingerPreparationSeconds: 0 }, 790);
  assert.equal(before.frame.fingerPositionKeys.get('f'), 'LI');
  assert.equal(before.frame.fingerPositionKeys.has('v'), false);

  // 準備時間を長くしても、物理的に間に合わない間は動かない。経過0msではまだvに着かない
  const early = frameAt('qwerty', 'fv', 1, { fingerPreparationSeconds: 5 }, 0);
  assert.equal(early.frame.fingerPositionKeys.has('v'), false);
  // 次の押下の時刻（2打鍵目の終わり）に着く。1打鍵目の終わりからの経過時間は、2打鍵目の表示時間
  const { input, extracted } = prepare('qwerty', 'fv');
  const schedule = playbackScheduleOf(extracted.analysis, input.geometry, playbackTimingConditions());
  const arrived = frameAt('qwerty', 'fv', 1, { fingerPreparationSeconds: 5 }, schedule[1].endMs - schedule[0].endMs);
  assert.equal(arrived.frame.fingerPositionKeys.get('v'), 'LI');
  assert.equal(arrived.frame.fingerPositionKeys.has('f'), false);
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
