import { ALL_FINGERS, dist, keyId, resolveKeyId, type Finger, type Geometry, type Point } from './geometry.ts';
import { classifyFaces, faceCells, foldedLayerCells, type Layer } from './layers.ts';
import type { Stroke } from './evaluate.ts';
import type { Layout } from './layouts/types.ts';
import {
  handDirection,
  sameHandDirectedFingerPairKey,
  sameHandFingerPairKey,
  type PlaybackCalibration,
} from './playback-calibration.ts';
import type { AggregatedAnalysisResult } from './analysis-aggregate.ts';
import {
  DEFAULT_HOLD_START_ACTION_POLICY,
  hasSeparateHoldStartAction,
  type HoldStartActionPolicy,
} from './hold-start-action.ts';

/** 再生速度の入力範囲。実際の打鍵時間や距離モデルとは無関係。 */
export const PLAYBACK_STEPS_PER_SECOND_MIN = 0.1;
export const PLAYBACK_STEPS_PER_SECOND_MAX = 20;
export type PlaybackStepsPerSecond = number;
export const DEFAULT_PLAYBACK_STEPS_PER_SECOND: PlaybackStepsPerSecond = 1.25;
export const PLAYBACK_SPEED_MULTIPLIER_MIN = 0.1;
export const PLAYBACK_SPEED_MULTIPLIER_MAX = 10;
export const DEFAULT_PLAYBACK_SPEED_MULTIPLIER = 1;
export const PLAYBACK_RATE_WINDOW_MIN = 1;
export const PLAYBACK_RATE_WINDOW_MAX = 50;
export const DEFAULT_PLAYBACK_RATE_WINDOW = 10;
export type PlaybackRateAverage = 'sma' | 'ewma';
export const DEFAULT_PLAYBACK_RATE_AVERAGE: PlaybackRateAverage = 'sma';
export const PLAYBACK_RATE_HALF_LIFE_SECONDS_MIN = 0.1;
export const PLAYBACK_RATE_HALF_LIFE_SECONDS_MAX = 10;
export const DEFAULT_PLAYBACK_RATE_HALF_LIFE_SECONDS = 1;

/** 非アクティブなタブから戻った時の一気送りを防ぐため、1フレームの経過時間を制限する。 */
const MAX_FRAME_MS = 100;

export interface PlaybackState {
  /** 0は開始前、nはn打鍵ぶん進んだ位置。 */
  cursor: number;
  stepsPerSecond: PlaybackStepsPerSecond;
  /** 測定値・標準速度に最後に掛ける再生速度の倍率。 */
  speedMultiplier: number;
  /** 同指連続の移動距離を再生時間へ反映するか。 */
  sameFingerDelay: boolean;
  /** 有効にしている個人の打鍵・指移動速度。 */
  calibration?: PlaybackCalibration;
  playing: boolean;
  elapsedMs: number;
}

export interface PlaybackStrokeDisplay {
  /** 現在の出力キーが面に持つ文字。シフトだけのステップでは undefined */
  character?: string;
  /** 現在のステップで表示するキーごとの刻印 */
  keyLabels: ReadonlyMap<string, string>;
}

export interface PlaybackRomajiPlan {
  /** 現在の入力単位に対応する予定綴り */
  planned: string;
  /** 現在のカーソルまでに打ち終えた予定綴りの接頭辞 */
  typed: string;
}

export interface PlaybackKeyMotion {
  /** 移動開始位置のキーid */
  fromKey: string;
  /** 移動先のキーid。通常は1件だが同時押しにも対応する */
  toKeys: readonly string[];
  finger: Finger;
}

/** 直近の同指連続をキー移動として描画するための起点・終点を返す。 */
export function playbackSameFingerKeyMotions(
  strokes: readonly Stroke[],
  cursor: number,
): PlaybackKeyMotion[] {
  const index = Math.min(Math.max(0, cursor), strokes.length) - 1;
  if (index <= 0) return [];

  const stroke = strokes[index];
  const previous = strokes[index - 1];
  const motions: PlaybackKeyMotion[] = [];
  for (const press of stroke.presses) {
    if (!press.sfb) continue;
    const previousPress = previous.presses.find((candidate) => candidate.finger === press.finger);
    const fromKey = previousPress?.keys[0]?.id;
    if (!fromKey || press.keys.length === 0) continue;
    motions.push({
      fromKey,
      toKeys: press.keys.map((key) => key.id),
      finger: press.finger,
    });
  }
  return motions;
}

function fingerHand(finger: Finger): 'left' | 'right' {
  return finger.startsWith('L') ? 'left' : 'right';
}

/** 打鍵順を既存の図解と同じ丸数字で表示する。 */
export function playbackOrderLabel(order: number): string {
  return order >= 1 && order <= 20 ? String.fromCharCode(0x245f + order) : `(${order})`;
}

function playbackCurrentInputRange(
  strokes: readonly Stroke[],
  cursor: number,
): { start: number; end: number } | undefined {
  const end = Math.min(Math.max(0, cursor), strokes.length);
  if (end === 0) return undefined;
  const inputIndex = strokes[end - 1].inputIndex;
  let start = end - 1;
  while (start > 0 && strokes[start - 1].inputIndex === inputIndex) start--;
  let finish = end;
  while (finish < strokes.length && strokes[finish].inputIndex === inputIndex) finish++;
  return { start, end: finish };
}

/** 現在の入力単位について、予定綴りと打鍵済みの接頭辞を返す。 */
export function playbackRomajiPlan(
  strokes: readonly Stroke[],
  cursor: number,
): PlaybackRomajiPlan | undefined {
  const end = Math.min(Math.max(0, cursor), strokes.length);
  const range = playbackCurrentInputRange(strokes, end);
  if (!range) return undefined;
  return {
    planned: strokes.slice(range.start, range.end).map((stroke) => stroke.char).join(''),
    typed: strokes.slice(range.start, end).map((stroke) => stroke.char).join(''),
  };
}

/** 現在のローマ字入力単位で、まだ押していないキーを緑色表示するための不透明度を返す。 */
export function playbackRomajiPlannedKeys(
  strokes: readonly Stroke[],
  cursor: number,
): ReadonlyMap<string, number> {
  const end = Math.min(Math.max(0, cursor), strokes.length);
  const range = playbackCurrentInputRange(strokes, end);
  const planned = new Map<string, number>();
  if (!range) return planned;

  for (let index = end; index < range.end; index++) {
    for (const press of strokes[index].presses) {
      for (const key of press.keys) planned.set(key.id, 1);
    }
  }
  return planned;
}

