import type { Finger, Geometry } from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { Stroke, Trace } from '#trace/generate.ts';
import type { AggregatedAnalysisResult } from '#interpretation/structure/aggregate.ts';
import {
  playbackInputPreview,
  playbackPlannedKeys,
  playbackPlannedOrders,
  playbackPreparedFingerPositionKeys,
  playbackRomajiInputPreview,
  playbackRomajiPlan,
  playbackRomajiPlannedKeys,
  playbackRomajiPlannedOrders,
  playbackSameFingerKeyMotions,
  playbackStepDurationMs,
  playbackStrokeAt,
  playbackStrokeDisplay,
  playbackTimingStepTypingMs,
  playbackTrailKeys,
  playbackTrailOrders,
  clampPlaybackCursor,
  type PlaybackInputPreviewSegment,
  type PlaybackRomajiInputSegment,
  type PlaybackTimingStep,
} from '#interpretation/timing/playback.ts';
import {
  playbackAnalysisArpeggioMotions,
  playbackAnalysisArpeggioOrders,
  playbackAnalysisChainMotions,
  playbackAnalysisChainOrders,
  playbackRedirectWindows,
  playbackStrokeAnnotation,
  type PlaybackOrderSpan,
} from './structure-display.ts';
import type { PlaybackOptions } from './options.ts';
import type { PlaybackTimingConditions } from './timing-conditions.ts';

/**
 * 再生中の配列図と状態表示に出す値を、再生位置（カーソル）から求める純粋な関数。
 * 構造の判定・時間の計算は`interpretation/`の関数に任せ、ここは表示の用途ごとに取り出して並べ直すだけ。
 */

/** 構造の動的表示でキーが動く時間の下限・上限 [ms]。短すぎる動きは見えず、長すぎる動きは次の打鍵と重なる。 */
const MOTION_DURATION_MIN_MS = 150;
const MOTION_DURATION_MAX_MS = 1500;

export interface PlaybackMotion {
  readonly fromKey: string;
  readonly toKey: string;
  readonly kind: 'sameFinger' | 'chain' | 'arpeggio';
  readonly durationMs: number;
}

export interface PlaybackFrame {
  readonly total: number;
  readonly cursor: number;
  readonly isRomaji: boolean;
  /** 状態表示の「今打った文字」。開始前は`—` */
  readonly currentText: string;
  /** ローマ字配列では今の入力単位（かな）、それ以外は入力した文字 */
  readonly kanaText: string;
  readonly typedText: string;
  /** ローマ字配列で、今の入力単位の予定綴り */
  readonly plannedText: string | undefined;
  readonly inputPreview: readonly PlaybackInputPreviewSegment[];
  /** 入力の行をローマ字で出す時（ローマ字配列で設定が真）の単位の並び。出さない時は無い */
  readonly romajiInputPreview: readonly PlaybackRomajiInputSegment[] | undefined;
  readonly layerLabel: string;
  readonly structureLabel: string;
  /** 面の定義があるキーの刻印。無いキーは配列の刻印を使う */
  readonly keyLabels: ReadonlyMap<string, string>;
  readonly activeKeys: ReadonlySet<string>;
  readonly triggerKeys: ReadonlySet<string>;
  /** 今の打鍵を打った指（打鍵に記録された、選んだ指）。開始前は空 */
  readonly pressedFingers: readonly Finger[];
  readonly fingerPositionKeys: ReadonlyMap<string, Finger>;
  readonly trailKeys: ReadonlyMap<string, number>;
  readonly plannedKeys: ReadonlyMap<string, number>;
  readonly plannedOrders: ReadonlyMap<string, number>;
  /** ローマ字配列で、今の入力単位のまだ押していないキー。これから押すキーの表示とは独立 */
  readonly romajiPlannedKeys: ReadonlyMap<string, number>;
  readonly romajiPlannedOrders: ReadonlyMap<string, number>;
  readonly trailOrders: ReadonlyMap<string, number>;
  readonly chainOrders: ReadonlyMap<string, number>;
  readonly arpeggioOrders: ReadonlyMap<string, number>;
  readonly motions: readonly PlaybackMotion[];
}

