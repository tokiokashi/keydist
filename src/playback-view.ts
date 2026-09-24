import { buildGeometry, THUMB_ROW, type Finger } from './geometry.ts';
import { visibleGeometryKeys } from './layout-physical-keys.ts';
import { type Options, type Stroke, type Trace } from './evaluate.ts';
import {
  advancePlayback, clampPlaybackCursor, createPlaybackState,
  playbackPreparedFingerPositionKeys, playbackInputPreview, playbackPlannedKeys,
  playbackPlannedOrders, playbackRomajiPlan, playbackRomajiPlannedKeys,
  playbackRomajiPlannedOrders, playbackOrderLabel, playbackRateChartData,
  playbackRecentActionsPerSecond, playbackRecentKanaPerSecond,
  playbackSameFingerKeyMotions,
  playbackStrokeAt, playbackStepDurationMs, playbackTimingSchedule, playbackTimingStepDurationMs, playbackCursorForEquivalentInputPosition, reconcilePlaybackStateAfterAnalysisRefresh, setPlaybackSameFingerDelay,
  setPlaybackStepsPerSecond, stepPlayback, playbackTrailKeys, playbackTrailOrders,
  playbackStrokeDisplay, setPlaybackCalibration, setPlaybackSpeedMultiplier,
  type PlaybackStepsPerSecond, type PlaybackState, type PlaybackTimingStep, PLAYBACK_SPEED_MULTIPLIER_MAX,
  PLAYBACK_SPEED_MULTIPLIER_MIN, PLAYBACK_STEPS_PER_SECOND_MAX,
  PLAYBACK_STEPS_PER_SECOND_MIN, PLAYBACK_RATE_WINDOW_MIN,
  PLAYBACK_RATE_WINDOW_MAX, PLAYBACK_RATE_HALF_LIFE_SECONDS_MIN,
  PLAYBACK_RATE_HALF_LIFE_SECONDS_MAX,
} from './playback.ts';
import { renderPlaybackRateChart, updatePlaybackRateChartCursor } from './playback-rate-chart.ts';
import { FINGER_LABEL, type AppElements } from './app-dom.ts';
import { escapeAttr, escapeText } from './chart.ts';
import type { Layout } from './layouts/index.ts';
import type { PlaybackCalibration } from './playback-calibration.ts';
import type {
  PlaybackKeyFeedbackStyle,
  UiPlaybackState,
  UiStateV1,
} from './ui-state.ts';
import type { AggregatedAnalysisResult } from './analysis-aggregate.ts';
import type { ChainPolicy } from './analysis-chain.ts';
import type { ArpeggioPolicy } from './analysis-arpeggio.ts';
import type {
  ActionRealizationPolicy,
  TriggerRealizationPolicy,
} from './core/semantic-input/index.ts';
import type { AnalyzerPlaybackSurfaceModel } from './analyzer-playback-surface-model.ts';
import type {
  AnalyzerPlaybackSettingsActions,
  AnalyzerPlaybackSettingsModel,
} from './analyzer-playback-settings-model.ts';
import {
  playbackAnalysisArpeggioMotions,
  playbackAnalysisArpeggioOrders,
  playbackAnalysisChainMotions,
  playbackAnalysisChainOrders,
  playbackRedirectWindows,
  playbackStrokeAnnotation,
  type PlaybackOrderSpan,
} from './playback-analysis-display.ts';

export interface PlaybackViewContext {
  el: AppElements;
  getUiState: () => UiStateV1;
  getPlaybackSettings: () => UiPlaybackState;
  updatePlaybackSetting: <K extends keyof UiPlaybackState>(key: K, value: UiPlaybackState[K]) => void;
  isPlaybackLayoutOverride: () => boolean;
  setPlaybackLayoutOverride: (enabled: boolean) => void;
  updateUiState: (change: (draft: UiStateV1) => void) => void;
  getCalibration: () => PlaybackCalibration | undefined;
  getChainPolicy: () => ChainPolicy;
  updateChainPolicy: (policy: ChainPolicy) => void;
  getArpeggioPolicy: () => ArpeggioPolicy;
  updateArpeggioPolicy: (policy: ArpeggioPolicy) => void;
  getTriggerRealizationPolicy: () => TriggerRealizationPolicy;
  updateTriggerRealizationPolicy: (policy: TriggerRealizationPolicy) => void;
  getActionRealizationPolicy: () => ActionRealizationPolicy;
  updateActionRealizationPolicy: (policy: ActionRealizationPolicy) => void;
  refreshAnalysis: () => void;
  openCalibration: () => void;
  openCalibrationEdit: () => void;
  surfaceModel: AnalyzerPlaybackSurfaceModel;
  settingsModel: AnalyzerPlaybackSettingsModel;
}

export type PlaybackPreserveMode = 'cursor' | 'input-position';