/** 現在のローマ字入力単位で、まだ押していないキーに順番を割り当てる。 */
export function playbackRomajiPlannedOrders(
  strokes: readonly Stroke[],
  cursor: number,
): ReadonlyMap<string, number> {
  const end = Math.min(Math.max(0, cursor), strokes.length);
  const range = playbackCurrentInputRange(strokes, end);
  const orders = new Map<string, number>();
  if (!range) return orders;

  for (let index = end; index < range.end; index++) {
    const order = index - end + 1;
    for (const press of strokes[index].presses) {
      for (const key of press.keys) orders.set(key.id, Math.min(orders.get(key.id) ?? Infinity, order));
    }
  }
  return orders;
}

/** カーソル以降の先読みステップについて、近さに応じた不透明度を返す。 */
export function playbackPlannedKeys(
  strokes: readonly Stroke[],
  cursor: number,
  lookahead = 5,
): ReadonlyMap<string, number> {
  const start = Math.min(Math.max(0, cursor), strokes.length);
  const planned = new Map<string, number>();
  const span = Math.floor(lookahead);
  if (start >= strokes.length || span <= 0) return planned;

  const finish = Math.min(strokes.length, start + span);
  const actualSpan = finish - start;

  for (let index = start; index < finish; index++) {
    const opacity = (finish - index) / actualSpan;
    for (const press of strokes[index].presses) {
      for (const key of press.keys) {
        planned.set(key.id, Math.max(planned.get(key.id) ?? 0, opacity));
      }
    }
  }
  return planned;
}

/** 先読み範囲の各キーに、次の打鍵から数えた順番を割り当てる。 */
export function playbackPlannedOrders(
  strokes: readonly Stroke[],
  cursor: number,
  lookahead = 5,
): ReadonlyMap<string, number> {
  const start = Math.min(Math.max(0, cursor), strokes.length);
  const orders = new Map<string, number>();
  const span = Math.floor(lookahead);
  if (start >= strokes.length || span <= 0) return orders;

  const finish = Math.min(strokes.length, start + span);
  for (let index = start; index < finish; index++) {
    const order = index - start + 1;
    for (const press of strokes[index].presses) {
      for (const key of press.keys) orders.set(key.id, Math.min(orders.get(key.id) ?? Infinity, order));
    }
  }
  return orders;
}

/** 直近tauステップの押下キーと、残留表示に使う不透明度を返す。 */
export function playbackTrailKeys(
  strokes: readonly Stroke[],
  cursor: number,
  tau: number,
): ReadonlyMap<string, number> {
  const end = Math.min(Math.max(0, cursor), strokes.length);
  const span = Math.floor(tau);
  const trail = new Map<string, number>();
  if (end === 0 || span <= 0) return trail;

  const start = Math.max(0, end - span);
  for (let index = start; index < end; index++) {
    const age = end - index;
    const opacity = (span - age + 1) / span;
    for (const press of strokes[index].presses) {
      for (const key of press.keys) {
        trail.set(key.id, Math.max(trail.get(key.id) ?? 0, opacity));
      }
    }
  }
  return trail;
}

/** 履歴範囲の各キーに、直近の打鍵から数えた順番を割り当てる。 */
export function playbackTrailOrders(
  strokes: readonly Stroke[],
  cursor: number,
  tau: number,
): ReadonlyMap<string, number> {
  const end = Math.min(Math.max(0, cursor), strokes.length);
  const span = Math.floor(tau);
  const orders = new Map<string, number>();
  if (end === 0 || span <= 0) return orders;

  const start = Math.max(0, end - span);
  for (let index = end - 1; index >= start; index--) {
    const order = end - index;
    for (const press of strokes[index].presses) {
      for (const key of press.keys) orders.set(key.id, Math.min(orders.get(key.id) ?? Infinity, order));
    }
  }
  return orders;
}

/** 再生中の層に対応する面グループを返す。単一面も含めて表示用に扱う。 */
function playbackLayer(layout: Layout, layerId: string): Layer | undefined {
  if (!layout.faces || !layout.faceLayerIds) return undefined;
  const groups = classifyFaces(layout.faces);
  return [...groups.layers, ...groups.modifiers].find((layer) =>
    layer.faces.some((face) => layout.faceLayerIds?.get(face) === layerId),
  );
}

/** 再生中の各指の位置に対応するキーと指を返す。 */
export function playbackFingerPositionKeys(
  stroke: Stroke | undefined,
  geometry: Geometry,
): ReadonlyMap<string, Finger> {
  const positionedKeys = new Map<string, Finger>();

  for (const finger of ALL_FINGERS) {
    const position = stroke?.positions[finger] ?? geometry.homes[finger];
    const key = [...geometry.keys.values()].find(
      (candidate) => candidate.finger === finger && candidate.x === position.x && candidate.y === position.y,
    );
    if (key) positionedKeys.set(key.id, finger);
  }

  // 1本の指で複数キーを同時に押す場合、位置は重心になってキーと一致しない。
  // その場合も押下されたキーを指の位置として囲み、表示から消えないようにする。
  for (const press of stroke?.presses ?? []) {
    for (const key of press.keys) positionedKeys.set(key.id, press.finger);
  }
  return positionedKeys;
}

/** 現在のステップより前に入力し終えた単位を、直近から指定数だけ返す。 */
export function playbackCompletedInputs(
  strokes: readonly Stroke[],
  cursor: number,
  limit = DEFAULT_PLAYBACK_RATE_WINDOW,
): string[] {
  const end = Math.min(Math.max(0, cursor), strokes.length);
  if (end === 0 || limit <= 0) return [];
  const currentInputIndex = strokes[end - 1].inputIndex;
  const completed: string[] = [];

  for (let at = 0; at < end; ) {
    const inputIndex = strokes[at].inputIndex;
    let next = at + 1;
    while (next < strokes.length && strokes[next].inputIndex === inputIndex) next++;
    if (next <= end && inputIndex !== currentInputIndex) completed.push(strokes[next - 1].inputChar);
    at = next;
  }
  return completed.slice(-limit);
}

export type PlaybackInputPreviewKind = 'completed' | 'current' | 'planned';

export interface PlaybackInputPreviewSegment {
  text: string;
  kind: PlaybackInputPreviewKind;
}

