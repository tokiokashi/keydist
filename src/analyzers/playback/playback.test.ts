import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { resolveEngineInput, type ResolvedInput } from '#engine/resolved-input.ts';
import { createEngineCache } from '#engine/cache.ts';
import { checkOptionsDiscipline } from '#analyzers/options.ts';
import {
  DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
  DEFAULT_PLAYBACK_STEPS_PER_SECOND,
} from '#interpretation/timing/playback.ts';
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

function resolve(layoutId: string, text: string, language: 'en' | 'ja' = 'en'): ResolvedInput {
  const setup: Setup = { id: 'setup-playback', number: 1, layoutId, shapeId: 'row-staggered' };
  const result = resolveEngineInput({
    target: { kind: 'setup', setupId: setup.id },
    setups: new Map([[setup.id, setup]]),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
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
// 再生の時間（spec/playback-timing.md）
// ---------------------------------------------------------------------------

test('時間の条件は仕様 §2の既定値で、個人速度は適用しない', () => {
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
