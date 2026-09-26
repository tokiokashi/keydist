import { buildGeometry, type Finger } from '#input/shapes/geometry.ts';
import { type Options, type Stroke, type Trace } from '#trace/evaluate.ts';
import {
  advancePlayback, clampPlaybackCursor, createPlaybackState,
  playbackPreparedFingerPositionKeys, playbackInputPreview, playbackPlannedKeys,
  playbackPlannedOrders, playbackRomajiPlan, playbackRomajiPlannedKeys,
  playbackRomajiPlannedOrders, playbackRateChartData,
  playbackRecentActionsPerSecond, playbackRecentKanaPerSecond,
  playbackSameFingerKeyMotions,
  playbackStrokeAt, playbackStepDurationMs, playbackTimingSchedule, playbackTimingStepDurationMs, playbackCursorForEquivalentInputPosition, reconcilePlaybackStateAfterAnalysisRefresh, setPlaybackSameFingerDelay,
  setPlaybackStepsPerSecond, stepPlayback, playbackTrailKeys, playbackTrailOrders,
  playbackStrokeDisplay, setPlaybackCalibration, setPlaybackSpeedMultiplier,
  type PlaybackStepsPerSecond, type PlaybackState, type PlaybackTimingStep,
  PLAYBACK_RATE_WINDOW_MIN,
  PLAYBACK_RATE_WINDOW_MAX, PLAYBACK_RATE_HALF_LIFE_SECONDS_MIN,
  PLAYBACK_RATE_HALF_LIFE_SECONDS_MAX,
} from '#interpretation/timing/playback.ts';
import type { Layout } from '#input/layouts/index.ts';
import type { PlaybackCalibration } from '#interpretation/timing/calibration.ts';
import type {
  UiPlaybackState,
  UiStateV1,
} from './ui-state.ts';
import type { AggregatedAnalysisResult } from '#interpretation/structure/aggregate.ts';
import type { ChainPolicy } from '#interpretation/structure/chain.ts';
import type { ArpeggioPolicy } from '#interpretation/structure/arpeggio.ts';
import type {
  ActionRealizationPolicy,
  TriggerRealizationPolicy,
} from '#input/semantics/index.ts';
import type {
  AnalyzerPlaybackSurfaceActions,
  AnalyzerPlaybackMotion,
  AnalyzerPlaybackSurfaceModel,
} from './analyzer-playback-surface-model.ts';
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
  surfaceActions: AnalyzerPlaybackSurfaceActions;
  settingsActions: AnalyzerPlaybackSettingsActions;
}