/** 入力済み・現在・先読みの入力単位を表示順に返す。先読み値は打鍵ステップ数として扱う。 */
export function playbackInputPreview(
  strokes: readonly Stroke[],
  cursor: number,
  lookaheadSteps = 0,
  completedLimit = 10,
): PlaybackInputPreviewSegment[] {
  const end = Math.min(Math.max(0, cursor), strokes.length);
  const groups: { inputIndex: number; start: number; end: number }[] = [];

  for (let start = 0; start < strokes.length; ) {
    const inputIndex = strokes[start].inputIndex;
    let finish = start + 1;
    while (finish < strokes.length && strokes[finish].inputIndex === inputIndex) finish++;
    groups.push({ inputIndex, start, end: finish });
    start = finish;
  }

  const currentInputIndex = end > 0 ? strokes[end - 1].inputIndex : undefined;
  const currentGroupIndex = groups.findIndex((group) => group.inputIndex === currentInputIndex);
  const limit = Math.max(0, Math.floor(completedLimit));
  const completed = currentGroupIndex < 0
    ? []
    : limit === 0 ? [] : groups.slice(0, currentGroupIndex).slice(-limit);
  const futureEnd = Math.min(strokes.length, end + Math.max(0, Math.floor(lookaheadSteps)));
  const planned = groups.filter((group) =>
    group.inputIndex !== currentInputIndex && group.end > end && group.start < futureEnd,
  );

  return [
    ...completed.map((group) => ({ text: strokes[group.end - 1].inputChar, kind: 'completed' as const })),
    ...(currentGroupIndex < 0
      ? []
      : [{ text: strokes[groups[currentGroupIndex].end - 1].inputChar, kind: 'current' as const }]),
    ...planned.map((group) => ({ text: strokes[group.end - 1].inputChar, kind: 'planned' as const })),
  ];
}

/** 面定義と実際の押下から、再生中に表示する文字と刻印を引く。 */
export function playbackStrokeDisplay(layout: Layout, stroke: Stroke): PlaybackStrokeDisplay {
  if (layout.romajiTable || !layout.faces || !layout.faceLayerIds) {
    return { keyLabels: new Map() };
  }

  const triggerKeys = new Set(stroke.triggerKeys.map(resolveKeyId));
  const layerFaces = layout.faces.filter((face) => layout.faceLayerIds?.get(face) === stroke.layerId);
  const triggeredFaces = triggerKeys.size === 0
    ? layerFaces
    : layerFaces.filter((face) => {
      const faceTriggers = face.trigger.map(resolveKeyId);
      return faceTriggers.length === triggerKeys.size && faceTriggers.every((key) => triggerKeys.has(key));
    });
  const pressedKeys = [...new Set(stroke.presses.flatMap((press) => press.keys.map((key) => key.id)))];
  const outputKeys = pressedKeys.filter((key) => !triggerKeys.has(key));
  // prefix/suffixの出力ステップではtriggerが空になるため、出力文字から元の面を絞る。
  // 同じlayerに複数のシフト面がある場合も、別面の刻印を混ぜない。
  const outputFaces = triggerKeys.size === 0 && outputKeys.length > 0
    ? layerFaces.filter((face) => outputKeys.some((key) => faceCells(face).get(key) === stroke.char))
    : [];
  const faces = outputFaces.length > 0 ? outputFaces : triggeredFaces;
  const layer = playbackLayer(layout, stroke.layerId);
  const keyLabels = new Map<string, string>();

  // 面に空欄として定義されたキーは、基底面の刻印へ戻さず空欄にする。
  for (const face of layer?.faces ?? faces) {
    face.rows.forEach((row, rowIndex) => {
      const cells = typeof row === 'string' ? [...row] : [...row];
      cells.forEach((_label, colIndex) => keyLabels.set(keyId(rowIndex, colIndex), ''));
    });
  }
  const labels = layer ? foldedLayerCells(layer, layout.faces ?? []) : undefined;
  if (labels) {
    for (const [key, label] of labels) keyLabels.set(key, label);
  } else {
    for (const face of faces) {
      for (const [key, label] of faceCells(face)) {
        const previous = keyLabels.get(key);
        keyLabels.set(key, previous && label !== previous ? `${previous} / ${label}` : label);
      }
    }
  }
  for (const key of triggerKeys) keyLabels.set(key, '⇧');

  const character = outputKeys
    .map((key) => keyLabels.get(key))
    .filter((label): label is string => label !== undefined && label !== '')
    .join(' / ');
  return { character: character || undefined, keyLabels };
}

export function createPlaybackState(
  stepsPerSecond: PlaybackStepsPerSecond = DEFAULT_PLAYBACK_STEPS_PER_SECOND,
  sameFingerDelay = true,
  calibration?: PlaybackCalibration,
  speedMultiplier = DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
): PlaybackState {
  return {
    cursor: 0,
    stepsPerSecond,
    speedMultiplier,
    sameFingerDelay,
    calibration,
    playing: false,
    elapsedMs: 0,
  };
}

export function clampPlaybackCursor(cursor: number, strokeCount: number): number {
  return Math.min(Math.max(0, cursor), Math.max(0, strokeCount));
}

/** カーソル位置に表示する打鍵。0は開始前なので文字を表示しない。 */
export function playbackStrokeAt(strokes: readonly Stroke[], cursor: number): Stroke | undefined {
  if (cursor <= 0 || strokes.length === 0) return undefined;
  return strokes[Math.min(cursor - 1, strokes.length - 1)];
}

export function setPlaybackStepsPerSecond(
  state: PlaybackState,
  stepsPerSecond: PlaybackStepsPerSecond,
): PlaybackState {
  return { ...state, stepsPerSecond, elapsedMs: 0 };
}

export function setPlaybackSpeedMultiplier(
  state: PlaybackState,
  speedMultiplier: number,
): PlaybackState {
  return { ...state, speedMultiplier, elapsedMs: 0 };
}

export function setPlaybackSameFingerDelay(
  state: PlaybackState,
  sameFingerDelay: boolean,
): PlaybackState {
  return { ...state, sameFingerDelay, elapsedMs: 0 };
}

export function setPlaybackCalibration(
  state: PlaybackState,
  calibration: PlaybackCalibration | undefined,
): PlaybackState {
  return { ...state, calibration, elapsedMs: 0 };
}

function normalPlaybackStepMs(stepsPerSecond: PlaybackStepsPerSecond): number {
  return Number.isFinite(stepsPerSecond) && stepsPerSecond > 0
    ? 1000 / stepsPerSecond
    : Number.POSITIVE_INFINITY;
}

function playbackSameHandDifferentFingerPair(
  stroke: Stroke | undefined,
  previousStroke: Stroke | undefined,
): string | undefined {
  if (!stroke || !previousStroke) return undefined;
  for (const press of stroke.presses) {
    for (const previousPress of previousStroke.presses) {
      if (fingerHand(press.finger) !== fingerHand(previousPress.finger)
        || press.finger === previousPress.finger) continue;
      const pair = sameHandFingerPairKey(press.finger, previousPress.finger);
      if (pair !== undefined) return pair;
    }
  }
  return undefined;
}

