import { buildGeometry, THUMB_ROW, type Finger } from './geometry.ts';
import { type Options, type Stroke, type Trace } from './evaluate.ts';
import {
  advancePlayback, clampPlaybackCursor, createPlaybackState, playbackArpeggioKeyMotions,
  playbackChainOrders, playbackFingerPositionKeys, playbackInputPreview, playbackPlannedKeys,
  playbackPlannedOrders, playbackRomajiPlan, playbackRomajiPlannedKeys,
  playbackRomajiPlannedOrders, playbackOrderLabel, playbackRateChartData,
  playbackRecentActionsPerSecond, playbackRecentKanaPerSecond, setPlaybackArpeggio,
  playbackArpeggioTimings,
  playbackHandKeyMotions, playbackSameFingerKeyMotions, playbackRepeatedKeys,
  playbackStrokeAt, playbackStrokeDurationMs, setPlaybackSameFingerDelay,
  setPlaybackStepsPerSecond, stepPlayback, playbackTrailKeys, playbackTrailOrders,
  playbackStrokeDisplay, setPlaybackCalibration, setPlaybackSpeedMultiplier,
  type PlaybackArpeggioTiming, type PlaybackStepsPerSecond, type PlaybackState, PLAYBACK_SPEED_MULTIPLIER_MAX,
  PLAYBACK_SPEED_MULTIPLIER_MIN, PLAYBACK_STEPS_PER_SECOND_MAX,
  PLAYBACK_STEPS_PER_SECOND_MIN,
} from './playback.ts';
import { ARPEGGIO_PRESETS, playbackArpeggioOrders, type ArpeggioConditions } from './playback-arpeggio.ts';
import { renderPlaybackRateChart, updatePlaybackRateChartCursor } from './playback-rate-chart.ts';
import { FINGER_LABEL, type AppElements } from './app-dom.ts';
import { escapeAttr, escapeText } from './chart.ts';
import type { Layout } from './layouts/index.ts';
import type { PlaybackCalibration } from './playback-calibration.ts';
import type { UiPlaybackState, UiStateStorage, UiStateV1 } from './ui-state.ts';

export interface PlaybackViewContext {
  el: AppElements;
  storage: UiStateStorage | undefined;
  getUiState: () => UiStateV1;
  getPlaybackSettings: () => UiPlaybackState;
  updatePlaybackSetting: <K extends keyof UiPlaybackState>(key: K, value: UiPlaybackState[K]) => void;
  isPlaybackLayoutOverride: () => boolean;
  setPlaybackLayoutOverride: (enabled: boolean) => void;
  updateUiState: (change: (draft: UiStateV1) => void) => void;
  getCalibration: () => PlaybackCalibration | undefined;
  getArpeggioConditions: () => ArpeggioConditions;
  updateArpeggioConditions: (conditions: ArpeggioConditions) => void;
  readArpeggioConditions: () => ArpeggioConditions | undefined;
  syncArpeggioConditionControls: () => void;
  arpeggioPresetId: () => string;
  openCalibration: () => void;
  openCalibrationEdit: () => void;
}

export interface PlaybackViewController {
  setup: () => void;
  render: (trace: Trace, layout: Layout, geometry: ReturnType<typeof buildGeometry>, options: Options) => void;
  clear: () => void;
  update: () => void;
  setCalibration: (calibration: PlaybackCalibration) => void;
  getGeometry: () => ReturnType<typeof buildGeometry> | undefined;
  getLayout: () => Layout | undefined;
}