export interface PlaybackFrameInput {
  readonly layout: Layout;
  readonly geometry: Geometry;
  readonly trace: Pick<Trace, 'strokes' | 'layerDefinitions'>;
  readonly analysis: AggregatedAnalysisResult;
  readonly windowSize: number;
  readonly schedule: readonly PlaybackTimingStep[];
  readonly timing: PlaybackTimingConditions;
  readonly options: PlaybackOptions;
  readonly cursor: number;
  /** 今のステップの中で経過した時間 [ms]。指の準備時間の表示だけが読む */
  readonly elapsedMs: number;
}

function layerLabelOf(trace: Pick<Trace, 'layerDefinitions'>, stroke: Stroke | undefined): string {
  if (!stroke) return '開始前';
  return trace.layerDefinitions.find((definition) => definition.id === stroke.aggregationGroupId)?.label ?? stroke.aggregationGroupId;
}

/** 同じキーに複数の区間の順番が付く時は、先に見つかった区間の順番を使う。 */
function firstOrders(spans: readonly PlaybackOrderSpan[]): ReadonlyMap<string, number> {
  const orders = new Map<string, number>();
  for (const span of spans) {
    for (const [key, order] of span.orders) {
      if (!orders.has(key)) orders.set(key, order);
    }
  }
  return orders;
}

function structureLabelOf(analysis: AggregatedAnalysisResult, cursor: number): string {
  const annotation = playbackStrokeAnnotation(analysis, cursor);
  const tags: string[] = [];
  if (annotation?.inLongRoll) tags.push('LongRoll');
  if (annotation?.inTwoRoll) tags.push('TwoRoll');
  if (annotation?.inArpeggio) tags.push('Arpeggio');
  if (playbackRedirectWindows(analysis, cursor).length > 0) tags.push('Redirect(3打)');
  if (annotation?.inSfb) tags.push('SFB');
  return tags.length > 0 ? tags.join(' / ') : '—';
}

/**
 * 構造の動的表示で重ねるキーの動き。同指移動のキーは、Chain・Arpeggioの動きから外す。
 * 同じ行き先のキーがChainとArpeggioの両方に入る時は、動くキーを1つにしてArpeggioの動きを残す
 * （2つ描くと、どちらの色が見えるかが描く順番で決まるため）。
 */
function motionsOf(input: PlaybackFrameInput, cursor: number): PlaybackMotion[] {
  const { analysis, options, timing, schedule, trace } = input;
  const sameFingerMotions = timing.sameFingerDelay && options.showSameFingerMotion ? playbackSameFingerKeyMotions(trace.strokes, cursor) : [];
  const sameFingerTargets = new Set(sameFingerMotions.flatMap((motion) => motion.toKeys));
  const withoutSameFinger = <M extends { readonly toKeys: readonly string[] }>(motion: M): M[] => {
    const toKeys = motion.toKeys.filter((key) => !sameFingerTargets.has(key));
    return toKeys.length === 0 ? [] : [{ ...motion, toKeys }];
  };
  const chainMotions = options.showChain ? playbackAnalysisChainMotions(analysis, cursor).flatMap(withoutSameFinger) : [];
  const arpeggioMotions = options.showArpeggio ? playbackAnalysisArpeggioMotions(analysis, cursor).flatMap(withoutSameFinger) : [];
  const abstractMotions = [
    ...sameFingerMotions.map((motion) => ({ ...motion, kind: 'sameFinger' as const })),
    ...chainMotions.map((motion) => ({ ...motion, kind: 'chain' as const })),
    ...arpeggioMotions.map((motion) => ({ ...motion, kind: 'arpeggio' as const })),
  ];

  const durationIndex = Math.max(0, cursor - 1);
  // キーの動きの長さは打鍵の時間に合わせる。動きは次のステップの区間の先頭から始まるので、待機があればその間に再生される
  const stepMs =
    playbackTimingStepTypingMs(schedule, durationIndex) ??
    playbackStepDurationMs(analysis, durationIndex, timing.stepsPerSecond, timing.sameFingerDelay, timing.calibration, timing.speedMultiplier);
  const durationMs = Math.max(MOTION_DURATION_MIN_MS, Math.min(MOTION_DURATION_MAX_MS, stepMs));
  const motions = abstractMotions.flatMap((motion) =>
    motion.toKeys.filter((key) => key !== motion.fromKey).map((toKey) => ({ fromKey: motion.fromKey, toKey, kind: motion.kind, durationMs })),
  );
  // 動かない動き（行き先と出発位置が同じ）を除いた後で重なりを見る。先に見ると、Arpeggioの動きが消えた時にChainの動きも消えてしまう
  const arpeggioTargets = new Set(motions.filter((motion) => motion.kind === 'arpeggio').map((motion) => motion.toKey));
  return motions.filter((motion) => motion.kind !== 'chain' || !arpeggioTargets.has(motion.toKey));
}