function playbackCrossHandDirection(
  stroke: Stroke | undefined,
  previousStroke: Stroke | undefined,
): 'L→R' | 'R→L' | undefined {
  if (!stroke || !previousStroke) return undefined;
  for (const press of stroke.presses) {
    for (const previousPress of previousStroke.presses) {
      const direction = handDirection(previousPress.finger, press.finger);
      if (direction !== undefined) return direction;
    }
  }
  return undefined;
}

function playbackSameHandDirectedPair(
  stroke: Stroke | undefined,
  previousStroke: Stroke | undefined,
): string | undefined {
  if (!stroke || !previousStroke) return undefined;
  for (const press of stroke.presses) {
    for (const previousPress of previousStroke.presses) {
      if (fingerHand(press.finger) !== fingerHand(previousPress.finger)
        || press.finger === previousPress.finger) continue;
      const pair = sameHandDirectedFingerPairKey(previousPress.finger, press.finger);
      if (pair !== undefined) return pair;
    }
  }
  return undefined;
}

function playbackTransitionRate(
  stroke: Stroke | undefined,
  previousStroke: Stroke | undefined,
  stepsPerSecond: PlaybackStepsPerSecond,
  calibration?: PlaybackCalibration,
): number {
  const crossDirection = playbackCrossHandDirection(stroke, previousStroke);
  if (crossDirection !== undefined) {
    return calibration?.actionsPerSecondByDirection?.[crossDirection]
      ?? calibration?.actionsPerSecond
      ?? stepsPerSecond;
  }

  const sameHandPair = playbackSameHandDifferentFingerPair(stroke, previousStroke);
  if (sameHandPair !== undefined) {
    const directedPair = playbackSameHandDirectedPair(stroke, previousStroke);
    return (directedPair === undefined
      ? undefined
      : calibration?.sameHandDifferentFingerActionsPerDirectedPair?.[directedPair])
      ?? calibration?.sameHandDifferentFingerActionsPerSecondByPair[sameHandPair]
      ?? calibration?.sameHandDifferentFingerActionsPerSecond
      ?? stepsPerSecond;
  }

  return calibration?.actionsPerSecond ?? stepsPerSecond;
}

function playbackTransitionRateFromAnalysis(
  analysis: Pick<AggregatedAnalysisResult, 'strokes' | 'transitions'>,
  strokeIndex: number,
  stepsPerSecond: PlaybackStepsPerSecond,
  calibration?: PlaybackCalibration,
): number {
  const stroke = analysis.strokes[strokeIndex];
  const previousStroke = analysis.strokes[strokeIndex - 1];

  // 異手方向はAnalysisResult内の元Strokeから読む。L→R / R→Lは常に方向別Calibration対象。
  const crossDirection = playbackCrossHandDirection(stroke, previousStroke);
  if (crossDirection !== undefined) {
    return calibration?.actionsPerSecondByDirection?.[crossDirection]
      ?? calibration?.actionsPerSecond
      ?? stepsPerSecond;
  }

  // 同手別指はHandTransitionのcandidateをsource of truthとして有向pairを選ぶ。
  const transitionCandidates = analysis.transitions
    .filter((transition) => transition.toStrokeIndex === strokeIndex)
    .flatMap((transition) => transition.candidates);
  for (const candidate of transitionCandidates) {
    if (candidate.fromFinger === candidate.toFinger) continue;
    const directedPair = sameHandDirectedFingerPairKey(
      candidate.fromFinger,
      candidate.toFinger,
    );
    const unorderedPair = sameHandFingerPairKey(
      candidate.fromFinger,
      candidate.toFinger,
    );
    if (unorderedPair === undefined) continue;
    return (directedPair === undefined
      ? undefined
      : calibration?.sameHandDifferentFingerActionsPerDirectedPair?.[directedPair])
      ?? calibration?.sameHandDifferentFingerActionsPerSecondByPair[unorderedPair]
      ?? calibration?.sameHandDifferentFingerActionsPerSecond
      ?? stepsPerSecond;
  }

  // Chain境界等でHandTransitionが無い場合も、元Strokeの通常fallbackは維持する。
  return playbackTransitionRate(stroke, previousStroke, stepsPerSecond, calibration);
}

/** 1ステップを表示する時間。正規化ディレイは1uを通常の1アクション相当とする。 */
export function playbackStrokeDurationMs(
  stroke: Stroke | undefined,
  stepsPerSecond: PlaybackStepsPerSecond,
  sameFingerDelay = true,
  calibration?: PlaybackCalibration,
  previousStroke?: Stroke,
  speedMultiplier = DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
): number {
  const normalMs = normalPlaybackStepMs(playbackTransitionRate(
    stroke,
    previousStroke,
    stepsPerSecond,
    calibration,
  ));
  return playbackStrokeDurationFromNormalMs(
    stroke,
    normalMs,
    sameFingerDelay,
    calibration,
    speedMultiplier,
  );
}

function playbackStrokeDurationFromNormalMs(
  stroke: Stroke | undefined,
  normalMs: number,
  sameFingerDelay: boolean,
  calibration: PlaybackCalibration | undefined,
  speedMultiplier: number,
): number {
  const multiplier = Number.isFinite(speedMultiplier) && speedMultiplier > 0
    ? speedMultiplier
    : DEFAULT_PLAYBACK_SPEED_MULTIPLIER;
  if (!stroke || !sameFingerDelay) return normalMs / multiplier;

  const sfbPresses = stroke.presses.filter((press) => press.sfb);
  if (sfbPresses.length === 0) return normalMs / multiplier;

  const sameFingerDistance = Math.max(1, ...sfbPresses.map((press) => press.distance));
  if (calibration) {
    const movementMs = Math.max(
      ...sfbPresses.map((press) => {
        const speed = calibration.fingerSpeedUnitsPerSecond[press.finger]
          ?? calibration.fallbackFingerSpeedUnitsPerSecond;
        return (press.distance / speed) * 1000;
      }),
    );
    return Math.max(normalMs, movementMs) / multiplier;
  }
  return Math.max(normalMs, normalMs * sameFingerDistance) / multiplier;
}

/**
 * AnalysisResultの隣接Transitionを1回だけ評価するproduction用Timing入口。
 * ArpeggioSpan / Roll / Redirect所属はduration sourceにしない。
 */