export function createPlaybackView(ctx: PlaybackViewContext): PlaybackViewController {
  const elements = ctx.el;

const PLAYBACK_KEY = 30;
const PLAYBACK_PAD = 6;
const PLAYBACK_THUMB_WIDTH = 1.9;
const PLAYBACK_SCALE_MIN = 0.5;
const PLAYBACK_SCALE_MAX = 4;

type PlaybackDynamicDisplay = 'none' | 'chain' | 'arpeggio' | 'both';

function dynamicPlaybackDisplay(settings: UiPlaybackState): PlaybackDynamicDisplay {
  if (settings.showChain && settings.showArpeggio) return 'both';
  if (settings.showChain) return 'chain';
  if (settings.showArpeggio) return 'arpeggio';
  return 'none';
}

let playbackState: PlaybackState = createPlaybackState(
  ctx.getUiState().ui.playback.stepsPerSecond,
  ctx.getUiState().ui.playback.sameFingerDelay,
  ctx.getUiState().ui.playback.useCalibration ? ctx.getCalibration() : undefined,
  ctx.getUiState().ui.playback.speedMultiplier,
  ctx.getUiState().ui.playback.arpeggioEnabled ? ctx.getUiState().conditions.defaults.arpeggio : undefined,
  ctx.getUiState().ui.playback.arpeggioDelayMode,
);
let playbackTrace: Trace | undefined;
let playbackGeometry: ReturnType<typeof buildGeometry> | undefined;
let playbackLayout: Layout | undefined;
let playbackOptions: Options | undefined;
let playbackAnimationFrame: number | undefined;
let playbackLastTimestamp: number | undefined;
let playbackSeekWasPlaying: boolean | undefined;
let playbackMotionCursor = -1;
let playbackRateChartSignature: string | undefined;
let playbackArpeggioTimingCache: {
  trace: Trace;
  arpeggio: ArpeggioConditions;
  stepsPerSecond: PlaybackStepsPerSecond;
  sameFingerDelay: boolean;
  calibration: PlaybackCalibration | undefined;
  delayMode: 'before' | 'distributed';
  timings: ReadonlyMap<number, PlaybackArpeggioTiming>;
} | undefined;

function cachedPlaybackArpeggioTimings(): ReadonlyMap<number, PlaybackArpeggioTiming> | undefined {
  if (!playbackTrace || !playbackState.arpeggio) return undefined;
  const arpeggio = playbackState.arpeggio;
  const cache = playbackArpeggioTimingCache;
  if (cache
    && cache.trace === playbackTrace
    && cache.arpeggio === arpeggio
    && cache.stepsPerSecond === playbackState.stepsPerSecond
    && cache.sameFingerDelay === playbackState.sameFingerDelay
    && cache.calibration === playbackState.calibration
    && cache.delayMode === playbackState.arpeggioDelayMode) {
    return cache.timings;
  }
  const timings = playbackArpeggioTimings(
    playbackTrace.strokes,
    arpeggio,
    playbackState.stepsPerSecond,
    playbackState.calibration,
    playbackState.arpeggioDelayMode,
    playbackState.sameFingerDelay,
  );
  playbackArpeggioTimingCache = {
    trace: playbackTrace,
    arpeggio,
    stepsPerSecond: playbackState.stepsPerSecond,
    sameFingerDelay: playbackState.sameFingerDelay,
    calibration: playbackState.calibration,
    delayMode: playbackState.arpeggioDelayMode,
    timings,
  };
  return timings;
}

function cancelPlaybackAnimation() {
  if (playbackAnimationFrame !== undefined) cancelAnimationFrame(playbackAnimationFrame);
  playbackAnimationFrame = undefined;
  playbackLastTimestamp = undefined;
}

function playbackLayerLabel(trace: Trace, stroke: Stroke | undefined): string {
  if (!stroke) return '開始前';
  return trace.layerDefinitions.find((definition) => definition.id === stroke.layerId)?.label ?? stroke.layerId;
}

function updatePlaybackView() {
  if (!playbackTrace || !playbackGeometry) return;
  const total = playbackTrace.strokes.length;
  const cursor = clampPlaybackCursor(playbackState.cursor, total);
  const stroke = playbackStrokeAt(playbackTrace.strokes, cursor);
  const display = playbackLayout && stroke ? playbackStrokeDisplay(playbackLayout, stroke) : undefined;
  const isRomaji = playbackLayout?.romajiTable !== undefined;
  const windowSize = playbackOptions?.windowSize ?? ctx.getUiState().conditions.defaults.windowSize;
  const activeKeys = new Set(stroke?.presses.flatMap((press) => press.keys.map((key) => key.id)) ?? []);
  const triggerKeys = new Set(stroke?.triggerKeys ?? []);
  const fingerPositionKeys = ctx.getUiState().ui.playback.showFingers
    ? playbackFingerPositionKeys(stroke, playbackGeometry)
    : new Map<string, Finger>();
  const trailKeys = ctx.getUiState().ui.playback.showTrail
    ? playbackTrailKeys(playbackTrace.strokes, cursor, ctx.getUiState().ui.playback.trailTau)
    : new Map<string, number>();
  const romajiPlannedKeys = isRomaji && ctx.getUiState().ui.playback.showRomajiPlan
    ? playbackRomajiPlannedKeys(playbackTrace.strokes, cursor)
    : new Map<string, number>();
  const plannedKeys = ctx.getUiState().ui.playback.showPlanKeys
    ? playbackPlannedKeys(playbackTrace.strokes, cursor, windowSize)
    : romajiPlannedKeys;
  const plannedOrders = ctx.getUiState().ui.playback.showOrderLabels
    ? ctx.getUiState().ui.playback.showPlanKeys
      ? playbackPlannedOrders(playbackTrace.strokes, cursor, windowSize)
      : ctx.getUiState().ui.playback.showRomajiPlan
        ? playbackRomajiPlannedOrders(playbackTrace.strokes, cursor)
        : new Map<string, number>()
    : new Map<string, number>();
  const trailOrders = ctx.getUiState().ui.playback.showOrderLabels && ctx.getUiState().ui.playback.showTrail
    ? playbackTrailOrders(playbackTrace.strokes, cursor, ctx.getUiState().ui.playback.trailTau)
    : new Map<string, number>();
  const dynamicDisplay = dynamicPlaybackDisplay(ctx.getUiState().ui.playback);
  const arpeggioTimings = cachedPlaybackArpeggioTimings();
  const chainOrders = ctx.getUiState().ui.playback.showChain
    ? playbackChainOrders(
      playbackTrace.strokes,
      cursor,
      ctx.getUiState().ui.playback.chainIncludeSameFinger,
      undefined,
      ctx.getUiState().ui.playback.chainIncludeLayerKeys,
    )
    : new Map<string, number>();
  const arpeggioOrders = ctx.getUiState().ui.playback.showArpeggio
    && ctx.getUiState().ui.playback.arpeggioEnabled
    ? playbackArpeggioOrders(
      playbackTrace.strokes,
      cursor,
      ctx.getUiState().conditions.defaults.arpeggio,
    )
    : new Map<string, number>();
  const sameFingerMotions = playbackState.sameFingerDelay
    ? playbackSameFingerKeyMotions(playbackTrace.strokes, cursor)
    : [];
  const sameFingerTargets = new Set(sameFingerMotions.flatMap((motion) => motion.toKeys));
  // 同指連続は同じ手でもあるため、両方を有効にすると同じキーへ2枚が重なる。
  // より具体的な同指側を優先し、片手連続はそれが拾わなかったキーだけを動かす。
  const handMotions = (ctx.getUiState().ui.playback.showChain
    ? playbackHandKeyMotions(
      playbackTrace.strokes,
      cursor,
      ctx.getUiState().ui.playback.chainIncludeSameFinger,
      ctx.getUiState().ui.playback.chainIncludeLayerKeys,
    )
    : []
  ).flatMap((motion) => {
    const toKeys = motion.toKeys.filter((key) => !sameFingerTargets.has(key));
    return toKeys.length === 0 ? [] : [{ ...motion, toKeys }];
  });
  const arpeggioMotions = (ctx.getUiState().ui.playback.showArpeggio
    && ctx.getUiState().ui.playback.arpeggioEnabled
    ? playbackArpeggioKeyMotions(
      playbackTrace.strokes,
      cursor,
      ctx.getUiState().conditions.defaults.arpeggio,
    )
    : []
  ).flatMap((motion) => {
    const toKeys = motion.toKeys.filter((key) => !sameFingerTargets.has(key));
    return toKeys.length === 0 ? [] : [{ ...motion, toKeys }];
  });
  // 起点と終点が同じキーなら動きが無く、クローンは描かれない。それでも
  // animatedKeys に入れてしまうと打鍵中の塗りだけが抑止されて空白になる。
  // 面が違えば同じ物理キーに別のかなが乗るため、かな配列では普通に起きる。
  const motions = [...sameFingerMotions, ...handMotions, ...arpeggioMotions].flatMap((motion) => {
    const toKeys = motion.toKeys.filter((key) => key !== motion.fromKey);
    return toKeys.length === 0 ? [] : [{ ...motion, toKeys }];
  });
  const animatedKeys = new Set(motions.flatMap((motion) => motion.toKeys));
  const repeatedKeys = playbackRepeatedKeys(playbackTrace.strokes, cursor);

  for (const key of elements.playback.querySelectorAll<SVGGElement>('[data-playback-key]')) {
    const id = key.dataset.playbackKey!;
    key.dataset.playbackActive = String(activeKeys.has(id) && !animatedKeys.has(id));
    key.dataset.playbackTrigger = String(triggerKeys.has(id));
    key.dataset.playbackRepeat = String(repeatedKeys.has(id));
    key.dataset.playbackFingerPosition = fingerPositionKeys.get(id) ?? '';
    const trailOpacity = trailKeys.get(id);
    key.dataset.playbackTrail = trailOpacity === undefined ? 'false' : 'true';
    if (trailOpacity === undefined) key.style.removeProperty('--playback-trail-opacity');
    else key.style.setProperty('--playback-trail-opacity', String(trailOpacity));
    const plannedOpacity = plannedKeys.get(id);
    key.dataset.playbackPlan = plannedOpacity === undefined ? 'false' : 'true';
    if (plannedOpacity === undefined) key.style.removeProperty('--playback-plan-opacity');
    else key.style.setProperty('--playback-plan-opacity', String(plannedOpacity));
    const plannedOrder = plannedOrders.get(id);
    const plannedOrderLabel = key.querySelector<SVGTextElement>('[data-playback-order="plan"]');
    if (plannedOrderLabel) {
      plannedOrderLabel.textContent = plannedOrder === undefined ? '' : playbackOrderLabel(plannedOrder);
      plannedOrderLabel.setAttribute('visibility', plannedOrder === undefined ? 'hidden' : 'visible');
    }
    const trailOrder = trailOrders.get(id);
    const trailOrderLabel = key.querySelector<SVGTextElement>('[data-playback-order="trail"]');
    if (trailOrderLabel) {
      trailOrderLabel.textContent = trailOrder === undefined ? '' : playbackOrderLabel(trailOrder);
      trailOrderLabel.setAttribute('visibility', trailOrder === undefined ? 'hidden' : 'visible');
    }
    const chainOrder = chainOrders.get(id);
    const chainOrderLabel = key.querySelector<SVGTextElement>('[data-playback-order="chain"]');
    if (chainOrderLabel) {
      chainOrderLabel.textContent = chainOrder === undefined ? '' : String(chainOrder);
      chainOrderLabel.setAttribute('visibility', chainOrder === undefined ? 'hidden' : 'visible');
    }
    key.dataset.playbackChain = chainOrder === undefined ? 'false' : 'true';
    const arpeggioOrder = arpeggioOrders.get(id);
    const arpeggioOrderLabel = key.querySelector<SVGTextElement>('[data-playback-order="arpeggio"]');
    if (arpeggioOrderLabel) {
      arpeggioOrderLabel.textContent = arpeggioOrder === undefined ? '' : String(arpeggioOrder);
      arpeggioOrderLabel.setAttribute('visibility', arpeggioOrder === undefined ? 'hidden' : 'visible');
    }
    key.dataset.playbackArpeggio = arpeggioOrder === undefined ? 'false' : 'true';
    const label = key.querySelector<SVGTextElement>('[data-playback-label]');
    if (label) label.textContent = display?.keyLabels.get(id) ?? key.dataset.playbackBaseLabel ?? '';
  }

  // クローンは cloneNode で盤面のキーを丸ごと写すため、刻印を今のステップへ
  // 更新し終えてから作る。先に作ると前のレイヤーの文字を持ったまま移動する。
  if (cursor !== playbackMotionCursor) {
    renderPlaybackMotions(motions, cursor, stroke);
    playbackMotionCursor = cursor;
    triggerPlaybackRepeatFlash(repeatedKeys);
  }

  const position = elements.playback.querySelector<HTMLElement>('[data-playback-position]');
  const current = elements.playback.querySelector<HTMLElement>('[data-playback-current]');
  const romaji = elements.playback.querySelector<HTMLElement>('[data-playback-romaji]');
  const kana = elements.playback.querySelector<HTMLElement>('[data-playback-kana]');
  const typed = elements.playback.querySelector<HTMLElement>('[data-playback-typed]');
  const history = elements.playback.querySelector<HTMLElement>('[data-playback-history]');
  const historyText = elements.playback.querySelector<HTMLElement>('[data-playback-history-text]');
  const rateChart = elements.playback.querySelector<HTMLElement>('[data-playback-rate-chart]');
  const planned = elements.playback.querySelector<HTMLElement>('[data-playback-planned]');
  const layer = elements.playback.querySelector<HTMLElement>('[data-playback-layer]');
  const seek = elements.playback.querySelector<HTMLInputElement>('[data-playback-seek]');
  const toggle = elements.playback.querySelector<HTMLButtonElement>('[data-playback-action="toggle"]');
  const stop = elements.playback.querySelector<HTMLButtonElement>('[data-playback-action="stop"]');
  const back = elements.playback.querySelector<HTMLButtonElement>('[data-playback-action="back"]');
  const forward = elements.playback.querySelector<HTMLButtonElement>('[data-playback-action="forward"]');
  const fingers = elements.playback.querySelector<HTMLInputElement>('[data-playback-fingers]');
  const planKeys = elements.playback.querySelector<HTMLInputElement>('[data-playback-plan-keys]');
  const trail = elements.playback.querySelector<HTMLInputElement>('[data-playback-trail]');
  const trailTau = elements.playback.querySelector<HTMLInputElement>('[data-playback-trail-tau]');
  const orderLabels = elements.playback.querySelector<HTMLInputElement>('[data-playback-order-labels]');
  const scale = elements.playback.querySelector<HTMLInputElement>('input[data-playback-scale]');
  const sameFingerDelay = elements.playback.querySelector<HTMLInputElement>('[data-playback-sfb-delay]');
  const chain = elements.playback.querySelector<HTMLInputElement>('[data-playback-chain]');
  const chainSameFinger = elements.playback.querySelector<HTMLInputElement>('[data-playback-chain-sfb]');
  const chainLayerKeys = elements.playback.querySelector<HTMLInputElement>('[data-playback-chain-layer]');
  const calibration = elements.playback.querySelector<HTMLInputElement>('[data-playback-calibration]');
  const arpeggioEnabled = elements.playback.querySelector<HTMLInputElement>('[data-playback-arpeggio-enabled]');
  const arpeggioPreset = elements.playback.querySelector<HTMLSelectElement>('[data-playback-arpeggio-preset]');
  const arpeggioDelay = elements.playback.querySelector<HTMLSelectElement>('[data-playback-arpeggio-delay]');
  const showArpeggio = elements.playback.querySelector<HTMLInputElement>('[data-playback-arpeggio]');
  const rate = elements.playback.querySelector<HTMLInputElement>('input[data-playback-rate]');
  const multiplier = elements.playback.querySelector<HTMLInputElement>('input[data-playback-multiplier]');
  const effectiveKanaRate = elements.playback.querySelector<HTMLElement>('[data-playback-effective-kana-rate]');
  const effectiveRate = elements.playback.querySelector<HTMLElement>('[data-playback-effective-rate]');
  const playbackWindow = elements.playback.querySelector<HTMLOutputElement>('[data-playback-window]');
  const settingsSummary = elements.playback.querySelector<HTMLElement>('[data-playback-settings-summary]');
  if (position) position.textContent = `${cursor} / ${total} ステップ`;
  const inputPreview = playbackInputPreview(
    playbackTrace.strokes,
    cursor,
    windowSize,
  );
  if (current) {
    current.hidden = isRomaji;
    current.textContent = stroke
      ? display?.character ?? (stroke.triggerKeys.length > 0 ? '⇧' : stroke.char)
      : '—';
  }
  if (romaji) romaji.hidden = !isRomaji;
  if (kana) {
    kana.textContent = isRomaji
      ? inputPreview.find((segment) => segment.kind === 'current')?.text ?? '—'
      : stroke?.inputChar ?? '—';
  }
  if (typed) typed.textContent = stroke?.char ?? '—';
  const plan = isRomaji
    ? playbackRomajiPlan(playbackTrace.strokes, cursor)
    : undefined;
  if (planned) {
    planned.hidden = plan === undefined;
    planned.textContent = plan ? `予定: ${plan.planned}` : '';
  }
  if (history) history.hidden = inputPreview.length === 0;
  if (historyText) {
    historyText.replaceChildren();
    for (const segment of inputPreview) {
      const span = document.createElement('span');
      span.className = `playback-input-segment playback-input-${segment.kind}`;
      span.textContent = segment.text;
      if (segment.kind === 'current') span.setAttribute('aria-current', 'step');
      historyText.append(span);
    }
  }
  if (rateChart) {
    const chartSignature = JSON.stringify({
      stepsPerSecond: playbackState.stepsPerSecond,
      speedMultiplier: playbackState.speedMultiplier,
      sameFingerDelay: playbackState.sameFingerDelay,
      calibration: playbackState.calibration,
      arpeggio: playbackState.arpeggio,
      arpeggioDelayMode: playbackState.arpeggioDelayMode,
      dynamicDisplay,
      strokeCount: playbackTrace.strokes.length,
    });
    if (playbackRateChartSignature !== chartSignature) {
      rateChart.innerHTML = renderPlaybackRateChart(playbackRateChartData(
        playbackTrace.strokes,
        playbackState.stepsPerSecond,
        playbackState.sameFingerDelay,
        10,
        playbackState.calibration,
        playbackState.speedMultiplier,
        playbackState.arpeggio,
        playbackState.arpeggioDelayMode,
        arpeggioTimings,
      ), dynamicDisplay);
      playbackRateChartSignature = chartSignature;
    }
    updatePlaybackRateChartCursor(rateChart, cursor);
  }
  if (layer) layer.textContent = playbackLayerLabel(playbackTrace, stroke);
  if (seek) seek.value = String(cursor);
  if (toggle) {
    toggle.textContent = playbackState.playing ? '一時停止' : '再生';
    toggle.setAttribute('aria-label', playbackState.playing ? '再生を一時停止する' : '再生する');
    toggle.disabled = total === 0 || cursor >= total;
  }
  if (stop) stop.disabled = cursor === 0 && !playbackState.playing;
  if (back) back.disabled = playbackState.playing || cursor === 0;
  if (forward) forward.disabled = playbackState.playing || cursor >= total;
  if (fingers) fingers.checked = ctx.getUiState().ui.playback.showFingers;
  const romajiPlan = elements.playback.querySelector<HTMLInputElement>('[data-playback-romaji-plan]');
  if (romajiPlan) {
    romajiPlan.checked = ctx.getUiState().ui.playback.showRomajiPlan;
    romajiPlan.disabled = !isRomaji;
  }
  if (planKeys) {
    planKeys.checked = ctx.getUiState().ui.playback.showPlanKeys;
    planKeys.disabled = false;
  }
  if (trail) trail.checked = ctx.getUiState().ui.playback.showTrail;
  if (trailTau) trailTau.value = String(ctx.getUiState().ui.playback.trailTau);
  if (orderLabels) orderLabels.checked = ctx.getUiState().ui.playback.showOrderLabels;
  if (scale) scale.value = String(ctx.getUiState().ui.playback.scale);
  if (sameFingerDelay) sameFingerDelay.checked = playbackState.sameFingerDelay;
  if (chain) chain.checked = ctx.getUiState().ui.playback.showChain;
  if (showArpeggio) showArpeggio.checked = ctx.getUiState().ui.playback.showArpeggio;
  if (chainSameFinger) {
    chainSameFinger.checked = ctx.getUiState().ui.playback.chainIncludeSameFinger;
    chainSameFinger.disabled = !ctx.getUiState().ui.playback.showChain;
  }
  if (chainLayerKeys) {
    chainLayerKeys.checked = ctx.getUiState().ui.playback.chainIncludeLayerKeys;
    chainLayerKeys.disabled = !ctx.getUiState().ui.playback.showChain;
  }
  if (calibration) {
    calibration.checked = ctx.getUiState().ui.playback.useCalibration;
    calibration.disabled = ctx.getCalibration() === undefined;
  }
  const calibrationEditButton = elements.playback.querySelector<HTMLButtonElement>('[data-playback-action="calibration-edit"]');
  if (calibrationEditButton) {
    calibrationEditButton.disabled = false;
    calibrationEditButton.textContent = ctx.getCalibration() ? '保存値を確認・編集' : '個人速度を測定';
  }
  if (arpeggioEnabled) arpeggioEnabled.checked = ctx.getUiState().ui.playback.arpeggioEnabled;
  if (arpeggioPreset) arpeggioPreset.value = ctx.arpeggioPresetId();
  ctx.syncArpeggioConditionControls();
  if (arpeggioDelay) arpeggioDelay.value = ctx.getUiState().ui.playback.arpeggioDelayMode;
  if (rate) rate.value = String(playbackState.stepsPerSecond);
  if (multiplier) multiplier.value = String(playbackState.speedMultiplier);
  if (settingsSummary) {
    settingsSummary.textContent = `${playbackState.stepsPerSecond}ステップ/秒・${playbackState.speedMultiplier}倍・アルペジオ時間${ctx.getUiState().ui.playback.arpeggioEnabled ? 'ON' : 'OFF'}`;
  }
  const scope = elements.playback.querySelector<HTMLElement>('[data-playback-settings-scope]');
  if (scope) scope.textContent = ctx.isPlaybackLayoutOverride() ? `${playbackLayout?.name ?? 'この配列'}専用` : '共通設定';
  const scopeButton = elements.playback.querySelector<HTMLButtonElement>('[data-playback-layout-override]');
  if (scopeButton) {
    const override = ctx.isPlaybackLayoutOverride();
    scopeButton.dataset.playbackLayoutOverride = override ? 'disable' : 'enable';
    scopeButton.textContent = override ? '共通設定に戻す' : 'この配列専用にする';
  }
  if (effectiveKanaRate) {
    const value = playbackRecentKanaPerSecond(
      playbackTrace.strokes,
      cursor,
      playbackState.stepsPerSecond,
      playbackState.sameFingerDelay,
      10,
      playbackState.calibration,
      playbackState.speedMultiplier,
      playbackState.arpeggio,
      playbackState.arpeggioDelayMode,
      arpeggioTimings,
    );
    effectiveKanaRate.textContent = value === undefined
      ? '実効 — かな/秒'
      : `実効 ${value.toFixed(2)} かな/秒`;
  }
  if (effectiveRate) {
    const value = playbackRecentActionsPerSecond(
      playbackTrace.strokes,
      cursor,
      playbackState.stepsPerSecond,
      playbackState.sameFingerDelay,
      10,
      playbackState.calibration,
      playbackState.speedMultiplier,
      playbackState.arpeggio,
      playbackState.arpeggioDelayMode,
      arpeggioTimings,
    );
    effectiveRate.textContent = value === undefined
      ? '実効 — アクション/秒'
      : `実効 ${value.toFixed(2)} アクション/秒`;
  }
  if (playbackWindow) playbackWindow.textContent = String(windowSize);
}

function renderPlaybackSvg(layout: Layout, geometry: ReturnType<typeof buildGeometry>): string {
  let maxX = 0;
  let maxY = 0;
  const keys = [...geometry.keys.values()].map((key) => {
    const thumb = key.row === THUMB_ROW;
    const width = (thumb ? PLAYBACK_THUMB_WIDTH : 1) * PLAYBACK_KEY;
    const x = (key.x - (thumb ? (PLAYBACK_THUMB_WIDTH - 1) / 2 : 0)) * PLAYBACK_KEY;
    const y = key.y * PLAYBACK_KEY;
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + PLAYBACK_KEY);
    const label = layout.legends.get(key.id) ?? '';
    const fontSize = thumb ? 10 : label.length > 3 ? 9 : 12;
    const tip = `${escapeText(label || key.id)} <span style="color:var(--muted)">(${key.id})</span><br>${escapeText(FINGER_LABEL[key.finger])}`;
    return `<g data-tip="${escapeAttr(tip)}" data-playback-key="${escapeAttr(key.id)}" data-playback-finger="${key.finger}" data-playback-base-label="${escapeAttr(label)}" data-playback-active="false" data-playback-trigger="false" data-playback-finger-position="" data-playback-plan="false">
      <rect x="${x + 1}" y="${y + 1}" width="${width - 2}" height="${PLAYBACK_KEY - 2}" rx="5" fill="var(--panel)" stroke="var(--line)"/>
      <rect data-playback-repeat-flash x="${x + 1}" y="${y + 1}" width="${width - 2}" height="${PLAYBACK_KEY - 2}" rx="5" fill="var(--panel)" opacity="0" pointer-events="none"/>
      <text class="playback-order playback-order-plan" data-playback-order="plan" x="${x + 7}" y="${y + 10}" text-anchor="middle" visibility="hidden"> </text>
      <text class="playback-order playback-order-trail" data-playback-order="trail" x="${x + width - 7}" y="${y + 10}" text-anchor="middle" visibility="hidden"> </text>
      <text class="playback-order playback-order-chain" data-playback-order="chain" x="${x + width / 2}" y="${y + PLAYBACK_KEY - 5}" text-anchor="middle" visibility="hidden"> </text>
      <text class="playback-order playback-order-arpeggio" data-playback-order="arpeggio" x="${x + width / 2}" y="${y + 11}" text-anchor="middle" visibility="hidden"> </text>
      <text class="playback-key-label" data-playback-label x="${x + width / 2}" y="${y + PLAYBACK_KEY / 2 + 4}" text-anchor="middle" font-size="${fontSize}" fill="var(--fg)" pointer-events="none">${escapeText(label)}</text>
    </g>`;
  });
  const W = maxX + PLAYBACK_PAD;
  const H = maxY + PLAYBACK_PAD;
  return `<svg viewBox="0 0 ${W} ${H}" width="${W * ctx.getUiState().ui.playback.scale}" height="${H * ctx.getUiState().ui.playback.scale}" role="img"
    aria-label="${escapeAttr(`${layout.name}の打鍵再生`)}">${keys.join('')}<g data-playback-motion-layer aria-hidden="true"></g></svg>`;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function renderPlaybackMotions(
  motions: readonly ReturnType<typeof playbackSameFingerKeyMotions>[number][],
  cursor: number,
  stroke: Stroke | undefined,
) {
  const layer = elements.playback.querySelector<SVGGElement>('[data-playback-motion-layer]');
  if (!layer) return;
  layer.replaceChildren();
  if (!stroke || motions.length === 0) return;

  const sourceKeys = new Map<string, SVGGElement>();
  for (const key of elements.playback.querySelectorAll<SVGGElement>('[data-playback-key]')) {
    sourceKeys.set(key.dataset.playbackKey!, key);
  }
  const durationMs = Math.max(
    150,
    Math.min(1500, playbackStrokeDurationMs(
      stroke,
      playbackState.stepsPerSecond,
      playbackState.sameFingerDelay,
      playbackState.calibration,
      playbackTrace?.strokes[cursor - 2],
      playbackState.speedMultiplier,
    )),
  );
  let motionIndex = 0;
  for (const motion of motions) {
    const from = sourceKeys.get(motion.fromKey);
    if (!from) continue;
    const fromRect = from.querySelector<SVGRectElement>('rect');
    if (!fromRect) continue;
    for (const toKeyId of motion.toKeys) {
      const to = sourceKeys.get(toKeyId);
      const toRect = to?.querySelector<SVGRectElement>('rect');
      if (!to || !toRect) continue;
      const dx = Number(fromRect.getAttribute('x')) - Number(toRect.getAttribute('x'));
      const dy = Number(fromRect.getAttribute('y')) - Number(toRect.getAttribute('y'));
      if (dx === 0 && dy === 0) continue;
      const clone = to.cloneNode(true) as SVGGElement;
      clone.removeAttribute('data-playback-key');
      clone.removeAttribute('data-playback-base-label');
      clone.setAttribute('data-playback-motion-key', `${cursor}-${motionIndex++}`);
      clone.setAttribute('transform', `translate(${dx} ${dy})`);
      clone.style.pointerEvents = 'none';
      const animation = document.createElementNS(SVG_NS, 'animateTransform');
      animation.setAttribute('attributeName', 'transform');
      animation.setAttribute('type', 'translate');
      // animateTransform の from/to は type で指定した変換関数の「引数だけ」を書く。
      // translate(...) と関数名を付けると不正値として無視され、静的な transform 属性
      // （＝移動元）が残ったままアニメーションが一切適用されない。
      animation.setAttribute('from', `${dx} ${dy}`);
      animation.setAttribute('to', '0 0');
      animation.setAttribute('dur', `${durationMs}ms`);
      animation.setAttribute('fill', 'freeze');
      // begin既定値の0sはDOM挿入時ではなくSVGドキュメントのタイムライン基準の0秒を指す。
      // 再生パネルのSVGは描画時点からタイムラインが進み続けているため、
      // 再生が進んだ後にクローンを挿入するとbegin=0sは既に過去になっており、
      // fill="freeze"によって終了状態（translate(0 0)）へ張り付いた状態で出現してしまう。
      // indefiniteにして挿入後にbeginElement()を呼び、挿入時点を起点に明示的に開始させる。
      animation.setAttribute('begin', 'indefinite');
      clone.append(animation);
      layer.append(clone);
      // SMIL未対応環境ではbeginElementが存在しない、または呼び出しが例外を投げうる。
      // アニメーションが始まらないだけに留め、再生全体を壊さないようtry/catchで防御する。
      const animatable = animation as SVGAnimationElement & { beginElement?: () => void };
      let started = false;
      if (typeof animatable.beginElement === 'function') {
        try {
          animatable.beginElement();
          started = true;
        } catch {
          started = false;
        }
      }
      // 開始できなければ begin='indefinite' のまま永久に走らないため、クローンは
      // 移動元の位置に幽霊として残る。表示しない方が縮退として素直なので捨てる。
      if (!started) clone.remove();
    }
  }
}

/**
 * 連打キーの上に重ねたオーバーレイ矩形をWeb Animations APIで光らせる。
 *
 * CSSアニメーションでdata属性を付け替える方式だと、連打2回目以降は属性値が
 * 「true」のまま変わらないため再生し直されない（過去にこれで踏んだ）。
 * element.animate()は呼ぶたびに新しいAnimationを作るので、毎ステップ確実に
 * 発火し直せる。`fill`（塗り）はアクティブキーの表示に使っているため触らず、
 * 別のoverlay要素のopacityだけを動かして「今どこを打っているか」を壊さない。
 *
 * overlayの色は地の色（--panel）。連打しているキーは必ず打鍵中でもあり
 * --accent で塗られているので、accentを重ねても同色同士で見た目が変わらない。
 * 地の色へ一瞬抜くことで、押されたままのキーでも打ち直しが読み取れる。
 */
function triggerPlaybackRepeatFlash(repeatedKeys: ReadonlySet<string>) {
  if (repeatedKeys.size === 0) return;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  for (const id of repeatedKeys) {
    const overlay = elements.playback.querySelector<SVGRectElement>(
      `[data-playback-key="${CSS.escape(id)}"] [data-playback-repeat-flash]`,
    );
    if (!overlay) continue;
    if (reducedMotion) {
      // 動きを止める代わりに、瞬間的な不透明化で「打った」だけは伝える。
      overlay.style.opacity = '0.5';
      overlay.style.transition = 'opacity 120ms ease-out';
      requestAnimationFrame(() => { overlay.style.opacity = '0'; });
      continue;
    }
    overlay.getAnimations().forEach((animation) => animation.cancel());
    overlay.animate(
      [{ opacity: 0.6 }, { opacity: 0 }],
      { duration: 220, easing: 'ease-out' },
    );
  }
}

function rerenderPlaybackFigure() {
  if (!playbackLayout || !playbackGeometry) return;
  const figure = elements.playback.querySelector<HTMLElement>('.playback-figure');
  if (figure) {
    figure.innerHTML = renderPlaybackSvg(playbackLayout, playbackGeometry);
    playbackMotionCursor = -1;
  }
}

function renderPlayback(
  trace: Trace,
  layout: Layout,
  geometry: ReturnType<typeof buildGeometry>,
  options: Options,
) {
  cancelPlaybackAnimation();
  playbackTrace = trace;
  playbackGeometry = geometry;
  playbackLayout = layout;
  playbackOptions = options;
  playbackState = createPlaybackState(
    ctx.getUiState().ui.playback.stepsPerSecond,
    ctx.getUiState().ui.playback.sameFingerDelay,
    ctx.getUiState().ui.playback.useCalibration ? ctx.getCalibration() : undefined,
    ctx.getUiState().ui.playback.speedMultiplier,
    ctx.getUiState().ui.playback.arpeggioEnabled ? ctx.getUiState().conditions.defaults.arpeggio : undefined,
    ctx.getUiState().ui.playback.arpeggioDelayMode,
  );
  playbackMotionCursor = -1;
  playbackSeekWasPlaying = undefined;
  playbackRateChartSignature = undefined;
  playbackArpeggioTimingCache = undefined;
  elements.playback.innerHTML = `<details class="playback-panel"${ctx.getUiState().ui.panels.playback ? ' open' : ''}>
    <summary><span class="playback-summary-icon" aria-hidden="true">▶</span><span>打鍵再生</span><span class="playback-summary-hint">クリックして開く</span></summary>
    <div class="playback-body">
      <div class="playback-head">
        <button type="button" class="secondary playback-setting-button" data-playback-settings-open>
          <span>再生設定</span><small data-playback-settings-summary>—</small>
        </button>
      </div>
      <dialog class="playback-settings-dialog" data-playback-settings-dialog>
        <form method="dialog">
          <div class="dialog-head">
            <h2>打鍵再生の設定</h2>
            <button type="submit" value="cancel" class="ghost close">閉じる</button>
          </div>
          <div class="playback-settings-scope">
            <span>適用先: <strong data-playback-settings-scope>${ctx.isPlaybackLayoutOverride() ? `${escapeText(layout.name)}専用` : '共通設定'}</strong></span>
            <button type="button" class="ghost" data-playback-layout-override="${ctx.isPlaybackLayoutOverride() ? 'disable' : 'enable'}">${ctx.isPlaybackLayoutOverride() ? '共通設定に戻す' : 'この配列専用にする'}</button>
            <small>配列固有にすると、この配列を表示したときだけ設定を使います。</small>
          </div>
          <div class="playback-settings-tabs" role="tablist" aria-label="打鍵再生設定の分類">
            <button type="button" class="playback-settings-tab" role="tab" aria-selected="true" aria-controls="playback-settings-display" data-playback-settings-tab="display">キーボード表示</button>
            <button type="button" class="playback-settings-tab" role="tab" aria-selected="false" aria-controls="playback-settings-conditions" data-playback-settings-tab="conditions">シミュレーション条件</button>
            <button type="button" class="playback-settings-tab" role="tab" aria-selected="false" aria-controls="playback-settings-timeline" data-playback-settings-tab="timeline">タイムライン表示</button>
          </div>
          <section id="playback-settings-display" class="playback-settings-panel" role="tabpanel" data-playback-settings-panel="display">
            <p class="note">キーボード画面に重ねる情報を設定します。変更はすぐに反映されます。</p>
            <div class="playback-dialog-grid">
              <label class="playback-finger-toggle"><input type="checkbox" data-playback-fingers${ctx.getUiState().ui.playback.showFingers ? ' checked' : ''} />指の位置を色で表示</label>
              <label class="playback-finger-toggle"><input type="checkbox" data-playback-romaji-plan${ctx.getUiState().ui.playback.showRomajiPlan ? ' checked' : ''} />予定ローマ字の盤面表示</label>
              <label class="playback-finger-toggle"><input type="checkbox" data-playback-plan-keys${ctx.getUiState().ui.playback.showPlanKeys ? ' checked' : ''} />押下予定キーを表示</label>
              <div class="playback-window-setting" title="選択中の配列に適用される窓幅N">N <output data-playback-window>${options.windowSize}</output> ステップ</div>
              <label class="playback-finger-toggle"><input type="checkbox" data-playback-trail${ctx.getUiState().ui.playback.showTrail ? ' checked' : ''} />押下履歴を残す</label>
              <label class="playback-range-setting" title="押下履歴を残すステップ数">τ <input type="number" data-playback-trail-tau min="1" max="20" step="1" value="${ctx.getUiState().ui.playback.trailTau}" aria-label="押下履歴のステップ数" /> ステップ</label>
              <label class="playback-finger-toggle"><input type="checkbox" data-playback-order-labels${ctx.getUiState().ui.playback.showOrderLabels ? ' checked' : ''} />順番ラベルを表示</label>
              <label class="playback-finger-toggle"><input type="checkbox" data-playback-chain${ctx.getUiState().ui.playback.showChain ? ' checked' : ''} />チェーンの動的表示</label>
              <label class="playback-finger-toggle"><input type="checkbox" data-playback-chain-sfb${ctx.getUiState().ui.playback.chainIncludeSameFinger ? ' checked' : ''}${ctx.getUiState().ui.playback.showChain ? '' : ' disabled'} />チェーンに同指連続を含める</label>
              <label class="playback-finger-toggle"><input type="checkbox" data-playback-chain-layer${ctx.getUiState().ui.playback.chainIncludeLayerKeys ? ' checked' : ''}${ctx.getUiState().ui.playback.showChain ? '' : ' disabled'} />チェーンにレイヤーキーを含める</label>
              <label class="playback-finger-toggle"><input type="checkbox" data-playback-arpeggio${ctx.getUiState().ui.playback.showArpeggio ? ' checked' : ''} />アルペジオの動的表示</label>
              <label class="playback-scale-setting" title="0.5〜4倍。上下キーは1倍刻みで、数値を直接入力できます">配列図 <input type="number" data-playback-scale min="${PLAYBACK_SCALE_MIN}" max="${PLAYBACK_SCALE_MAX}" step="1" value="${ctx.getUiState().ui.playback.scale}" aria-label="配列図の表示倍率" /> 倍</label>
            </div>
          </section>
          <section id="playback-settings-conditions" class="playback-settings-panel" role="tabpanel" data-playback-settings-panel="conditions" hidden>
            <p class="note">再生時間とアルペジオ判定の計算方法を設定します。変更は実効速度と再生の進み方に反映されます。</p>
            <div class="playback-dialog-grid">
              <label class="playback-speed"><span>標準速度</span><input type="number" data-playback-rate min="${PLAYBACK_STEPS_PER_SECOND_MIN}" max="${PLAYBACK_STEPS_PER_SECOND_MAX}" step="any" value="${playbackState.stepsPerSecond}" aria-label="再生の標準速度（ステップ毎秒）" /> <span>ステップ/秒</span></label>
              <label class="playback-finger-toggle" title="同じ指の連続打鍵に指の移動速度を反映。個人速度が無ければ距離に比例した簡易換算で代用"><input type="checkbox" data-playback-sfb-delay${playbackState.sameFingerDelay ? ' checked' : ''} />指の移動速度を考慮</label>
              <label class="playback-finger-toggle" title="キャリブレーションした通常速度・同手別指速度・指移動速度を再生へ反映"><input type="checkbox" data-playback-calibration${ctx.getUiState().ui.playback.useCalibration ? ' checked' : ''}${ctx.getCalibration() ? '' : ' disabled'} />個人速度を適用</label>
              <button type="button" class="ghost" data-playback-action="calibration-edit">${ctx.getCalibration() ? '保存値を確認・編集' : '個人速度を測定'}</button>
            </div>
            <label class="playback-select-setting">アルペジオ判定プリセット <select data-playback-arpeggio-preset aria-label="アルペジオ判定プリセット">
              <option value="standard"${ctx.arpeggioPresetId() === 'standard' ? ' selected' : ''}>標準</option>
              <option value="strict"${ctx.arpeggioPresetId() === 'strict' ? ' selected' : ''}>厳格</option>
              <option value="loose"${ctx.arpeggioPresetId() === 'loose' ? ' selected' : ''}>緩い</option>
              <option value="custom"${ctx.arpeggioPresetId() === 'custom' ? ' selected' : ''} disabled>カスタム</option>
            </select></label>
            <details class="playback-arpeggio-details" data-playback-arpeggio-conditions>
              <summary>アルペジオ判定の詳細</summary>
              <label>横の開き <input type="number" min="0" max="20" step="0.1" data-playback-arpeggio-condition="minHorizontalSpread" aria-label="アルペジオの最小横開き" /> u</label>
              <label>折り返し振幅 <input type="number" min="0" max="10" step="1" data-playback-arpeggio-condition="maxRowReversal" placeholder="無制限" aria-label="アルペジオの折り返し振幅上限" /></label>
              <label>1遷移の行差 <input type="number" min="0" max="10" step="1" data-playback-arpeggio-condition="maxRowStep" placeholder="無制限" aria-label="アルペジオの1遷移の行差上限" /></label>
              <label><input type="checkbox" data-playback-arpeggio-condition="includeThumb" />出力親指を含める</label>
              <label><input type="checkbox" data-playback-arpeggio-condition="breakOnOppositeHand" />逆手同時押しで区切る</label>
            </details>
            <label class="playback-select-setting">アルペジオ遅延の配置 <select data-playback-arpeggio-delay aria-label="アルペジオ遅延の配置">
              <option value="before"${ctx.getUiState().ui.playback.arpeggioDelayMode === 'before' ? ' selected' : ''}>塊の手前</option>
              <option value="distributed"${ctx.getUiState().ui.playback.arpeggioDelayMode === 'distributed' ? ' selected' : ''}>各ステップへ分散</option>
            </select></label>
            <label class="playback-speed playback-speed-final"><span>再生倍率</span><input type="number" data-playback-multiplier min="${PLAYBACK_SPEED_MULTIPLIER_MIN}" max="${PLAYBACK_SPEED_MULTIPLIER_MAX}" step="any" value="${playbackState.speedMultiplier}" aria-label="再生速度の倍率" /> <span>倍</span></label>
          </section>
          <section id="playback-settings-timeline" class="playback-settings-panel" role="tabpanel" data-playback-settings-panel="timeline" hidden>
            <p class="note">タイムラインの進み方に関わる設定です。現在はアルペジオ時間だけを扱います。</p>
            <label class="playback-finger-toggle" title="アルペジオ区間の間隔を再生時間へ反映"><input type="checkbox" data-playback-arpeggio-enabled${ctx.getUiState().ui.playback.arpeggioEnabled ? ' checked' : ''} />アルペジオ時間</label>
          </section>
        </form>
      </dialog>
      <div class="playback-controls" role="group" aria-label="打鍵再生の操作">
        <button type="button" class="ghost" data-playback-action="back">1 ステップ戻る</button>
        <button type="button" data-playback-action="toggle" aria-label="再生する">再生</button>
        <button type="button" class="secondary" data-playback-action="stop" disabled>停止</button>
        <button type="button" class="ghost" data-playback-action="forward">1 ステップ進む</button>
        <span class="playback-position" aria-live="polite" data-playback-position>0 / ${trace.strokes.length} ステップ</span>
        <span class="playback-effective-rates"><span class="playback-effective-kana-rate" data-playback-effective-kana-rate>実効 — かな/秒</span><span class="playback-effective-rate" data-playback-effective-rate>実効 — アクション/秒</span></span>
      </div>
      <label class="playback-seek"><span>再生位置</span><input type="range" data-playback-seek min="0" max="${trace.strokes.length}" step="1" value="0" /></label>
      <div class="playback-status" aria-live="polite">
        <div class="playback-status-line">
          <span class="playback-current" data-playback-current>—</span>
          <span class="playback-romaji" data-playback-romaji hidden><span class="playback-current" data-playback-kana>—</span><span class="playback-typed">打鍵: <code data-playback-typed>—</code><span class="playback-planned" data-playback-planned hidden></span></span></span>
          <span class="playback-attribution">帰属: <b data-playback-layer>開始前</b></span>
        </div>
        <div class="playback-history" data-playback-history hidden>
          <span class="playback-history-label">入力:</span>
          <span data-playback-history-text></span>
        </div>
      </div>
      <details class="playback-rate-chart-panel"${ctx.getUiState().ui.panels.playbackRateChart ? ' open' : ''}>
        <summary>かな/秒・アクション/秒の推移</summary>
        <div class="playback-rate-chart" data-playback-rate-chart></div>
      </details>
      <div class="fig-fixed playback-figure">${renderPlaybackSvg(layout, geometry)}</div>
    </div>
  </details>`;
  updatePlaybackView();
}

function startPlayback() {
  if (!playbackTrace || playbackState.cursor >= playbackTrace.strokes.length) return;
  cancelPlaybackAnimation();
  playbackState = { ...playbackState, playing: true, elapsedMs: 0 };
  updatePlaybackView();
  playbackAnimationFrame = requestAnimationFrame((timestamp) => playbackFrame(timestamp));
}

function pausePlayback() {
  cancelPlaybackAnimation();
  playbackState = { ...playbackState, playing: false };
  updatePlaybackView();
}

function stopPlayback() {
  cancelPlaybackAnimation();
  playbackState = createPlaybackState(
    playbackState.stepsPerSecond,
    playbackState.sameFingerDelay,
    ctx.getUiState().ui.playback.useCalibration ? ctx.getCalibration() : undefined,
    playbackState.speedMultiplier,
    ctx.getUiState().ui.playback.arpeggioEnabled ? ctx.getUiState().conditions.defaults.arpeggio : undefined,
    ctx.getUiState().ui.playback.arpeggioDelayMode,
  );
  playbackMotionCursor = -1;
  updatePlaybackView();
}

function syncPlaybackStateFromSettings(): void {
  const settings = ctx.getPlaybackSettings();
  const cursor = playbackTrace
    ? clampPlaybackCursor(playbackState.cursor, playbackTrace.strokes.length)
    : 0;
  cancelPlaybackAnimation();
  playbackState = createPlaybackState(
    settings.stepsPerSecond,
    settings.sameFingerDelay,
    settings.useCalibration ? ctx.getCalibration() : undefined,
    settings.speedMultiplier,
    settings.arpeggioEnabled ? ctx.getArpeggioConditions() : undefined,
    settings.arpeggioDelayMode,
  );
  playbackState = { ...playbackState, cursor };
  playbackMotionCursor = -1;
  playbackRateChartSignature = undefined;
  playbackArpeggioTimingCache = undefined;
}

function playbackFrame(timestamp: number) {
  playbackAnimationFrame = undefined;
  if (!playbackState.playing || !playbackTrace) return;
  if (playbackLastTimestamp === undefined) playbackLastTimestamp = timestamp;
  else {
    playbackState = advancePlayback(
      playbackState,
      timestamp - playbackLastTimestamp,
      playbackTrace.strokes,
    );
    playbackLastTimestamp = timestamp;
    updatePlaybackView();
  }
  if (playbackState.playing) playbackAnimationFrame = requestAnimationFrame((next) => playbackFrame(next));
  else playbackLastTimestamp = undefined;
}

function beginPlaybackSeek() {
  if (playbackSeekWasPlaying !== undefined) return;
  playbackSeekWasPlaying = playbackState.playing;
  if (playbackState.playing) pausePlayback();
}

function finishPlaybackSeek() {
  if (playbackSeekWasPlaying === undefined) return;
  const resume = playbackSeekWasPlaying;
  playbackSeekWasPlaying = undefined;
  if (resume) startPlayback();
}

function seekPlayback(value: string, playing = false) {
  if (!playbackTrace) return;
  playbackState = {
    ...playbackState,
    cursor: clampPlaybackCursor(Number(value), playbackTrace.strokes.length),
    elapsedMs: 0,
    playing,
  };
  updatePlaybackView();
}



  function setup(): void {
    elements.playback.addEventListener('toggle', (e) => {
      const details = e.target as HTMLDetailsElement;
      if (!(details instanceof HTMLDetailsElement)) return;
      if (details.classList.contains('playback-panel')) {
        ctx.updateUiState((draft) => { draft.ui.panels.playback = details.open; });
      } else if (details.classList.contains('playback-rate-chart-panel')) {
        ctx.updateUiState((draft) => { draft.ui.panels.playbackRateChart = details.open; });
      }
    }, true);
    elements.playback.addEventListener('click', (e) => {
      const rateCursor = (e.target as Element).closest<SVGElement>('[data-playback-rate-cursor]');
      if (rateCursor) {
        seekPlayback(rateCursor.getAttribute('data-playback-rate-cursor') ?? '0');
        return;
      }
      const settingsOpen = (e.target as Element).closest<HTMLButtonElement>('[data-playback-settings-open]');
      if (settingsOpen) {
        const dialog = elements.playback.querySelector<HTMLDialogElement>('[data-playback-settings-dialog]');
        if (dialog && !dialog.open) dialog.showModal();
        return;
      }
      const settingsTab = (e.target as Element).closest<HTMLButtonElement>('[data-playback-settings-tab]');
      if (settingsTab?.dataset.playbackSettingsTab) {
        const tabId = settingsTab.dataset.playbackSettingsTab;
        for (const tab of elements.playback.querySelectorAll<HTMLButtonElement>('[data-playback-settings-tab]')) {
          tab.setAttribute('aria-selected', String(tab === settingsTab));
        }
        for (const panel of elements.playback.querySelectorAll<HTMLElement>('[data-playback-settings-panel]')) {
          panel.hidden = panel.dataset.playbackSettingsPanel !== tabId;
        }
        return;
      }
      const layoutOverride = (e.target as Element).closest<HTMLButtonElement>('[data-playback-layout-override]');
      if (layoutOverride) {
        ctx.setPlaybackLayoutOverride(layoutOverride.dataset.playbackLayoutOverride === 'enable');
        syncPlaybackStateFromSettings();
        updatePlaybackView();
        return;
      }
      const target = (e.target as Element).closest<HTMLButtonElement>('button[data-playback-action]');
      if (!target) return;
      if (target.dataset.playbackAction === 'calibration') {
        ctx.openCalibration();
        return;
      }
      if (target.dataset.playbackAction === 'calibration-edit') {
        if (ctx.getCalibration()) ctx.openCalibrationEdit();
        else ctx.openCalibration();
        return;
      }
      switch (target.dataset.playbackAction) {
        case 'toggle': if (playbackState.playing) pausePlayback(); else startPlayback(); break;
        case 'stop': stopPlayback(); break;
        case 'back':
          if (!playbackTrace) return;
          playbackState = stepPlayback(playbackState, -1, playbackTrace.strokes.length);
          updatePlaybackView();
          break;
        case 'forward':
          if (!playbackTrace) return;
          playbackState = stepPlayback(playbackState, 1, playbackTrace.strokes.length);
          updatePlaybackView();
          break;
      }
    });
    elements.playback.addEventListener('submit', (e) => {
      const submitter = e.submitter;
      if (submitter instanceof HTMLButtonElement && submitter.value === 'cancel') return;
      e.preventDefault();
    });
    elements.playback.addEventListener('input', (e) => {
      const target = (e.target as Element).closest<HTMLInputElement>('input[data-playback-seek]');
      if (!target) return;
      beginPlaybackSeek(); seekPlayback(target.value);
    });
    elements.playback.addEventListener('pointerdown', (e) => {
      if ((e.target as Element).closest('input[data-playback-seek]')) beginPlaybackSeek();
    });
    elements.playback.addEventListener('pointerup', (e) => {
      if ((e.target as Element).closest('input[data-playback-seek]')) finishPlaybackSeek();
    });
    elements.playback.addEventListener('change', (e) => {
      const target = e.target as Element;
      const sameFingerDelay = target.closest<HTMLInputElement>('[data-playback-sfb-delay]');
      if (sameFingerDelay) {
        playbackState = setPlaybackSameFingerDelay(playbackState, sameFingerDelay.checked);
        ctx.updatePlaybackSetting('sameFingerDelay', sameFingerDelay.checked);
        playbackMotionCursor = -1; updatePlaybackView(); return;
      }
      const chain = target.closest<HTMLInputElement>('[data-playback-chain]');
      if (chain) { ctx.updatePlaybackSetting('showChain', chain.checked); updatePlaybackView(); return; }
      const showArpeggio = target.closest<HTMLInputElement>('[data-playback-arpeggio]');
      if (showArpeggio) { ctx.updatePlaybackSetting('showArpeggio', showArpeggio.checked); updatePlaybackView(); return; }
      const arpeggioEnabled = target.closest<HTMLInputElement>('[data-playback-arpeggio-enabled]');
      if (arpeggioEnabled) {
        ctx.updatePlaybackSetting('arpeggioEnabled', arpeggioEnabled.checked);
        playbackState = setPlaybackArpeggio(playbackState, arpeggioEnabled.checked ? ctx.getArpeggioConditions() : undefined, ctx.getUiState().ui.playback.arpeggioDelayMode);
        playbackRateChartSignature = undefined; updatePlaybackView(); return;
      }
      const arpeggioPreset = target.closest<HTMLSelectElement>('[data-playback-arpeggio-preset]');
      if (arpeggioPreset) {
        const preset = ARPEGGIO_PRESETS[arpeggioPreset.value];
        if (!preset) return;
        ctx.updateArpeggioConditions({ ...preset });
        playbackState = setPlaybackArpeggio(playbackState, ctx.getUiState().ui.playback.arpeggioEnabled ? ctx.getArpeggioConditions() : undefined, ctx.getUiState().ui.playback.arpeggioDelayMode);
        playbackMotionCursor = -1; playbackRateChartSignature = undefined; updatePlaybackView(); return;
      }
      if (target.closest('[data-playback-arpeggio-conditions]')) {
        const conditions = ctx.readArpeggioConditions();
        if (!conditions) { updatePlaybackView(); return; }
        ctx.updateArpeggioConditions(conditions);
        playbackState = setPlaybackArpeggio(playbackState, ctx.getUiState().ui.playback.arpeggioEnabled ? conditions : undefined, ctx.getUiState().ui.playback.arpeggioDelayMode);
        playbackMotionCursor = -1; playbackRateChartSignature = undefined; updatePlaybackView(); return;
      }
      const arpeggioDelay = target.closest<HTMLSelectElement>('[data-playback-arpeggio-delay]');
      if (arpeggioDelay && (arpeggioDelay.value === 'before' || arpeggioDelay.value === 'distributed')) {
        const mode = arpeggioDelay.value as 'before' | 'distributed';
        ctx.updatePlaybackSetting('arpeggioDelayMode', mode);
        playbackState = setPlaybackArpeggio(playbackState, ctx.getUiState().ui.playback.arpeggioEnabled ? ctx.getArpeggioConditions() : undefined, mode);
        playbackRateChartSignature = undefined; updatePlaybackView(); return;
      }
      const chainSameFinger = target.closest<HTMLInputElement>('[data-playback-chain-sfb]');
      if (chainSameFinger) { ctx.updatePlaybackSetting('chainIncludeSameFinger', chainSameFinger.checked); updatePlaybackView(); return; }
      const chainLayerKeys = target.closest<HTMLInputElement>('[data-playback-chain-layer]');
      if (chainLayerKeys) { ctx.updatePlaybackSetting('chainIncludeLayerKeys', chainLayerKeys.checked); playbackMotionCursor = -1; updatePlaybackView(); return; }
      const calibration = target.closest<HTMLInputElement>('[data-playback-calibration]');
      if (calibration) {
        ctx.updatePlaybackSetting('useCalibration', calibration.checked);
        playbackState = setPlaybackCalibration(playbackState, ctx.getUiState().ui.playback.useCalibration ? ctx.getCalibration() : undefined);
        updatePlaybackView(); return;
      }
      const rate = target.closest<HTMLInputElement>('input[data-playback-rate]');
      if (rate) {
        const value = Number(rate.value);
        if (Number.isFinite(value) && value >= PLAYBACK_STEPS_PER_SECOND_MIN && value <= PLAYBACK_STEPS_PER_SECOND_MAX) {
          playbackState = setPlaybackStepsPerSecond(playbackState, value as PlaybackStepsPerSecond);
          ctx.updatePlaybackSetting('stepsPerSecond', value);
        }
        updatePlaybackView(); return;
      }
      const multiplier = target.closest<HTMLInputElement>('input[data-playback-multiplier]');
      if (multiplier) {
        const value = Number(multiplier.value);
        if (Number.isFinite(value) && value >= PLAYBACK_SPEED_MULTIPLIER_MIN && value <= PLAYBACK_SPEED_MULTIPLIER_MAX) {
          playbackState = setPlaybackSpeedMultiplier(playbackState, value);
          ctx.updatePlaybackSetting('speedMultiplier', value);
        }
        updatePlaybackView(); return;
      }
      const fingers = target.closest<HTMLInputElement>('input[data-playback-fingers]');
      if (fingers) { ctx.updatePlaybackSetting('showFingers', fingers.checked); updatePlaybackView(); return; }
      const romajiPlan = target.closest<HTMLInputElement>('input[data-playback-romaji-plan]');
      if (romajiPlan) { ctx.updatePlaybackSetting('showRomajiPlan', romajiPlan.checked); updatePlaybackView(); return; }
      const planKeys = target.closest<HTMLInputElement>('input[data-playback-plan-keys]');
      if (planKeys) { ctx.updatePlaybackSetting('showPlanKeys', planKeys.checked); updatePlaybackView(); return; }
      const trail = target.closest<HTMLInputElement>('input[data-playback-trail]');
      if (trail) { ctx.updatePlaybackSetting('showTrail', trail.checked); updatePlaybackView(); return; }
      const trailTau = target.closest<HTMLInputElement>('input[data-playback-trail-tau]');
      if (trailTau) {
        const value = Number(trailTau.value);
        if (Number.isInteger(value) && value >= 1 && value <= 20) ctx.updatePlaybackSetting('trailTau', value);
        updatePlaybackView(); return;
      }
      const orderLabels = target.closest<HTMLInputElement>('input[data-playback-order-labels]');
      if (orderLabels) { ctx.updatePlaybackSetting('showOrderLabels', orderLabels.checked); updatePlaybackView(); return; }
      const scale = target.closest<HTMLInputElement>('input[data-playback-scale]');
      if (scale) {
        const value = Number(scale.value);
        if (Number.isFinite(value) && value >= PLAYBACK_SCALE_MIN && value <= PLAYBACK_SCALE_MAX) {
          ctx.updatePlaybackSetting('scale', value); rerenderPlaybackFigure(); updatePlaybackView();
        }
        return;
      }
      const seek = target.closest<HTMLInputElement>('input[data-playback-seek]');
      if (seek) {
        seekPlayback(seek.value, playbackState.playing);
        if (playbackSeekWasPlaying !== undefined) finishPlaybackSeek();
      }
    });
  }

  return {
    setup,
    render: renderPlayback,
    clear: () => {
      cancelPlaybackAnimation();
      playbackTrace = undefined; playbackGeometry = undefined; playbackLayout = undefined; playbackOptions = undefined;
      playbackArpeggioTimingCache = undefined;
      elements.playback.innerHTML = '';
    },
    update: updatePlaybackView,
    setCalibration: (calibration) => {
      playbackState = setPlaybackCalibration(playbackState, calibration);
      updatePlaybackView();
    },
    getGeometry: () => playbackGeometry,
    getLayout: () => playbackLayout,
  };
}