export function derivePlaybackFrame(input: PlaybackFrameInput): PlaybackFrame {
  const { layout, geometry, trace, analysis, windowSize, schedule, timing, options } = input;
  const total = trace.strokes.length;
  const cursor = clampPlaybackCursor(input.cursor, total);
  const stroke = playbackStrokeAt(trace.strokes, cursor);
  const display = stroke ? playbackStrokeDisplay(layout, stroke) : undefined;
  const isRomaji = layout.romajiTable !== undefined;

  const inputPreview = playbackInputPreview(trace.strokes, cursor, windowSize);
  const romajiInputPreview = isRomaji && options.showRomajiInput ? playbackRomajiInputPreview(trace.strokes, cursor, windowSize) : undefined;
  const plan = isRomaji ? playbackRomajiPlan(trace.strokes, cursor) : undefined;

  const none = <V>() => new Map<string, V>();
  // 履歴と予定の順番ラベルは、そのキー自体が出ている時にだけ付く
  const showTrail = options.showTrail;
  const showPlanned = options.showPlannedKeys;
  const showRomaji = isRomaji && options.showRomajiPlan;

  return {
    total,
    cursor,
    isRomaji,
    currentText: stroke ? (display?.character ?? (stroke.triggerKeys.length > 0 ? '⇧' : stroke.char)) : '—',
    kanaText: isRomaji ? (inputPreview.find((segment) => segment.kind === 'current')?.text ?? '—') : (stroke?.inputChar ?? '—'),
    typedText: stroke?.char ?? '—',
    plannedText: plan?.planned,
    inputPreview,
    romajiInputPreview,
    layerLabel: layerLabelOf(trace, stroke),
    structureLabel: structureLabelOf(analysis, cursor),
    keyLabels: display?.keyLabels ?? new Map<string, string>(),
    activeKeys: new Set(stroke?.presses.flatMap((press) => press.keys.map((key) => key.id)) ?? []),
    triggerKeys: new Set(stroke?.triggerKeys ?? []),
    pressedFingers: [...new Set(stroke?.presses.map((press) => press.finger) ?? [])],
    fingerPositionKeys: options.showFingerPositions
      ? playbackPreparedFingerPositionKeys(
          analysis,
          schedule,
          cursor,
          input.elapsedMs,
          geometry,
          options.fingerPreparationSeconds,
          timing.stepsPerSecond,
          timing.calibration,
          timing.speedMultiplier,
        )
      : none<Finger>(),
    trailKeys: showTrail ? playbackTrailKeys(trace.strokes, cursor, options.trailSteps) : none<number>(),
    // これから押すキー。ローマ字配列でもそれ以外でも、今の入力の残りと先読みNかな先までの入力を、近さに応じた濃さと順番で出す
    plannedKeys: showPlanned ? playbackPlannedKeys(trace.strokes, cursor, windowSize) : none<number>(),
    plannedOrders: showPlanned && options.showOrderLabels ? playbackPlannedOrders(trace.strokes, cursor, windowSize) : none<number>(),
    romajiPlannedKeys: showRomaji ? playbackRomajiPlannedKeys(trace.strokes, cursor) : none<number>(),
    romajiPlannedOrders: showRomaji && options.showOrderLabels ? playbackRomajiPlannedOrders(trace.strokes, cursor) : none<number>(),
    trailOrders: showTrail && options.showOrderLabels ? playbackTrailOrders(trace.strokes, cursor, options.trailSteps) : none<number>(),
    chainOrders: options.showChain ? firstOrders(playbackAnalysisChainOrders(analysis, cursor)) : new Map<string, number>(),
    arpeggioOrders: options.showArpeggio ? firstOrders(playbackAnalysisArpeggioOrders(analysis, cursor)) : new Map<string, number>(),
    motions: motionsOf(input, cursor),
  };
}