export function playbackStepDurationMs(
  analysis: Pick<AggregatedAnalysisResult, 'strokes' | 'transitions'>,
  strokeIndex: number,
  stepsPerSecond: PlaybackStepsPerSecond,
  sameFingerDelay = true,
  calibration?: PlaybackCalibration,
  speedMultiplier = DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
): number {
  const stroke = analysis.strokes[strokeIndex];
  const rate = playbackTransitionRateFromAnalysis(
    analysis,
    strokeIndex,
    stepsPerSecond,
    calibration,
  );
  const normalMs = normalPlaybackStepMs(rate);
  return playbackStrokeDurationFromNormalMs(
    stroke,
    normalMs,
    sameFingerDelay,
    calibration,
    speedMultiplier,
  );
}

export interface PlaybackTimingStep {
  strokeIndex: number;
  startMs: number;
  endMs: number;
  /** このphysical Strokeを何actionとして再生するか。通常1、hold開始分離時は2。 */
  actionCount?: number;
  /** hold開始virtual actionの終了時刻。未分離ならundefined。 */
  holdStartEndMs?: number;
}

export interface PlaybackTimingOptions {
  /** 全指の物理移動が間に合う時刻までStrokeを遅らせる。既定false。 */
  allFingerMovementDelay?: boolean;
  /** allFingerMovementDelay=trueの時にホーム位置を得るため必須。 */
  geometry?: Geometry;
  /** hold開始を独立actionとして再生へ反映するPolicy。 */
  holdStartActionPolicy?: HoldStartActionPolicy;
}

export function playbackTimingStepDurationMs(
  schedule: readonly PlaybackTimingStep[] | undefined,
  strokeIndex: number,
): number | undefined {
  const step = schedule?.[strokeIndex];
  return step ? Math.max(0, step.endMs - step.startMs) : undefined;
}

export function playbackTimingActionCount(
  schedule: readonly PlaybackTimingStep[] | undefined,
  strokeIndex: number,
): number {
  return schedule?.[strokeIndex]?.actionCount ?? 1;
}

function playbackTimingActionCountRange(
  schedule: readonly PlaybackTimingStep[] | undefined,
  start: number,
  end: number,
): number {
  let count = 0;
  for (let index = start; index < end; index++) {
    count += playbackTimingActionCount(schedule, index);
  }
  return count;
}

/**
 * §3で確定したbase durationを累積したTiming schedule。
 * allFingerMovementDelay=trueでは、各指の到達可能時刻を追加max制約として適用する。
 */
export function playbackTimingSchedule(
  analysis: Pick<AggregatedAnalysisResult, 'strokes' | 'transitions'>,
  stepsPerSecond: PlaybackStepsPerSecond,
  sameFingerDelay = true,
  calibration?: PlaybackCalibration,
  speedMultiplier = DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
  options: PlaybackTimingOptions = {},
): PlaybackTimingStep[] {
  const holdStartActionPolicy = options.holdStartActionPolicy ?? DEFAULT_HOLD_START_ACTION_POLICY;
  const baseDurations = analysis.strokes.map((_stroke, strokeIndex) =>
    playbackStepDurationMs(
      analysis,
      strokeIndex,
      stepsPerSecond,
      sameFingerDelay,
      calibration,
      speedMultiplier,
    ));
  const holdStartDurations = analysis.strokes.map((stroke, strokeIndex) =>
    hasSeparateHoldStartAction(stroke, holdStartActionPolicy)
      ? normalPlaybackStepMs(playbackTransitionRateFromAnalysis(
          analysis,
          strokeIndex,
          stepsPerSecond,
          calibration,
        )) / (Number.isFinite(speedMultiplier) && speedMultiplier > 0
          ? speedMultiplier
          : DEFAULT_PLAYBACK_SPEED_MULTIPLIER)
      : 0);

  if (!options.allFingerMovementDelay) {
    let atMs = 0;
    return baseDurations.map((durationMs, strokeIndex) => {
      const startMs = atMs;
      const holdStartDurationMs = holdStartDurations[strokeIndex];
      const holdStartEndMs = holdStartDurationMs > 0 ? startMs + holdStartDurationMs : undefined;
      atMs += holdStartDurationMs + durationMs;
      return {
        strokeIndex,
        startMs,
        endMs: atMs,
        actionCount: holdStartDurationMs > 0 ? 2 : 1,
        ...(holdStartEndMs === undefined ? {} : { holdStartEndMs }),
      };
    });
  }

  const geometry = options.geometry;
  if (!geometry) throw new Error('allFingerMovementDelay requires geometry');

  const lastPosition = {} as Record<Finger, Point>;
  const freeAtMs = {} as Record<Finger, number>;
  for (const finger of ALL_FINGERS) {
    lastPosition[finger] = geometry.homes[finger];
    freeAtMs[finger] = 0;
  }

  const schedule: PlaybackTimingStep[] = [];
  let atMs = 0;

  for (const [strokeIndex, stroke] of analysis.strokes.entries()) {
    const startMs = atMs;
    const holdStartDurationMs = holdStartDurations[strokeIndex];
    const holdStartEndMs = holdStartDurationMs > 0 ? startMs + holdStartDurationMs : undefined;
    let endMs = startMs + holdStartDurationMs + baseDurations[strokeIndex];

    // actual Pressだけが新しい移動要求。held-trigger/continueは後段で占有時間だけ延ばす。
    for (const press of stroke.presses) {
      const moveMs = playbackFingerMoveMs(
        lastPosition[press.finger],
        press.target,
        press.finger,
        stepsPerSecond,
        calibration,
        speedMultiplier,
      );
      endMs = Math.max(endMs, freeAtMs[press.finger] + moveMs);
    }

    schedule.push({
      strokeIndex,
      startMs,
      endMs,
      actionCount: holdStartDurationMs > 0 ? 2 : 1,
      ...(holdStartEndMs === undefined ? {} : { holdStartEndMs }),
    });
    atMs = endMs;

    const pressedFingers = new Set(stroke.presses.map((press) => press.finger));
    for (const press of stroke.presses) {
      lastPosition[press.finger] = press.target;
      freeAtMs[press.finger] = endMs;
    }

    // held-trigger/continueは新規Pressではないが、保持Stroke終了まではその指を動かせない。
    for (const participation of stroke.participations) {
      if (pressedFingers.has(participation.finger)) continue;
      if (!participation.roles.includes('held-trigger')) continue;
      lastPosition[participation.finger] = stroke.positions[participation.finger]
        ?? lastPosition[participation.finger];
      freeAtMs[participation.finger] = endMs;
    }
  }

  return schedule;
}

function isActualPressParticipation(
  participation: Stroke['participations'][number],
): boolean {
  return participation.roles.includes('output') || participation.roles.includes('trigger');
}