export interface PlaybackViewController {
  setup: () => void;
  render: (
    trace: Trace,
    layout: Layout,
    geometry: ReturnType<typeof buildGeometry>,
    options: Options,
    analysis: AggregatedAnalysisResult,
  ) => void;
  clear: () => void;
  update: () => void;
  preserveNextRender: (mode: PlaybackPreserveMode) => void;
  setCalibration: (calibration: PlaybackCalibration | undefined) => void;
  getGeometry: () => ReturnType<typeof buildGeometry> | undefined;
  getLayout: () => Layout | undefined;
  commitSurface: () => void;
  settingsActions: AnalyzerPlaybackSettingsActions;
}

export function createPlaybackView(ctx: PlaybackViewContext): PlaybackViewController {
  const elements = ctx.el;

const PLAYBACK_KEY = 30;
const PLAYBACK_PAD = 6;
const PLAYBACK_THUMB_WIDTH = 1.9;

type PlaybackDynamicDisplay = 'none' | 'chain' | 'arpeggio' | 'both';

function dynamicPlaybackDisplay(settings: UiPlaybackState): PlaybackDynamicDisplay {
  if (settings.showChainOnRateChart && settings.showArpeggioOnRateChart) return 'both';
  if (settings.showChainOnRateChart) return 'chain';
  if (settings.showArpeggioOnRateChart) return 'arpeggio';
  return 'none';
}

function displayedOrders(spans: readonly PlaybackOrderSpan[]): ReadonlyMap<string, number> {
  const orders = new Map<string, number>();
  for (const span of spans) {
    for (const [key, order] of span.orders) {
      if (!orders.has(key)) orders.set(key, order);
    }
  }
  return orders;
}

let playbackState: PlaybackState = createPlaybackState(
  ctx.getUiState().ui.playback.stepsPerSecond,
  ctx.getUiState().ui.playback.sameFingerDelay,
  ctx.getUiState().ui.playback.useCalibration ? ctx.getCalibration() : undefined,
  ctx.getUiState().ui.playback.speedMultiplier,
);
let playbackTrace: Trace | undefined;
let playbackAnalysis: AggregatedAnalysisResult | undefined;
let playbackGeometry: ReturnType<typeof buildGeometry> | undefined;
let playbackLayout: Layout | undefined;
let playbackOptions: Options | undefined;
let playbackAnimationFrame: number | undefined;
let playbackLastTimestamp: number | undefined;
let playbackSeekWasPlaying: boolean | undefined;
let playbackMotionCursor = -1;
let playbackFeedbackPending = false;
let playbackRateChartSignature: string | undefined;
let playbackTiming: readonly PlaybackTimingStep[] = [];
let playbackSettingsOpen = false;
let preserveStateOnNextRender: PlaybackPreserveMode | undefined;

function refreshPlaybackTiming(): void {
  const settings = ctx.getPlaybackSettings();
  playbackTiming = playbackAnalysis
    ? playbackTimingSchedule(
      playbackAnalysis,
      playbackState.stepsPerSecond,
      playbackState.sameFingerDelay,
      playbackState.calibration,
      playbackState.speedMultiplier,
      {
        allFingerMovementDelay: settings.allFingerMovementDelay && playbackGeometry !== undefined,
        geometry: playbackGeometry,
      },
    )
    : [];
  playbackRateChartSignature = undefined;
}

function setPlaybackSettingsOpen(open: boolean): void {
  playbackSettingsOpen = open;
  elements.app.classList.toggle('playback-settings-open', open);
  elements.playbackSettingsPanel.setAttribute('aria-hidden', String(!open));
  elements.playbackSettingsPanel.toggleAttribute('inert', !open);
  const trigger = elements.playback.querySelector<HTMLButtonElement>('[data-playback-settings-open]');
  trigger?.setAttribute('aria-expanded', String(open));
}

function publishPlaybackSettings(): void {
  if (!playbackLayout || !playbackOptions) {
    ctx.settingsModel.clear();
    return;
  }
  const state = ctx.getUiState();
  ctx.settingsModel.setData({
    layout: playbackLayout,
    options: playbackOptions,
    playback: structuredClone(state.ui.playback),
    rate: {
      playbackRateAverage: state.conditions.defaults.playbackRateAverage,
      playbackRateWindow: state.conditions.defaults.playbackRateWindow,
      playbackRateHalfLifeSeconds: state.conditions.defaults.playbackRateHalfLifeSeconds,
    },
    chainPolicy: structuredClone(ctx.getChainPolicy()),
    arpeggioPolicy: structuredClone(ctx.getArpeggioPolicy()),
    triggerRealization: structuredClone(ctx.getTriggerRealizationPolicy()),
    actionRealization: structuredClone(ctx.getActionRealizationPolicy()),
    layoutOverride: ctx.isPlaybackLayoutOverride(),
    calibrationAvailable: ctx.getCalibration() !== undefined,
  });
}

function cancelPlaybackAnimation() {
  if (playbackAnimationFrame !== undefined) cancelAnimationFrame(playbackAnimationFrame);
  playbackAnimationFrame = undefined;
  playbackLastTimestamp = undefined;
}

function playbackLayerLabel(trace: Trace, stroke: Stroke | undefined): string {
  if (!stroke) return '開始前';
  return trace.layerDefinitions.find((definition) => definition.id === stroke.aggregationGroupId)?.label ?? stroke.aggregationGroupId;
}

function updatePlaybackView() {
  if (!playbackTrace || !playbackGeometry || !playbackAnalysis) return;
  const total = playbackTrace.strokes.length;
  const cursor = clampPlaybackCursor(playbackState.cursor, total);
  const stroke = playbackStrokeAt(playbackTrace.strokes, cursor);
  const display = playbackLayout && stroke ? playbackStrokeDisplay(playbackLayout, stroke) : undefined;
  const isRomaji = playbackLayout?.romajiTable !== undefined;
  const windowSize = playbackOptions?.windowSize ?? ctx.getUiState().conditions.defaults.windowSize;
  const rateAverage = ctx.getUiState().conditions.defaults.playbackRateAverage;
  const rateWindow = ctx.getUiState().conditions.defaults.playbackRateWindow;
  const rateHalfLife = ctx.getUiState().conditions.defaults.playbackRateHalfLifeSeconds;
  const activeKeys = new Set(stroke?.presses.flatMap((press) => press.keys.map((key) => key.id)) ?? []);
  const triggerKeys = new Set(stroke?.triggerKeys ?? []);
  const fingerPositionKeys = ctx.getUiState().ui.playback.showFingers
    ? playbackPreparedFingerPositionKeys(
      playbackAnalysis,
      playbackTiming,
      cursor,
      playbackState.elapsedMs,
      playbackGeometry,
      ctx.getUiState().ui.playback.fingerPreparationSeconds,
      playbackState.stepsPerSecond,
      playbackState.calibration,
      playbackState.speedMultiplier,
    )
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
  const chainDisplays = ctx.getUiState().ui.playback.showChain
    ? playbackAnalysisChainOrders(playbackAnalysis, cursor)
    : [];
  const chainOrders = displayedOrders(chainDisplays);
  const arpeggioDisplays = ctx.getUiState().ui.playback.showArpeggio
    ? playbackAnalysisArpeggioOrders(playbackAnalysis, cursor)
    : [];
  const arpeggioOrders = displayedOrders(arpeggioDisplays);
  const sameFingerMotions = playbackState.sameFingerDelay
    && ctx.getUiState().ui.playback.showSameFingerMotion
    ? playbackSameFingerKeyMotions(playbackTrace.strokes, cursor)
    : [];
  const sameFingerTargets = new Set(sameFingerMotions.flatMap((motion) => motion.toKeys));
  const handMotions = (ctx.getUiState().ui.playback.showChain
    ? playbackAnalysisChainMotions(playbackAnalysis, cursor)
    : []
  ).flatMap((motion) => {
    const toKeys = motion.toKeys.filter((key) => !sameFingerTargets.has(key));
    return toKeys.length === 0 ? [] : [{ ...motion, toKeys }];
  });
  const arpeggioMotions = (ctx.getUiState().ui.playback.showArpeggio
    ? playbackAnalysisArpeggioMotions(playbackAnalysis, cursor)
    : []
  ).flatMap((motion) => {
    const toKeys = motion.toKeys.filter((key) => !sameFingerTargets.has(key));
    return toKeys.length === 0 ? [] : [{ ...motion, toKeys }];
  });
  // 起点と終点が同じキーなら動きが無く、クローンは描かれない。それでも
  // animatedKeys に入れてしまうと打鍵中の塗りだけが抑止されて空白になる。
  // 面が違えば同じ物理キーに別のかなが乗るため、かな配列では普通に起きる。
  const motions = [
    ...sameFingerMotions.map((motion) => ({ ...motion, kind: 'sameFinger' as const })),
    ...handMotions.map((motion) => ({ ...motion, kind: 'chain' as const })),
    ...arpeggioMotions.map((motion) => ({ ...motion, kind: 'chain' as const })),
  ].flatMap((motion) => {
    const toKeys = motion.toKeys.filter((key) => key !== motion.fromKey);
    return toKeys.length === 0 ? [] : [{ ...motion, toKeys }];
  });
  const animatedKeys = new Set(motions.flatMap((motion) => motion.toKeys));
  for (const key of elements.playback.querySelectorAll<SVGGElement>('[data-playback-key]')) {
    const id = key.dataset.playbackKey!;
    key.dataset.playbackActive = String(activeKeys.has(id) && !animatedKeys.has(id));
    key.dataset.playbackTrigger = String(triggerKeys.has(id));
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
  }
  if (playbackFeedbackPending) {
    triggerPlaybackKeyFeedback(activeKeys, ctx.getUiState().ui.playback.keyFeedbackStyle);
    playbackFeedbackPending = false;
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
  const structure = elements.playback.querySelector<HTMLElement>('[data-playback-structure]');
  const seek = elements.playback.querySelector<HTMLInputElement>('[data-playback-seek]');
  const toggle = elements.playback.querySelector<HTMLButtonElement>('[data-playback-action="toggle"]');
  const stop = elements.playback.querySelector<HTMLButtonElement>('[data-playback-action="stop"]');
  const back = elements.playback.querySelector<HTMLButtonElement>('[data-playback-action="back"]');
  const forward = elements.playback.querySelector<HTMLButtonElement>('[data-playback-action="forward"]');
  const effectiveKanaRate = elements.playback.querySelector<HTMLElement>('[data-playback-effective-kana-rate]');
  const effectiveRate = elements.playback.querySelector<HTMLElement>('[data-playback-effective-rate]');
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
      allFingerMovementDelay: ctx.getUiState().ui.playback.allFingerMovementDelay,
      rateAverage,
      rateWindow,
      rateHalfLife,
      dynamicDisplay,
      strokeCount: playbackTrace.strokes.length,
    });
    if (playbackRateChartSignature !== chartSignature) {
      rateChart.innerHTML = renderPlaybackRateChart(playbackRateChartData(
        playbackAnalysis,
        playbackState.stepsPerSecond,
        playbackState.sameFingerDelay,
        rateWindow,
        playbackState.calibration,
        playbackState.speedMultiplier,
        playbackTiming,
        rateAverage,
        rateHalfLife,
      ), dynamicDisplay);
      playbackRateChartSignature = chartSignature;
    }
    updatePlaybackRateChartCursor(rateChart, cursor);
  }
  if (layer) layer.textContent = playbackLayerLabel(playbackTrace, stroke);
  if (structure) {
    const annotation = playbackStrokeAnnotation(playbackAnalysis, cursor);
    const tags: string[] = [];
    if (annotation?.inLongRoll) tags.push('LongRoll');
    if (annotation?.inTwoRoll) tags.push('TwoRoll');
    if (annotation?.inArpeggio) tags.push('Arpeggio');
    if (playbackRedirectWindows(playbackAnalysis, cursor).length > 0) tags.push('Redirect(3打)');
    if (annotation?.inSfb) tags.push('SFB');
    structure.textContent = tags.length > 0 ? tags.join(' / ') : '—';
  }
  if (seek) seek.value = String(cursor);
  if (toggle) {
    const toggleIcon = toggle.querySelector<HTMLElement>('[data-playback-toggle-icon]');
    const toggleLabel = toggle.querySelector<HTMLElement>('[data-playback-toggle-label]');
    if (toggleIcon) toggleIcon.textContent = playbackState.playing ? '⏸' : '▶';
    if (toggleLabel) toggleLabel.textContent = playbackState.playing ? '一時停止' : '再生';
    toggle.setAttribute('aria-label', playbackState.playing ? '再生を一時停止する' : '再生する');
    toggle.disabled = total === 0 || cursor >= total;
  }
  if (stop) stop.disabled = cursor === 0 && !playbackState.playing;
  if (back) back.disabled = playbackState.playing || cursor === 0;
  if (forward) forward.disabled = playbackState.playing || cursor >= total;
  if (settingsSummary) {
    settingsSummary.textContent = `${playbackState.stepsPerSecond}ステップ/秒・${playbackState.speedMultiplier}倍`;
  }
  if (effectiveKanaRate) {
    const value = playbackRecentKanaPerSecond(
      playbackAnalysis,
      cursor,
      playbackState.stepsPerSecond,
      playbackState.sameFingerDelay,
      rateWindow,
      playbackState.calibration,
      playbackState.speedMultiplier,
      playbackTiming,
      rateAverage,
      rateHalfLife,
    );
    const rateLabel = rateAverage === 'ewma' ? `EWMA(${rateHalfLife}秒)` : `直近${rateWindow}打鍵`;
    effectiveKanaRate.textContent = value === undefined
      ? `${rateLabel} — かな/秒`
      : `${rateLabel} ${value.toFixed(2)} かな/秒`;
  }
  if (effectiveRate) {
    const value = playbackRecentActionsPerSecond(
      playbackAnalysis,
      cursor,
      playbackState.stepsPerSecond,
      playbackState.sameFingerDelay,
      rateWindow,
      playbackState.calibration,
      playbackState.speedMultiplier,
      playbackTiming,
      rateAverage,
      rateHalfLife,
    );
    const rateLabel = rateAverage === 'ewma' ? `EWMA(${rateHalfLife}秒)` : `直近${rateWindow}打鍵`;
    effectiveRate.textContent = value === undefined
      ? `${rateLabel} — アクション/秒`
      : `${rateLabel} ${value.toFixed(2)} アクション/秒`;
  }
}