export function createPlaybackView(ctx: PlaybackViewContext): PlaybackViewController {
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
let playbackMotionRevision = 0;
let playbackFeedbackPending = false;
let playbackFeedbackRevision = 0;
let playbackRateChartSignature: string | undefined;
let playbackRateChartPoints: ReturnType<typeof playbackRateChartData> = [];
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

function updatePlaybackView(): void {
  if (!playbackTrace || !playbackGeometry || !playbackAnalysis || !playbackLayout) return;

  const state = ctx.getUiState();
  const settings = state.ui.playback;
  const total = playbackTrace.strokes.length;
  const cursor = clampPlaybackCursor(playbackState.cursor, total);
  const stroke = playbackStrokeAt(playbackTrace.strokes, cursor);
  const display = stroke ? playbackStrokeDisplay(playbackLayout, stroke) : undefined;
  const isRomaji = playbackLayout.romajiTable !== undefined;
  const windowSize = playbackOptions?.windowSize ?? state.conditions.defaults.windowSize;
  const rateAverage = state.conditions.defaults.playbackRateAverage;
  const rateWindow = state.conditions.defaults.playbackRateWindow;
  const rateHalfLife = state.conditions.defaults.playbackRateHalfLifeSeconds;

  const activeKeys = new Set(
    stroke?.presses.flatMap((press) => press.keys.map((key) => key.id)) ?? [],
  );
  const triggerKeys = new Set(stroke?.triggerKeys ?? []);
  const fingerPositionKeys = settings.showFingers
    ? playbackPreparedFingerPositionKeys(
      playbackAnalysis,
      playbackTiming,
      cursor,
      playbackState.elapsedMs,
      playbackGeometry,
      settings.fingerPreparationSeconds,
      playbackState.stepsPerSecond,
      playbackState.calibration,
      playbackState.speedMultiplier,
    )
    : new Map<string, Finger>();
  const trailKeys = settings.showTrail
    ? playbackTrailKeys(playbackTrace.strokes, cursor, settings.trailTau)
    : new Map<string, number>();
  const romajiPlannedKeys = isRomaji && settings.showRomajiPlan
    ? playbackRomajiPlannedKeys(playbackTrace.strokes, cursor)
    : new Map<string, number>();
  const plannedKeys = settings.showPlanKeys
    ? playbackPlannedKeys(playbackTrace.strokes, cursor, windowSize)
    : romajiPlannedKeys;
  const plannedOrders = settings.showOrderLabels
    ? settings.showPlanKeys
      ? playbackPlannedOrders(playbackTrace.strokes, cursor, windowSize)
      : settings.showRomajiPlan
        ? playbackRomajiPlannedOrders(playbackTrace.strokes, cursor)
        : new Map<string, number>()
    : new Map<string, number>();
  const trailOrders = settings.showOrderLabels && settings.showTrail
    ? playbackTrailOrders(playbackTrace.strokes, cursor, settings.trailTau)
    : new Map<string, number>();

  const dynamicDisplay = dynamicPlaybackDisplay(settings);
  const chainOrders = displayedOrders(
    settings.showChain
      ? playbackAnalysisChainOrders(playbackAnalysis, cursor)
      : [],
  );
  const arpeggioOrders = displayedOrders(
    settings.showArpeggio
      ? playbackAnalysisArpeggioOrders(playbackAnalysis, cursor)
      : [],
  );

  const sameFingerMotions = playbackState.sameFingerDelay
    && settings.showSameFingerMotion
    ? playbackSameFingerKeyMotions(playbackTrace.strokes, cursor)
    : [];
  const sameFingerTargets = new Set(
    sameFingerMotions.flatMap((motion) => motion.toKeys),
  );
  const handMotions = (
    settings.showChain
      ? playbackAnalysisChainMotions(playbackAnalysis, cursor)
      : []
  ).flatMap((motion) => {
    const toKeys = motion.toKeys.filter((key) => !sameFingerTargets.has(key));
    return toKeys.length === 0 ? [] : [{ ...motion, toKeys }];
  });
  const arpeggioMotions = (
    settings.showArpeggio
      ? playbackAnalysisArpeggioMotions(playbackAnalysis, cursor)
      : []
  ).flatMap((motion) => {
    const toKeys = motion.toKeys.filter((key) => !sameFingerTargets.has(key));
    return toKeys.length === 0 ? [] : [{ ...motion, toKeys }];
  });
  const abstractMotions = [
    ...sameFingerMotions.map((motion) => ({
      ...motion,
      kind: 'sameFinger' as const,
    })),
    ...handMotions.map((motion) => ({
      ...motion,
      kind: 'chain' as const,
    })),
    ...arpeggioMotions.map((motion) => ({
      ...motion,
      kind: 'chain' as const,
    })),
  ].flatMap((motion) => {
    const toKeys = motion.toKeys.filter((key) => key !== motion.fromKey);
    return toKeys.length === 0 ? [] : [{ ...motion, toKeys }];
  });
  const durationIndex = Math.max(0, cursor - 1);
  const durationMs = Math.max(
    150,
    Math.min(
      1500,
      playbackTimingStepDurationMs(playbackTiming, durationIndex)
        ?? playbackStepDurationMs(
          playbackAnalysis,
          durationIndex,
          playbackState.stepsPerSecond,
          playbackState.sameFingerDelay,
          playbackState.calibration,
          playbackState.speedMultiplier,
        ),
    ),
  );
  const motions: AnalyzerPlaybackMotion[] = abstractMotions.flatMap((motion) =>
    motion.toKeys.map((toKey) => ({
      fromKey: motion.fromKey,
      toKey,
      kind: motion.kind,
      durationMs,
    })));
  if (cursor !== playbackMotionCursor) {
    playbackMotionCursor = cursor;
    playbackMotionRevision += 1;
  }

  const feedbackKeys = playbackFeedbackPending
    ? new Set(activeKeys)
    : new Set<string>();
  if (playbackFeedbackPending) {
    playbackFeedbackRevision += 1;
    playbackFeedbackPending = false;
  }

  const inputPreview = playbackInputPreview(
    playbackTrace.strokes,
    cursor,
    windowSize,
  );
  const plan = isRomaji
    ? playbackRomajiPlan(playbackTrace.strokes, cursor)
    : undefined;

  const annotation = playbackStrokeAnnotation(playbackAnalysis, cursor);
  const structureTags: string[] = [];
  if (annotation?.inLongRoll) structureTags.push('LongRoll');
  if (annotation?.inTwoRoll) structureTags.push('TwoRoll');
  if (annotation?.inArpeggio) structureTags.push('Arpeggio');
  if (playbackRedirectWindows(playbackAnalysis, cursor).length > 0) {
    structureTags.push('Redirect(3打)');
  }
  if (annotation?.inSfb) structureTags.push('SFB');

  const rateSignature = JSON.stringify({
    stepsPerSecond: playbackState.stepsPerSecond,
    speedMultiplier: playbackState.speedMultiplier,
    sameFingerDelay: playbackState.sameFingerDelay,
    calibration: playbackState.calibration,
    allFingerMovementDelay: settings.allFingerMovementDelay,
    rateAverage,
    rateWindow,
    rateHalfLife,
    dynamicDisplay,
    strokeCount: playbackTrace.strokes.length,
  });
  if (playbackRateChartSignature !== rateSignature) {
    playbackRateChartPoints = playbackRateChartData(
      playbackAnalysis,
      playbackState.stepsPerSecond,
      playbackState.sameFingerDelay,
      rateWindow,
      playbackState.calibration,
      playbackState.speedMultiplier,
      playbackTiming,
      rateAverage,
      rateHalfLife,
    );
    playbackRateChartSignature = rateSignature;
  }

  const recentKanaRate = playbackRecentKanaPerSecond(
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
  const recentActionRate = playbackRecentActionsPerSecond(
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
  const rateLabel = rateAverage === 'ewma'
    ? `EWMA(${rateHalfLife}秒)`
    : `直近${rateWindow}打鍵`;

  ctx.surfaceModel.setData({
    layout: playbackLayout,
    geometry: playbackGeometry,
    panelOpen: state.ui.panels.playback,
    rateChartOpen: state.ui.panels.playbackRateChart,
    settingsOpen: playbackSettingsOpen,
    total,
    cursor,
    playing: playbackState.playing,
    isRomaji,
    currentText: stroke
      ? display?.character ?? (stroke.triggerKeys.length > 0 ? '⇧' : stroke.char)
      : '—',
    kanaText: isRomaji
      ? inputPreview.find((segment) => segment.kind === 'current')?.text ?? '—'
      : stroke?.inputChar ?? '—',
    typedText: stroke?.char ?? '—',
    plannedText: plan?.planned,
    inputPreview,
    layerLabel: playbackLayerLabel(playbackTrace, stroke),
    structureLabel: structureTags.length > 0 ? structureTags.join(' / ') : '—',
    effectiveKanaRate: recentKanaRate === undefined
      ? `${rateLabel} — かな/秒`
      : `${rateLabel} ${recentKanaRate.toFixed(2)} かな/秒`,
    effectiveRate: recentActionRate === undefined
      ? `${rateLabel} — アクション/秒`
      : `${rateLabel} ${recentActionRate.toFixed(2)} アクション/秒`,
    settingsSummary:
      `${playbackState.stepsPerSecond}ステップ/秒・${playbackState.speedMultiplier}倍`,
    keyLabels: display?.keyLabels ?? new Map<string, string>(),
    activeKeys,
    triggerKeys,
    fingerPositionKeys,
    trailKeys,
    plannedKeys,
    plannedOrders,
    trailOrders,
    chainOrders,
    arpeggioOrders,
    motions,
    motionRevision: playbackMotionRevision,
    feedbackKeys,
    feedbackStyle: settings.keyFeedbackStyle,
    feedbackRevision: playbackFeedbackRevision,
    rateChartPoints: playbackRateChartPoints,
    rateChartDisplay: dynamicDisplay,
    scale: settings.scale,
  });
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
  publishPlaybackSettings();
  setPlaybackSettingsOpen(playbackSettingsOpen);
  updatePlaybackView();
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

const surfaceActions: AnalyzerPlaybackSurfaceActions = {
  setPanelOpen(open) {
    ctx.updateUiState((draft) => {
      draft.ui.panels.playback = open;
    });
    if (!open) setPlaybackSettingsOpen(false);
    updatePlaybackView();
  },
  setRateChartOpen(open) {
    ctx.updateUiState((draft) => {
      draft.ui.panels.playbackRateChart = open;
    });
    updatePlaybackView();
  },
  setSettingsOpen(open) {
    setPlaybackSettingsOpen(open);
    updatePlaybackView();
  },
  togglePlay() {
    if (playbackState.playing) pausePlayback();
    else startPlayback();
  },
  stop: stopPlayback,
  step(delta) {
    if (!playbackTrace || playbackState.playing) return;
    const previousCursor = playbackState.cursor;
    const nextState = stepPlayback(
      playbackState,
      delta,
      playbackTrace.strokes.length,
    );
    if (delta > 0) {
      playbackFeedbackPending ||= nextState.cursor > previousCursor;
    }
    playbackState = nextState;
    updatePlaybackView();
  },
  beginSeek: beginPlaybackSeek,
  seek(cursor) {
    seekPlayback(String(cursor));
  },
  finishSeek: finishPlaybackSeek,
};

const settingsActions: AnalyzerPlaybackSettingsActions = {
  close() {
    setPlaybackSettingsOpen(false);
    updatePlaybackView();
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

  function setup(): void {}

  return {
    setup,
    render: renderPlayback,
    clear: () => {
      cancelPlaybackAnimation();
      playbackTrace = undefined; playbackAnalysis = undefined; playbackGeometry = undefined; playbackLayout = undefined; playbackOptions = undefined;
      playbackTiming = [];
      playbackFeedbackPending = false;
      playbackMotionRevision = 0;
      playbackFeedbackRevision = 0;
      playbackRateChartPoints = [];
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
    surfaceActions,
    settingsActions,
  };
}