function previousFingerOccupancyEndMs(
  strokes: readonly Stroke[],
  schedule: readonly PlaybackTimingStep[],
  beforeStrokeIndex: number,
  finger: Finger,
): number {
  for (let index = beforeStrokeIndex - 1; index >= 0; index--) {
    // held-trigger/continue は次のPressではないが、その指は保持中で移動できない。
    // 実Pressだけでなくparticipation全体を見て、最後に指が塞がるStrokeの終了までclampする。
    if (strokes[index].participations.some((participation) =>
      participation.finger === finger)) {
      return schedule[index]?.endMs ?? 0;
    }
  }
  return 0;
}

function playbackFingerMoveMs(
  from: Point,
  to: Point,
  finger: Finger,
  stepsPerSecond: PlaybackStepsPerSecond,
  calibration: PlaybackCalibration | undefined,
  speedMultiplier: number,
): number {
  const distance = dist(from, to);
  if (distance <= 0) return 0;
  const speed = calibration
    ? calibration.fingerSpeedUnitsPerSecond[finger] ?? calibration.fallbackFingerSpeedUnitsPerSecond
    : stepsPerSecond;
  const multiplier = Number.isFinite(speedMultiplier) && speedMultiplier > 0
    ? speedMultiplier
    : DEFAULT_PLAYBACK_SPEED_MULTIPLIER;
  return Number.isFinite(speed) && speed > 0
    ? (distance / speed) * 1000 / multiplier
    : Number.POSITIVE_INFINITY;
}

/**
 * 次の実Pressへ向けた準備時間を反映した指位置表示を返す。
 * held-triggerの継続だけのparticipationは「次のPress」として扱わない。
 */
export function playbackPreparedFingerPositionKeys(
  analysis: Pick<AggregatedAnalysisResult, 'strokes'>,
  schedule: readonly PlaybackTimingStep[],
  cursor: number,
  elapsedMs: number,
  geometry: Geometry,
  preparationSeconds: number,
  stepsPerSecond: PlaybackStepsPerSecond,
  calibration?: PlaybackCalibration,
  speedMultiplier = DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
): ReadonlyMap<string, Finger> {
  const strokes = analysis.strokes;
  const end = clampPlaybackCursor(cursor, strokes.length);
  const displayedStroke = end > 0 ? strokes[end - 1] : undefined;
  const positionedKeys = new Map(playbackFingerPositionKeys(displayedStroke, geometry));
  const preparationMs = Number.isFinite(preparationSeconds) && preparationSeconds > 0
    ? preparationSeconds * 1000
    : 0;
  if (preparationMs === 0 || end >= strokes.length) return positionedKeys;

  const nowMs = (end > 0 ? schedule[end - 1]?.endMs ?? 0 : 0) + Math.max(0, elapsedMs);

  for (const finger of ALL_FINGERS) {
    let targetIndex = -1;
    for (let index = end; index < strokes.length; index++) {
      if (strokes[index].participations.some((participation) =>
        participation.finger === finger && isActualPressParticipation(participation))) {
        targetIndex = index;
        break;
      }
    }
    if (targetIndex < 0) continue;

    const press = strokes[targetIndex].presses.find((candidate) => candidate.finger === finger);
    if (!press) continue;
    const currentPosition = displayedStroke?.positions[finger] ?? geometry.homes[finger];
    const moveMs = playbackFingerMoveMs(
      currentPosition,
      press.target,
      finger,
      stepsPerSecond,
      calibration,
      speedMultiplier,
    );
    const pressTimeMs = schedule[targetIndex]?.endMs;
    if (pressTimeMs === undefined) continue;
    const idealStartMs = pressTimeMs - preparationMs - moveMs;
    const actualStartMs = Math.max(
      idealStartMs,
      previousFingerOccupancyEndMs(strokes, schedule, targetIndex, finger),
    );
    const arrivalMs = Math.min(pressTimeMs, actualStartMs + moveMs);
    if (nowMs < arrivalMs) continue;

    for (const [keyId, positionedFinger] of [...positionedKeys]) {
      if (positionedFinger === finger) positionedKeys.delete(keyId);
    }
    for (const key of press.keys) positionedKeys.set(key.id, finger);
  }

  return positionedKeys;
}

interface PlaybackRateWindow {
  start: number;
  end: number;
  durationMs: number;
}

export interface PlaybackRateChartPoint {
  cursor: number;
  /** 直近の集計窓に触れた入力単位を表示順に連結した文字列。 */
  inputText: string;
  kanaPerSecond?: number;
  actionsPerSecond?: number;
  chain?: boolean;
  arpeggio?: boolean;
}

function playbackRecentRateWindow(
  analysis: AggregatedAnalysisResult,
  cursor: number,
  stepsPerSecond: PlaybackStepsPerSecond,
  sameFingerDelay: boolean,
  limit: number,
  calibration?: PlaybackCalibration,
  speedMultiplier = DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
  schedule?: readonly PlaybackTimingStep[],
): PlaybackRateWindow | undefined {
  const strokes = analysis.strokes;
  const end = clampPlaybackCursor(cursor, strokes.length);
  const span = Math.max(0, Math.floor(limit));
  const start = Math.max(0, end - span);
  if (start === end) return undefined;

  const durationMs = Array.from(
    { length: end - start },
    (_, offset) => start + offset,
  ).reduce((total, index) => total + (
    playbackTimingStepDurationMs(schedule, index)
      ?? playbackStepDurationMs(
        analysis,
        index,
        stepsPerSecond,
        sameFingerDelay,
        calibration,
        speedMultiplier,
      )
  ), 0);
  return { start, end, durationMs };
}

function playbackRateWindowInputText(
  strokes: readonly Stroke[],
  recent: PlaybackRateWindow,
): string {
  const inputs: string[] = [];
  for (let at = recent.start; at < recent.end; ) {
    const inputIndex = strokes[at].inputIndex;
    let next = at + 1;
    while (next < strokes.length && strokes[next].inputIndex === inputIndex) next++;
    const startsInWindow = at === recent.start || strokes[at - 1].inputIndex !== inputIndex;
    if (startsInWindow) inputs.push(strokes[next - 1].inputChar);
    at = next;
  }
  return inputs.join('');
}

interface PlaybackEwmaRate {
  inputText: string;
  kanaPerSecond?: number;
  actionsPerSecond?: number;
}