function renderPlaybackSvg(layout: Layout, geometry: ReturnType<typeof buildGeometry>): string {
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  const keys = visibleGeometryKeys(layout, geometry).map((key) => {
    const thumb = key.row === THUMB_ROW;
    const widthU = thumb ? PLAYBACK_THUMB_WIDTH : (key.width ?? 1);
    const width = widthU * PLAYBACK_KEY;
    const x = (key.x - (widthU - 1) / 2) * PLAYBACK_KEY;
    const y = key.y * PLAYBACK_KEY;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + PLAYBACK_KEY);
    const label = layout.legends.get(key.id) ?? '';
    const fontSize = thumb ? 10 : label.length > 3 ? 9 : 12;
    const tip = `${escapeText(label || key.id)} <span style="color:var(--muted)">(${key.id})</span><br>${escapeText(FINGER_LABEL[key.finger])}`;
    return `<g data-tip="${escapeAttr(tip)}" data-playback-key="${escapeAttr(key.id)}" data-playback-finger="${key.finger}" data-playback-base-label="${escapeAttr(label)}" data-playback-active="false" data-playback-trigger="false" data-playback-finger-position="" data-playback-plan="false">
      <rect x="${x + 1}" y="${y + 1}" width="${width - 2}" height="${PLAYBACK_KEY - 2}" rx="5" fill="var(--panel)" stroke="var(--line)"/>
      <rect data-playback-feedback-overlay x="${x + 1}" y="${y + 1}" width="${width - 2}" height="${PLAYBACK_KEY - 2}" rx="5" fill="var(--panel)" opacity="0" pointer-events="none"/>
      <text class="playback-order playback-order-plan" data-playback-order="plan" x="${x + 7}" y="${y + 10}" text-anchor="middle" visibility="hidden"> </text>
      <text class="playback-order playback-order-trail" data-playback-order="trail" x="${x + width - 7}" y="${y + 10}" text-anchor="middle" visibility="hidden"> </text>
      <text class="playback-order playback-order-chain" data-playback-order="chain" x="${x + width / 2}" y="${y + PLAYBACK_KEY - 5}" text-anchor="middle" visibility="hidden"> </text>
      <text class="playback-order playback-order-arpeggio" data-playback-order="arpeggio" x="${x + width / 2}" y="${y + 11}" text-anchor="middle" visibility="hidden"> </text>
      <text class="playback-key-label" data-playback-label x="${x + width / 2}" y="${y + PLAYBACK_KEY / 2 + 4}" text-anchor="middle" font-size="${fontSize}" fill="var(--fg)" pointer-events="none">${escapeText(label)}</text>
    </g>`;
  });
  const viewX = minX - PLAYBACK_PAD / 2;
  const viewY = minY - PLAYBACK_PAD / 2;
  const W = maxX - minX + PLAYBACK_PAD;
  const H = maxY - minY + PLAYBACK_PAD;
  return `<svg viewBox="${viewX} ${viewY} ${W} ${H}" width="${W * ctx.getUiState().ui.playback.scale}" height="${H * ctx.getUiState().ui.playback.scale}" role="img"
    aria-label="${escapeAttr(`${layout.name}の打鍵再生`)}">${keys.join('')}<g data-playback-motion-layer aria-hidden="true"></g></svg>`;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function renderPlaybackMotions(
  motions: readonly (ReturnType<typeof playbackSameFingerKeyMotions>[number] & {
    kind: 'sameFinger' | 'chain';
  })[],
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
  const durationIndex = Math.max(0, cursor - 1);
  const durationMs = Math.max(
    150,
    Math.min(
      1500,
      playbackTimingStepDurationMs(playbackTiming, durationIndex)
        ?? playbackStepDurationMs(
          playbackAnalysis!,
          durationIndex,
          playbackState.stepsPerSecond,
          playbackState.sameFingerDelay,
          playbackState.calibration,
          playbackState.speedMultiplier,
        ),
    ),
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
      clone.setAttribute('data-playback-motion-kind', motion.kind);
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
 * 現在Strokeで実際に押した全キーへ同じフィードバック経路を適用する。
 * 連打も通常打鍵も区別せず、cursorが進むたびに既存animationをcancelして再発火する。
 */
function triggerPlaybackKeyFeedback(
  keyIds: ReadonlySet<string>,
  style: PlaybackKeyFeedbackStyle,
): void {
  if (style === 'off' || keyIds.size === 0) return;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  for (const id of keyIds) {
    const key = elements.playback.querySelector<SVGGElement>(
      `[data-playback-key="${CSS.escape(id)}"]`,
    );
    const overlay = key?.querySelector<SVGRectElement>('[data-playback-feedback-overlay]');
    if (!key || !overlay) continue;

    key.getAnimations().forEach((animation) => animation.cancel());
    overlay.getAnimations().forEach((animation) => animation.cancel());
    overlay.style.transition = 'none';
    overlay.style.opacity = '0';

    if (reducedMotion) {
      // motionは出さず、1フレームだけ押下を示す。
      overlay.style.opacity = '0.45';
      requestAnimationFrame(() => { overlay.style.opacity = '0'; });
      continue;
    }

    if (style === 'fade') {
      const face = key.querySelector<SVGRectElement>('rect:not([data-playback-feedback-overlay])');
      if (face) {
        // 押下色そのものを地色からaccentへ遷移させる。連打でも毎回同じ経路を再発火する。
        face.getAnimations().forEach((animation) => animation.cancel());
        face.animate(
          [
            { fill: 'var(--panel)', stroke: 'var(--line)' },
            { fill: 'var(--accent)', stroke: 'var(--accent)' },
          ],
          { duration: 120, easing: 'ease-out' },
        );
      }
      continue;
    }

    if (style === 'pulse') {
      overlay.animate(
        [{ opacity: 0.62 }, { opacity: 0 }],
        { duration: 220, easing: 'ease-out' },
      );
      continue;
    }

    key.style.transformBox = 'fill-box';
    key.style.transformOrigin = 'center';
    key.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.065)' }, { transform: 'scale(1)' }],
      { duration: 160, easing: 'ease-out' },
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
  analysis: AggregatedAnalysisResult,
) {
  const previousAnalysis = playbackAnalysis;
  const previousState = playbackState;
  const previousTiming = playbackTiming;
  const preserveMode = preserveStateOnNextRender;
  preserveStateOnNextRender = undefined;
  const preserveState = preserveMode !== undefined && previousAnalysis !== undefined;
  cancelPlaybackAnimation();
  playbackTrace = trace;
  playbackAnalysis = analysis;
  playbackGeometry = geometry;
  playbackLayout = layout;
  playbackOptions = options;
  const nextSettings = ctx.getPlaybackSettings();
  const nextBaseState = createPlaybackState(
    nextSettings.stepsPerSecond,
    nextSettings.sameFingerDelay,
    nextSettings.useCalibration ? ctx.getCalibration() : undefined,
    nextSettings.speedMultiplier,
  );
  const nextCursor = preserveMode === 'input-position' && previousAnalysis
    ? playbackCursorForEquivalentInputPosition(
      previousAnalysis.strokes,
      analysis.strokes,
      previousState.cursor,
    )
    : previousState.cursor;
  const nextTiming = playbackTimingSchedule(
    analysis,
    nextBaseState.stepsPerSecond,
    nextBaseState.sameFingerDelay,
    nextBaseState.calibration,
    nextBaseState.speedMultiplier,
    {
      allFingerMovementDelay: nextSettings.allFingerMovementDelay,
      geometry,
    },
  );
  playbackState = preserveState
    ? reconcilePlaybackStateAfterAnalysisRefresh(
      previousState,
      nextBaseState,
      previousAnalysis,
      analysis,
      nextCursor,
      previousTiming,
      nextTiming,
    )
    : nextBaseState;
  playbackTiming = nextTiming;
  playbackMotionCursor = -1;
  playbackSeekWasPlaying = undefined;
  playbackRateChartSignature = undefined;
  playbackFeedbackPending = false;
  const rateAverage = ctx.getUiState().conditions.defaults.playbackRateAverage;
  const rateWindow = ctx.getUiState().conditions.defaults.playbackRateWindow;
  const rateHalfLife = ctx.getUiState().conditions.defaults.playbackRateHalfLifeSeconds;
  const rateInitialLabel = rateAverage === 'ewma'
    ? `EWMA(${rateHalfLife}秒)`
    : `直近${rateWindow}打鍵`;
  ctx.surfaceModel.setHtml(`<details class="playback-panel"${ctx.getUiState().ui.panels.playback ? ' open' : ''}>
    <summary><span>打鍵再生</span><span class="playback-summary-hint">クリックして開く</span></summary>
    <div class="playback-body">
      <div class="playback-head">
        <button type="button" class="secondary playback-setting-button" data-playback-settings-open aria-controls="playback-settings-panel" aria-expanded="false">
          <span>再生設定</span><small data-playback-settings-summary>—</small>
        </button>
      </div>
      <div class="playback-controls" role="group" aria-label="打鍵再生の操作">
        <button type="button" class="ghost" data-playback-action="back"><span class="playback-control-icon" aria-hidden="true">◀</span><span>1 ステップ戻る</span></button>
        <button type="button" data-playback-action="toggle" aria-label="再生する"><span class="playback-control-icon" data-playback-toggle-icon aria-hidden="true">▶</span><span data-playback-toggle-label>再生</span></button>
        <button type="button" class="secondary" data-playback-action="stop" disabled><span class="playback-control-icon" aria-hidden="true">■</span><span>停止</span></button>
        <button type="button" class="ghost" data-playback-action="forward"><span class="playback-control-icon" aria-hidden="true">▶</span><span>1 ステップ進む</span></button>
        <span class="playback-position" aria-live="polite" data-playback-position>0 / ${trace.strokes.length} ステップ</span>
        <span class="playback-effective-rates"><span class="playback-effective-kana-rate" data-playback-effective-kana-rate>${rateInitialLabel} — かな/秒</span><span class="playback-effective-rate" data-playback-effective-rate>${rateInitialLabel} — アクション/秒</span></span>
      </div>
      <label class="playback-seek"><span>再生位置</span><input type="range" data-playback-seek min="0" max="${trace.strokes.length}" step="1" value="0" /></label>
      <div class="playback-status" aria-live="polite">
        <div class="playback-status-line">
          <span class="playback-current" data-playback-current>—</span>
          <span class="playback-romaji" data-playback-romaji hidden><span class="playback-current" data-playback-kana>—</span><span class="playback-typed">打鍵: <code data-playback-typed>—</code><span class="playback-planned" data-playback-planned hidden></span></span></span>
          <span class="playback-attribution">帰属: <b data-playback-layer>開始前</b></span>
          <span class="playback-attribution">構造: <b data-playback-structure>—</b></span>
        </div>
        <div class="playback-history" data-playback-history hidden>
          <span class="playback-history-label">入力:</span>
          <span data-playback-history-text></span>
        </div>
      </div>
      <details class="playback-rate-chart-panel"${ctx.getUiState().ui.panels.playbackRateChart ? ' open' : ''}>
        <summary>かな/秒・アクション/秒の平均推移</summary>
        <div class="playback-rate-chart" data-playback-rate-chart></div>
      </details>
      <div class="fig-fixed playback-figure">${renderPlaybackSvg(layout, geometry)}</div>
    </div>
  </details>`);
  publishPlaybackSettings();
  setPlaybackSettingsOpen(playbackSettingsOpen);
  if (preserveState && playbackState.playing) {
    playbackAnimationFrame = requestAnimationFrame((timestamp) => playbackFrame(timestamp));
  }
}

function startPlayback() {
  if (!playbackTrace || playbackState.cursor >= playbackTrace.strokes.length) return;
  cancelPlaybackAnimation();
  // 一時停止からの再開では現在Stroke内の経過時間を維持する。
  // 準備表示もelapsedMsを使うため、0へ戻すと到着済みの指が逆戻りしてしまう。
  playbackState = { ...playbackState, playing: true };
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
  );
  playbackMotionCursor = -1;
  updatePlaybackView();
}

function playbackFrame(timestamp: number) {
  playbackAnimationFrame = undefined;
  if (!playbackState.playing || !playbackTrace || !playbackAnalysis) return;
  if (playbackLastTimestamp === undefined) playbackLastTimestamp = timestamp;
  else {
    const previousCursor = playbackState.cursor;
    const nextState = advancePlayback(
      playbackState,
      timestamp - playbackLastTimestamp,
      playbackAnalysis,
      playbackTiming,
    );
    playbackFeedbackPending ||= nextState.cursor > previousCursor;
    playbackState = nextState;
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

function refreshStructuralAnalysis(): void {
  preserveStateOnNextRender = 'cursor';
  ctx.refreshAnalysis();
}

function refreshInputRealizationAnalysis(): void {
  preserveStateOnNextRender = 'input-position';
  ctx.refreshAnalysis();
}

const settingsActions: AnalyzerPlaybackSettingsActions = {
  close() {
    setPlaybackSettingsOpen(false);
  },
  setLayoutOverride(enabled) {
    ctx.setPlaybackLayoutOverride(enabled);
  },
  setPlayback(key, value) {
    ctx.updatePlaybackSetting(key, value);

    switch (key) {
      case 'sameFingerDelay':
        playbackState = setPlaybackSameFingerDelay(playbackState, Boolean(value));
        playbackMotionCursor = -1;
        refreshPlaybackTiming();
        break;
      case 'allFingerMovementDelay':
        playbackState = { ...playbackState, elapsedMs: 0 };
        playbackMotionCursor = -1;
        refreshPlaybackTiming();
        break;
      case 'useCalibration':
        playbackState = setPlaybackCalibration(
          playbackState,
          value ? ctx.getCalibration() : undefined,
        );
        refreshPlaybackTiming();
        break;
      case 'stepsPerSecond':
        playbackState = setPlaybackStepsPerSecond(
          playbackState,
          Number(value) as PlaybackStepsPerSecond,
        );
        refreshPlaybackTiming();
        break;
      case 'speedMultiplier':
        playbackState = setPlaybackSpeedMultiplier(playbackState, Number(value));
        refreshPlaybackTiming();
        break;
      case 'showChain':
      case 'showArpeggio':
      case 'showSameFingerMotion':
        playbackMotionCursor = -1;
        break;
      case 'showChainOnRateChart':
      case 'showArpeggioOnRateChart':
        playbackRateChartSignature = undefined;
        break;
      case 'scale':
        rerenderPlaybackFigure();
        break;
      default:
        break;
    }

    updatePlaybackView();
    publishPlaybackSettings();
  },
  setRateAverage(value) {
    ctx.updateUiState((draft) => {
      draft.conditions.defaults.playbackRateAverage = value;
    });
    playbackRateChartSignature = undefined;
    updatePlaybackView();
    publishPlaybackSettings();
  },
  setRateWindow(value) {
    if (
      !Number.isInteger(value)
      || value < PLAYBACK_RATE_WINDOW_MIN
      || value > PLAYBACK_RATE_WINDOW_MAX
    ) return;
    ctx.updateUiState((draft) => {
      draft.conditions.defaults.playbackRateWindow = value;
    });
    playbackRateChartSignature = undefined;
    updatePlaybackView();
    publishPlaybackSettings();
  },
  setRateHalfLife(value) {
    if (
      !Number.isFinite(value)
      || value < PLAYBACK_RATE_HALF_LIFE_SECONDS_MIN
      || value > PLAYBACK_RATE_HALF_LIFE_SECONDS_MAX
    ) return;
    ctx.updateUiState((draft) => {
      draft.conditions.defaults.playbackRateHalfLifeSeconds = value;
    });
    playbackRateChartSignature = undefined;
    updatePlaybackView();
    publishPlaybackSettings();
  },
  setChainPolicy(policy) {
    ctx.updateChainPolicy(policy);
    publishPlaybackSettings();
    refreshStructuralAnalysis();
  },
  setArpeggioPolicy(policy) {
    ctx.updateArpeggioPolicy(policy);
    publishPlaybackSettings();
    refreshStructuralAnalysis();
  },
  setTriggerRealization(policy) {
    ctx.updateTriggerRealizationPolicy(policy);
    publishPlaybackSettings();
    refreshInputRealizationAnalysis();
  },
  setActionRealization(policy) {
    ctx.updateActionRealizationPolicy(policy);
    publishPlaybackSettings();
    refreshInputRealizationAnalysis();
  },
  openCalibration() {
    if (ctx.getCalibration()) ctx.openCalibrationEdit();
    else ctx.openCalibration();
  },
};

  function setup(): void {
    elements.playback.addEventListener('toggle', (e) => {
      const details = e.target as HTMLDetailsElement;
      if (!(details instanceof HTMLDetailsElement)) return;
      if (details.classList.contains('playback-panel')) {
        ctx.updateUiState((draft) => { draft.ui.panels.playback = details.open; });
        if (!details.open) setPlaybackSettingsOpen(false);
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
        setPlaybackSettingsOpen(!playbackSettingsOpen);
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
        case 'forward': {
          if (!playbackTrace) return;
          const previousCursor = playbackState.cursor;
          const nextState = stepPlayback(playbackState, 1, playbackTrace.strokes.length);
          playbackFeedbackPending ||= nextState.cursor > previousCursor;
          playbackState = nextState;
          updatePlaybackView();
          break;
        }
      }
    });
    elements.app.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && playbackSettingsOpen) {
        e.preventDefault();
        setPlaybackSettingsOpen(false);
      }
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
  }

  return {
    setup,
    render: renderPlayback,
    clear: () => {
      cancelPlaybackAnimation();
      playbackTrace = undefined; playbackAnalysis = undefined; playbackGeometry = undefined; playbackLayout = undefined; playbackOptions = undefined;
      playbackTiming = [];
      playbackFeedbackPending = false;
      preserveStateOnNextRender = undefined;
          setPlaybackSettingsOpen(false);
      ctx.settingsModel.clear();
      ctx.surfaceModel.clear();
    },
    update: updatePlaybackView,
    preserveNextRender: (mode) => { preserveStateOnNextRender = mode; },
    setCalibration: (calibration) => {
      playbackState = setPlaybackCalibration(playbackState, calibration);
      refreshPlaybackTiming();
      updatePlaybackView();
      publishPlaybackSettings();
    },
    getGeometry: () => playbackGeometry,
    getLayout: () => playbackLayout,
    commitSurface: () => {
      setPlaybackSettingsOpen(playbackSettingsOpen);
      updatePlaybackView();
    },
    settingsActions,
  };
}