function playbackEwmaRate(
  analysis: AggregatedAnalysisResult,
  cursor: number,
  stepsPerSecond: PlaybackStepsPerSecond,
  sameFingerDelay: boolean,
  halfLifeSeconds: number,
  calibration?: PlaybackCalibration,
  speedMultiplier = DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
  schedule?: readonly PlaybackTimingStep[],
): PlaybackEwmaRate | undefined {
  const strokes = analysis.strokes;
  const end = clampPlaybackCursor(cursor, strokes.length);
  if (end === 0 || halfLifeSeconds <= 0) return undefined;

  let actionRate: number | undefined;
  let kanaRate: number | undefined;
  const completedInputs: string[] = [];

  for (let index = 0; index < end; index++) {
    const durationMs = playbackTimingStepDurationMs(schedule, index)
      ?? playbackStepDurationMs(
        analysis,
        index,
        stepsPerSecond,
        sameFingerDelay,
        calibration,
        speedMultiplier,
      );
    if (!(durationMs > 0)) continue;

    const decay = 2 ** (-(durationMs / 1000) / halfLifeSeconds);
    const actionInstant = (playbackTimingActionCount(schedule, index) * 1000) / durationMs;
    actionRate = actionRate === undefined
      ? actionInstant
      : decay * actionRate + (1 - decay) * actionInstant;

    const inputIndex = strokes[index].inputIndex;
    const nextStartsNewInput = index + 1 >= strokes.length
      || strokes[index + 1].inputIndex !== inputIndex;
    const completedHere = nextStartsNewInput
      ? Array.from(strokes[index].inputChar).length
      : 0;
    if (completedHere > 0) {
      const kanaInstant = (completedHere * 1000) / durationMs;
      kanaRate = kanaRate === undefined
        ? kanaInstant
        : decay * kanaRate + (1 - decay) * kanaInstant;
      completedInputs.push(strokes[index].inputChar);
    } else if (kanaRate !== undefined) {
      // 最初の入力単位が完了するまでは未観測。以後の入力途中Strokeでは0へ時間減衰する。
      kanaRate *= decay;
    }
  }

  return {
    inputText: completedInputs.slice(-6).join(''),
    kanaPerSecond: kanaRate,
    actionsPerSecond: actionRate,
  };
}

/** 直近の完了済みStrokeを確定Timingで割った移動平均アクション毎秒。 */
export function playbackRecentActionsPerSecond(
  analysis: AggregatedAnalysisResult,
  cursor: number,
  stepsPerSecond: PlaybackStepsPerSecond,
  sameFingerDelay = true,
  limit = DEFAULT_PLAYBACK_RATE_WINDOW,
  calibration?: PlaybackCalibration,
  speedMultiplier = DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
  schedule?: readonly PlaybackTimingStep[],
  average: PlaybackRateAverage = DEFAULT_PLAYBACK_RATE_AVERAGE,
  halfLifeSeconds = DEFAULT_PLAYBACK_RATE_HALF_LIFE_SECONDS,
): number | undefined {
  if (average === 'ewma') {
    return playbackEwmaRate(
      analysis,
      cursor,
      stepsPerSecond,
      sameFingerDelay,
      halfLifeSeconds,
      calibration,
      speedMultiplier,
      schedule,
    )?.actionsPerSecond;
  }
  const recent = playbackRecentRateWindow(
    analysis,
    cursor,
    stepsPerSecond,
    sameFingerDelay,
    limit,
    calibration,
    speedMultiplier,
    schedule,
  );
  return recent && recent.durationMs > 0
    ? (playbackTimingActionCountRange(schedule, recent.start, recent.end) * 1000) / recent.durationMs
    : undefined;
}

/** 直近の入力単位に含まれるかな文字数を、同じTransition Timingで割る。 */
export function playbackRecentKanaPerSecond(
  analysis: AggregatedAnalysisResult,
  cursor: number,
  stepsPerSecond: PlaybackStepsPerSecond,
  sameFingerDelay = true,
  limit = DEFAULT_PLAYBACK_RATE_WINDOW,
  calibration?: PlaybackCalibration,
  speedMultiplier = DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
  schedule?: readonly PlaybackTimingStep[],
  average: PlaybackRateAverage = DEFAULT_PLAYBACK_RATE_AVERAGE,
  halfLifeSeconds = DEFAULT_PLAYBACK_RATE_HALF_LIFE_SECONDS,
): number | undefined {
  if (average === 'ewma') {
    return playbackEwmaRate(
      analysis,
      cursor,
      stepsPerSecond,
      sameFingerDelay,
      halfLifeSeconds,
      calibration,
      speedMultiplier,
      schedule,
    )?.kanaPerSecond;
  }
  const strokes = analysis.strokes;
  const recent = playbackRecentRateWindow(
    analysis,
    cursor,
    stepsPerSecond,
    sameFingerDelay,
    limit,
    calibration,
    speedMultiplier,
    schedule,
  );
  if (!recent || recent.durationMs <= 0) return undefined;

  let kanaCount = 0;
  for (let at = recent.start; at < recent.end; ) {
    const inputIndex = strokes[at].inputIndex;
    let next = at + 1;
    while (next < strokes.length && strokes[next].inputIndex === inputIndex) next++;
    const startsInWindow = at === 0 || strokes[at - 1].inputIndex !== inputIndex;
    if (startsInWindow && next <= recent.end) {
      kanaCount += Array.from(strokes[next - 1].inputChar).length;
    }
    at = next;
  }
  return kanaCount > 0 ? (kanaCount * 1000) / recent.durationMs : undefined;
}

/** 再生カーソルごとの速度移動平均と、その集計窓に触れた入力文字列。 */
export function playbackRateChartData(
  analysis: AggregatedAnalysisResult,
  stepsPerSecond: PlaybackStepsPerSecond,
  sameFingerDelay = true,
  limit = DEFAULT_PLAYBACK_RATE_WINDOW,
  calibration?: PlaybackCalibration,
  speedMultiplier = DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
  schedule?: readonly PlaybackTimingStep[],
  average: PlaybackRateAverage = DEFAULT_PLAYBACK_RATE_AVERAGE,
  halfLifeSeconds = DEFAULT_PLAYBACK_RATE_HALF_LIFE_SECONDS,
): PlaybackRateChartPoint[] {
  const strokes = analysis.strokes;
  const points: PlaybackRateChartPoint[] = [{ cursor: 0, inputText: '' }];
  for (let cursor = 1; cursor <= strokes.length; cursor++) {
    const recent = average === 'sma'
      ? playbackRecentRateWindow(
        analysis,
        cursor,
        stepsPerSecond,
        sameFingerDelay,
        limit,
        calibration,
        speedMultiplier,
        schedule,
      )
      : undefined;
    const ewma = average === 'ewma'
      ? playbackEwmaRate(
        analysis,
        cursor,
        stepsPerSecond,
        sameFingerDelay,
        halfLifeSeconds,
        calibration,
        speedMultiplier,
        schedule,
      )
      : undefined;
    points.push({
      cursor,
      inputText: ewma?.inputText ?? (recent ? playbackRateWindowInputText(strokes, recent) : ''),
      kanaPerSecond: average === 'ewma'
        ? ewma?.kanaPerSecond
        : playbackRecentKanaPerSecond(
          analysis,
          cursor,
          stepsPerSecond,
          sameFingerDelay,
          limit,
          calibration,
          speedMultiplier,
          schedule,
        ),
      actionsPerSecond: average === 'ewma'
        ? ewma?.actionsPerSecond
        : recent && recent.durationMs > 0
          ? (playbackTimingActionCountRange(schedule, recent.start, recent.end) * 1000) / recent.durationMs
          : undefined,
      chain: analysis.chains.some((chain) =>
        cursor - 1 >= chain.startStrokeIndex && cursor - 1 < chain.endStrokeIndex),
      arpeggio: analysis.annotations[cursor - 1]?.inArpeggio ?? false,
    });
  }
  return points;
}

/** 停止・一時停止中の1打鍵送り。再生中はカーソルを動かさない。 */
export function stepPlayback(
  state: PlaybackState,
  direction: -1 | 1,
  strokeCount: number,
): PlaybackState {
  if (state.playing) return state;
  return {
    ...state,
    cursor: clampPlaybackCursor(state.cursor + direction, strokeCount),
    elapsedMs: 0,
  };
}

/**
 * 配列を切り替えた時、次に再生するStrokeの入力位置を新しいStroke列へ写す。
 * 同じinputIndexが複数Strokeを持つ場合は、その入力内で完了済みのStroke数も維持する。
 */
export function playbackCursorForEquivalentInputPosition(
  previousStrokes: readonly Pick<Stroke, 'inputIndex'>[],
  nextStrokes: readonly Pick<Stroke, 'inputIndex'>[],
  cursor: number,
): number {
  const previousCursor = clampPlaybackCursor(cursor, previousStrokes.length);
  if (previousCursor === 0) return 0;
  if (previousCursor >= previousStrokes.length) return nextStrokes.length;

  const targetInputIndex = previousStrokes[previousCursor].inputIndex;
  let previousGroupStart = previousCursor;
  while (
    previousGroupStart > 0
    && previousStrokes[previousGroupStart - 1].inputIndex === targetInputIndex
  ) previousGroupStart--;
  const completedInGroup = previousCursor - previousGroupStart;

  const nextGroupStart = nextStrokes.findIndex(
    (stroke) => stroke.inputIndex === targetInputIndex,
  );
  if (nextGroupStart < 0) {
    const nextLater = nextStrokes.findIndex(
      (stroke) => stroke.inputIndex > targetInputIndex,
    );
    return nextLater < 0 ? nextStrokes.length : nextLater;
  }

  let nextGroupEnd = nextGroupStart + 1;
  while (
    nextGroupEnd < nextStrokes.length
    && nextStrokes[nextGroupEnd].inputIndex === targetInputIndex
  ) nextGroupEnd++;

  return nextGroupStart + Math.min(
    completedInGroup,
    nextGroupEnd - nextGroupStart,
  );
}

/**
 * Analysisを再生成した時、現在の再生位置を新しいTimingへ写す。
 * cursor/playingは維持し、現在Stroke内の進捗率を新しいdurationへ変換する。
 */
export function reconcilePlaybackStateAfterAnalysisRefresh(
  previousState: PlaybackState,
  nextBaseState: PlaybackState,
  previousAnalysis: AggregatedAnalysisResult,
  nextAnalysis: AggregatedAnalysisResult,
  nextCursor = previousState.cursor,
  previousSchedule?: readonly PlaybackTimingStep[],
  nextSchedule?: readonly PlaybackTimingStep[],
): PlaybackState {
  const nextStrokeCount = nextAnalysis.strokes.length;
  const cursor = clampPlaybackCursor(nextCursor, nextStrokeCount);
  if (nextStrokeCount === 0 || cursor >= nextStrokeCount) {
    return { ...nextBaseState, cursor, playing: false, elapsedMs: 0 };
  }

  const previousCursor = clampPlaybackCursor(
    previousState.cursor,
    previousAnalysis.strokes.length,
  );
  if (previousCursor >= previousAnalysis.strokes.length) {
    return {
      ...nextBaseState,
      cursor,
      playing: previousState.playing,
      elapsedMs: 0,
    };
  }

  const previousStepMs = playbackTimingStepDurationMs(previousSchedule, previousCursor)
    ?? playbackStepDurationMs(
      previousAnalysis,
      previousCursor,
      previousState.stepsPerSecond,
      previousState.sameFingerDelay,
      previousState.calibration,
      previousState.speedMultiplier,
    );
  const nextStepMs = playbackTimingStepDurationMs(nextSchedule, cursor)
    ?? playbackStepDurationMs(
      nextAnalysis,
      cursor,
      nextBaseState.stepsPerSecond,
      nextBaseState.sameFingerDelay,
      nextBaseState.calibration,
      nextBaseState.speedMultiplier,
    );
  const progress = previousStepMs > 0
    ? Math.min(1, Math.max(0, previousState.elapsedMs / previousStepMs))
    : 0;

  return {
    ...nextBaseState,
    cursor,
    playing: previousState.playing,
    elapsedMs: progress * nextStepMs,
  };
}

/** requestAnimationFrameの経過時間から再生位置を進める。 */
export function advancePlayback(
  state: PlaybackState,
  elapsedMs: number,
  analysis: AggregatedAnalysisResult,
  schedule?: readonly PlaybackTimingStep[],
): PlaybackState {
  const strokeCount = analysis.strokes.length;
  const cursor = clampPlaybackCursor(state.cursor, strokeCount);
  if (!state.playing || strokeCount === 0 || cursor >= strokeCount) {
    return { ...state, cursor, playing: false, elapsedMs: 0 };
  }

  let remaining = state.elapsedMs + Math.min(Math.max(0, elapsedMs), MAX_FRAME_MS);
  let nextCursor = cursor;
  while (nextCursor < strokeCount) {
    const stepMs = playbackTimingStepDurationMs(schedule, nextCursor)
      ?? playbackStepDurationMs(
        analysis,
        nextCursor,
        state.stepsPerSecond,
        state.sameFingerDelay,
        state.calibration,
        state.speedMultiplier,
      );
    if (remaining < stepMs) break;
    remaining -= stepMs;
    nextCursor++;
  }
  const ended = nextCursor >= strokeCount;
  return {
    ...state,
    cursor: nextCursor,
    playing: !ended,
    elapsedMs: ended ? 0 : remaining,
  };
}
