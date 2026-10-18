import { ALL_FINGERS, fingerDist, keyId, resolveKeyId, type Finger, type Geometry, type Point } from '#input/shapes/geometry.ts';
import { classifyPresentationFaces, faceCells, faceDisplayCells, matchesDisplayTriggerAlternative } from '#input/layouts/layers.ts';
import type { Stroke } from '#trace/generate.ts';
import { COMBO_LAYER_ID, type Layout } from '#input/layouts/types.ts';
import {
  CALIBRATION_ACTIONS_PER_SECOND_MAX,
  handDirection,
  playbackMoveMsPerUnit,
  playbackRepeatMs,
  sameHandDirectedFingerPairKey,
  sameHandFingerPairKey,
  sideOverheadKind,
  type PlaybackCalibration,
  type SimultaneousKind,
  type StrokeStructureKind,
} from './calibration.ts';
import type { AggregatedAnalysisResult } from '../structure/aggregate.ts';
import {
  isRepeatStroke,
  strokeOverheadKinds,
  strokeOverheadSide,
  strokeSimultaneousKind,
  strokeStructureKinds,
  type StrokePressFingers,
} from './stroke-structure.ts';

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

/**
 * 打鍵の上乗せを足した時間の下限[ms]。保存値が許す最も速い1打の時間。
 * 上乗せが負の保存値で、時間が0以下になるのを防ぐ。再生倍率で割る前に当てる。
 */
export const PLAYBACK_MIN_STEP_MS = 1000 / CALIBRATION_ACTIONS_PER_SECOND_MAX;

export const DEFAULT_PLAYBACK_SAME_FINGER_DELAY = true;
export const DEFAULT_PLAYBACK_ALL_FINGER_MOVEMENT_DELAY = true;
export const DEFAULT_PLAYBACK_APPLY_PERSONAL_SPEED = true;

/** 時間表を求めるのに読む、構造解析の結果の部分。 */
export type PlaybackTimingAnalysis = Pick<AggregatedAnalysisResult, 'strokes' | 'transitions' | 'chains' | 'arpeggioSpans'>;

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
export function playbackSameFingerKeyMotions(strokes: readonly Stroke[], cursor: number): PlaybackKeyMotion[] {
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

function playbackCurrentInputRange(strokes: readonly Stroke[], cursor: number): { start: number; end: number } | undefined {
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
export function playbackRomajiPlan(strokes: readonly Stroke[], cursor: number): PlaybackRomajiPlan | undefined {
  const end = Math.min(Math.max(0, cursor), strokes.length);
  const range = playbackCurrentInputRange(strokes, end);
  if (!range) return undefined;
  return {
    planned: strokes
      .slice(range.start, range.end)
      .map((stroke) => stroke.char)
      .join(''),
    typed: strokes
      .slice(range.start, end)
      .map((stroke) => stroke.char)
      .join(''),
  };
}

/** 現在のローマ字入力単位で、まだ押していないキーを緑色表示するための不透明度を返す。 */
export function playbackRomajiPlannedKeys(strokes: readonly Stroke[], cursor: number): ReadonlyMap<string, number> {
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
export function playbackRomajiPlannedOrders(strokes: readonly Stroke[], cursor: number): ReadonlyMap<string, number> {
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

/**
 * 押下予定の打鍵の範囲 `[start, finish)`。カーソルの次の打鍵から数える。
 *
 * 今の入力のまだ打っていない打鍵と、開始から今の入力の終わりを引いた値が `windowSize` 以下の入力の打鍵が入る（指を選ぶ範囲と同じ。
 * 仕様 §9.1）。今の入力は、直前に打った打鍵の入力で、カーソルが先頭なら最初の入力とする。
 * 今の入力の残りは、配列やローマ字の綴りの表示の設定によらず入る。
 */
function playbackPlannedStrokeRange(strokes: readonly Stroke[], cursor: number, windowSize: number): { start: number; finish: number } | undefined {
  const start = Math.min(Math.max(0, cursor), strokes.length);
  if (start >= strokes.length) return undefined;
  const current = strokes[start > 0 ? start - 1 : 0];
  let finish = start;
  while (
    finish < strokes.length &&
    (strokes[finish].selectionIndex === current.selectionIndex || strokes[finish].kanaStart - current.kanaEnd <= windowSize)
  )
    finish++;
  return finish > start ? { start, finish } : undefined;
}

/** これから押すキーに、近さに応じた不透明度を返す。範囲は `playbackPlannedStrokeRange`。 */
export function playbackPlannedKeys(strokes: readonly Stroke[], cursor: number, windowSize: number): ReadonlyMap<string, number> {
  const planned = new Map<string, number>();
  const range = playbackPlannedStrokeRange(strokes, cursor, windowSize);
  if (!range) return planned;

  const span = range.finish - range.start;
  for (let index = range.start; index < range.finish; index++) {
    const opacity = (range.finish - index) / span;
    for (const press of strokes[index].presses) {
      for (const key of press.keys) {
        planned.set(key.id, Math.max(planned.get(key.id) ?? 0, opacity));
      }
    }
  }
  return planned;
}

/** 押下予定の範囲の各キーに、次の打鍵から数えた順番を割り当てる。 */
export function playbackPlannedOrders(strokes: readonly Stroke[], cursor: number, windowSize: number): ReadonlyMap<string, number> {
  const orders = new Map<string, number>();
  const range = playbackPlannedStrokeRange(strokes, cursor, windowSize);
  if (!range) return orders;

  for (let index = range.start; index < range.finish; index++) {
    const order = index - range.start + 1;
    for (const press of strokes[index].presses) {
      for (const key of press.keys) orders.set(key.id, Math.min(orders.get(key.id) ?? Infinity, order));
    }
  }
  return orders;
}

/** 直近tauステップの押下キーと、残留表示に使う不透明度を返す。 */
export function playbackTrailKeys(strokes: readonly Stroke[], cursor: number, tau: number): ReadonlyMap<string, number> {
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
export function playbackTrailOrders(strokes: readonly Stroke[], cursor: number, tau: number): ReadonlyMap<string, number> {
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

/** 再生中の各指の位置に対応するキーと指を返す。 */
export function playbackFingerPositionKeys(stroke: Stroke | undefined, geometry: Geometry): ReadonlyMap<string, Finger> {
  const positionedKeys = new Map<string, Finger>();

  for (const finger of ALL_FINGERS) {
    const position = stroke?.positions[finger] ?? geometry.homes[finger];
    // 指が担当するキーのうち、その位置にあるキー（担当が複数の指のキーを含む）
    const key = [...geometry.keys.values()].find(
      (candidate) =>
        (geometry.fingerCandidates.get(candidate.id) ?? [candidate.finger]).includes(finger) && candidate.x === position.x && candidate.y === position.y,
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
export function playbackCompletedInputs(strokes: readonly Stroke[], cursor: number, limit = DEFAULT_PLAYBACK_RATE_WINDOW): string[] {
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

/**
 * 入力済みの入力単位を返す既定の数。表示側の欄がかな10文字分の幅で、半角の文字だけの入力単位
 * （1単位が全角の半分の幅）でも欄が埋まる20個にしてある。
 */
export const PLAYBACK_COMPLETED_INPUT_LIMIT = 20;

interface PlaybackInputGroup {
  inputIndex: number;
  start: number;
  end: number;
}

/** 入力済み・現在・先読みの入力単位（同じ`inputIndex`のストロークの並び）を、表示する分だけ選ぶ。 */
function playbackInputGroupsAround(
  strokes: readonly Stroke[],
  cursor: number,
  windowSize: number,
  completedLimit: number,
): { end: number; completed: PlaybackInputGroup[]; current: PlaybackInputGroup | undefined; planned: PlaybackInputGroup[] } {
  const end = Math.min(Math.max(0, cursor), strokes.length);
  const groups: PlaybackInputGroup[] = [];

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
  const completed = currentGroupIndex < 0 ? [] : limit === 0 ? [] : groups.slice(0, currentGroupIndex).slice(-limit);
  const futureEnd = playbackPlannedStrokeRange(strokes, end, windowSize)?.finish ?? end;
  const planned = groups.filter((group) => group.inputIndex !== currentInputIndex && group.end > end && group.start < futureEnd);
  return { end, completed, current: groups[currentGroupIndex], planned };
}

/** 入力済み・現在・先読みの入力単位を表示順に返す。先読みの範囲は押下予定のキーと同じ（`playbackPlannedStrokeRange`）。 */
export function playbackInputPreview(
  strokes: readonly Stroke[],
  cursor: number,
  windowSize = 0,
  completedLimit = PLAYBACK_COMPLETED_INPUT_LIMIT,
): PlaybackInputPreviewSegment[] {
  const { completed, current, planned } = playbackInputGroupsAround(strokes, cursor, windowSize, completedLimit);
  return [
    ...completed.map((group) => ({ text: strokes[group.end - 1].inputChar, kind: 'completed' as const })),
    ...(current === undefined ? [] : [{ text: strokes[current.end - 1].inputChar, kind: 'current' as const }]),
    ...planned.map((group) => ({ text: strokes[group.end - 1].inputChar, kind: 'planned' as const })),
  ];
}

export interface PlaybackRomajiInputSegment {
  kind: PlaybackInputPreviewKind;
  /** 入力単位のかな。ローマ字で出さない単位は、この文字をそのまま出す */
  kana: string;
  /**
   * ローマ字で出す単位の、打ち終えた文字とまだ打っていない文字。かなで出す単位（打ち終えた単位と、
   * 最後のステップを打ち終えた現在の単位）では持たない
   */
  romaji?: { typed: string; remaining: string };
}

/** ストロークが、その選択の文字を出力するか。シフトなど層を操作するキーだけを押すステップは出力しない。 */
function strokeOutputs(stroke: Stroke): boolean {
  const triggers = new Set(stroke.triggerKeys.map(resolveKeyId));
  return stroke.presses.some((press) => press.keys.some((key) => !triggers.has(key.id)));
}

/**
 * 入力単位を出す文字を、打つ順の選択ごとに1回ずつつなぐ。1つの選択が複数のストロークになる時、それらは同じ`char`を
 * 持つので、ストロークごとにつなぐと文字が重なる。`typed`は、文字を出力するストロークをカーソルまでに打った選択の文字。
 */
function romajiOfInput(strokes: readonly Stroke[], group: PlaybackInputGroup, cursor: number) {
  let typed = '';
  let remaining = '';
  for (let start = group.start; start < group.end; ) {
    const selectionIndex = strokes[start].selectionIndex;
    let finish = start + 1;
    while (finish < group.end && strokes[finish].selectionIndex === selectionIndex) finish++;
    // 出力するステップが無い選択（想定外）は、最後のステップで出力したものとして扱い、境目が進まなくならないようにする
    let outputAt = finish - 1;
    for (let at = start; at < finish; at++) {
      if (strokeOutputs(strokes[at])) {
        outputAt = at;
        break;
      }
    }
    if (outputAt < cursor) typed += strokes[start].char;
    else remaining += strokes[start].char;
    start = finish;
  }
  return { typed, remaining };
}

/**
 * ローマ字の配列で、入力の行に出す入力単位を返す。打ち終えた単位はかな、打っている途中の現在の単位とこの先の単位は
 * ローマ字にする。現在の単位は、最後のステップを打ち終えた位置ではかなに戻る。
 * 範囲の決め方（件数・先読み）は`playbackInputPreview`と同じ。
 */
export function playbackRomajiInputPreview(
  strokes: readonly Stroke[],
  cursor: number,
  windowSize = 0,
  completedLimit = PLAYBACK_COMPLETED_INPUT_LIMIT,
): PlaybackRomajiInputSegment[] {
  const { end, completed, current, planned } = playbackInputGroupsAround(strokes, cursor, windowSize, completedLimit);
  const kanaOf = (group: PlaybackInputGroup) => strokes[group.end - 1].inputChar;
  return [
    ...completed.map((group) => ({ kind: 'completed' as const, kana: kanaOf(group) })),
    ...(current === undefined
      ? []
      : [
          end >= current.end
            ? { kind: 'current' as const, kana: kanaOf(current) }
            : { kind: 'current' as const, kana: kanaOf(current), romaji: romajiOfInput(strokes, current, end) },
        ]),
    ...planned.map((group) => ({
      kind: 'planned' as const,
      kana: kanaOf(group),
      romaji: romajiOfInput(strokes, group, end),
    })),
  ];
}

/** 面定義と実際の押下から、再生中に表示する文字と刻印を引く。 */
export function playbackStrokeDisplay(layout: Layout, stroke: Stroke): PlaybackStrokeDisplay {
  if (layout.romajiTable || !layout.faces) {
    return { keyLabels: new Map() };
  }
  const groups = classifyPresentationFaces(layout);
  const triggerKeys = new Set(stroke.triggerKeys.map(resolveKeyId));
  const layerFaces =
    stroke.aggregationGroupId === COMBO_LAYER_ID
      ? [...groups.combos]
      : ([...groups.layers, ...groups.modifiers].find((layer) => layer.id === stroke.aggregationGroupId)?.faces ?? []);
  const triggeredFaces = triggerKeys.size === 0 ? layerFaces : layerFaces.filter((face) => matchesDisplayTriggerAlternative(face, triggerKeys));
  const pressedKeys = [...new Set(stroke.presses.flatMap((press) => press.keys.map((key) => key.id)))];
  const outputKeys = pressedKeys.filter((key) => !triggerKeys.has(key));
  // prefix/suffixの出力ステップではtriggerが空になるため、出力文字から元の面を絞る。
  // 同じlayerに複数のシフト面がある場合も、別面の刻印を混ぜない。
  const outputFaces =
    triggerKeys.size === 0 && outputKeys.length > 0
      ? layerFaces.filter((face) => outputKeys.some((key) => faceCells(face).get(key) === stroke.char))
      : [];
  const faces = outputFaces.length > 0 ? outputFaces : triggeredFaces;
  // 通常layerは同じaggregation帰属のFaceをまとめて表示する。
  // comboは従来どおり、実際に発火した個別Faceだけを表示する。
  const displayFaces = stroke.aggregationGroupId === COMBO_LAYER_ID ? faces : layerFaces;
  const keyLabels = new Map<string, string>();

  // 面に空欄として定義されたキーは、基底面の刻印へ戻さず空欄にする。
  for (const face of displayFaces) {
    face.rows.forEach((row, rowIndex) => {
      const cells = typeof row === 'string' ? [...row] : [...row];
      cells.forEach((_label, colIndex) => keyLabels.set(keyId(rowIndex, colIndex), ''));
    });
  }
  for (const face of displayFaces) {
    for (const [key, label] of faceDisplayCells(face)) {
      const previous = keyLabels.get(key);
      keyLabels.set(key, previous && label !== previous ? `${previous} / ${label}` : label);
    }
  }
  for (const key of triggerKeys) keyLabels.set(key, '⇧');

  const character = outputKeys
    .map((key) => keyLabels.get(key))
    .filter((label): label is string => label !== undefined && label !== '')
    .join(' / ');
  return character === '' ? { keyLabels } : { character, keyLabels };
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
    ...(calibration === undefined ? {} : { calibration }),
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

function normalPlaybackStepMs(stepsPerSecond: PlaybackStepsPerSecond): number {
  return Number.isFinite(stepsPerSecond) && stepsPerSecond > 0 ? 1000 / stepsPerSecond : Number.POSITIVE_INFINITY;
}

/** ステップ`i`と`i-1`が異手の時の方向（`spec/playback-timing.md` §3.1「異手の判定」）。異手でなければ`undefined`。 */
export function playbackCrossHandDirection(
  stroke: StrokePressFingers | undefined,
  previousStroke: StrokePressFingers | undefined,
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

/**
 * 同手・別指の基準の速さ（`spec/playback-timing.md` §3.1「同手・別指の判定」）。
 * `pairs`は、直前のステップの指から今のステップの指への組。同じ手の別の指の組のうち、指の組の識別子を作れる最初の組の、
 * 方向別の値、無ければ順序なしの組の値、無ければ代表値を返す。
 * 親指を含む組は識別子を作れないので、識別子を作れる組が無く親指を含む組がある時は、代表値を返す。同手・別指の組が無ければ`undefined`。
 */
function sameHandRate(
  pairs: Iterable<readonly [Finger, Finger]>,
  stepsPerSecond: PlaybackStepsPerSecond,
  calibration?: PlaybackCalibration,
): number | undefined {
  let involvesThumb = false;
  for (const [from, to] of pairs) {
    if (from === to || fingerHand(from) !== fingerHand(to)) continue;
    const unorderedPair = sameHandFingerPairKey(from, to);
    if (unorderedPair === undefined) {
      involvesThumb = true;
      continue;
    }
    const directedPair = sameHandDirectedFingerPairKey(from, to);
    return (
      (directedPair === undefined ? undefined : calibration?.sameHandDifferentFingerActionsPerDirectedPair?.[directedPair]) ??
      calibration?.sameHandDifferentFingerActionsPerSecondByPair[unorderedPair] ??
      calibration?.sameHandDifferentFingerActionsPerSecond ??
      stepsPerSecond
    );
  }
  return involvesThumb ? (calibration?.sameHandDifferentFingerActionsPerSecond ?? stepsPerSecond) : undefined;
}

/** 直前のステップの押下を外側、今のステップの押下を内側に取った、指の組。 */
function* pressFingerPairs(stroke: StrokePressFingers, previousStroke: StrokePressFingers): Generator<readonly [Finger, Finger]> {
  for (const previousPress of previousStroke.presses) {
    for (const press of stroke.presses) yield [previousPress.finger, press.finger];
  }
}

/**
 * 続け打ちのステップの`normalMs`[ms]（§3.1）。続け打ちの指の、同じキーを続けて打つ時間`r(f)`。
 * 個人速度が無い時、続け打ちでないステップは`undefined`。
 */
function playbackRepeatNormalMs(
  stroke: StrokePressFingers | undefined,
  previousStroke: StrokePressFingers | undefined,
  calibration: PlaybackCalibration | undefined,
): number | undefined {
  if (calibration === undefined || stroke === undefined || !isRepeatStroke(stroke, previousStroke)) return undefined;
  return playbackRepeatMs(calibration, stroke.presses[0].finger);
}

function playbackTransitionRate(
  stroke: StrokePressFingers | undefined,
  previousStroke: StrokePressFingers | undefined,
  stepsPerSecond: PlaybackStepsPerSecond,
  calibration?: PlaybackCalibration,
): number {
  const crossDirection = playbackCrossHandDirection(stroke, previousStroke);
  if (crossDirection !== undefined) {
    return calibration?.actionsPerSecondByDirection?.[crossDirection] ?? calibration?.actionsPerSecond ?? stepsPerSecond;
  }

  const sameHand = stroke && previousStroke ? sameHandRate(pressFingerPairs(stroke, previousStroke), stepsPerSecond, calibration) : undefined;
  return sameHand ?? calibration?.actionsPerSecond ?? stepsPerSecond;
}

/** 基準の速さを選ぶのに読む、構造解析の結果の部分。 */
export interface PlaybackRateInput {
  readonly strokes: readonly StrokePressFingers[];
  readonly transitions: readonly {
    readonly toStrokeIndex: number;
    readonly candidates: readonly { readonly fromFinger: Finger; readonly toFinger: Finger }[];
  }[];
}

type RateTransition = PlaybackRateInput['transitions'][number];

const transitionsByToStrokeCache = new WeakMap<object, ReadonlyMap<number, readonly RateTransition[]>>();

/**
 * 遷移を、入る側のストローク（`toStrokeIndex`）から引く索引。各ストロークの遷移は、`transitions`の並びのまま持つ。
 * 同じ`transitions`の配列には同じ索引を返すので、全ステップの時間を求める間に作るのは1回だけ。
 * 手のまたがる打鍵は左右両方のChainに入りうるため、Chainごとではなく全遷移から作る。
 */
function transitionsByToStroke(transitions: PlaybackRateInput['transitions']): ReadonlyMap<number, readonly RateTransition[]> {
  const cached = transitionsByToStrokeCache.get(transitions);
  if (cached !== undefined) return cached;
  const byToStroke = new Map<number, RateTransition[]>();
  for (const transition of transitions) {
    const group = byToStroke.get(transition.toStrokeIndex);
    if (group) group.push(transition);
    else byToStroke.set(transition.toStrokeIndex, [transition]);
  }
  transitionsByToStrokeCache.set(transitions, byToStroke);
  return byToStroke;
}

function playbackTransitionRateFromAnalysis(
  analysis: PlaybackRateInput,
  strokeIndex: number,
  stepsPerSecond: PlaybackStepsPerSecond,
  calibration?: PlaybackCalibration,
): number {
  const stroke = analysis.strokes[strokeIndex];
  const previousStroke = analysis.strokes[strokeIndex - 1];

  // 異手方向はAnalysisResult内の元Strokeから読む。L→R / R→Lは常に方向別Calibration対象。
  const crossDirection = playbackCrossHandDirection(stroke, previousStroke);
  if (crossDirection !== undefined) {
    return calibration?.actionsPerSecondByDirection?.[crossDirection] ?? calibration?.actionsPerSecond ?? stepsPerSecond;
  }

  // 同手別指はHandTransitionのcandidateをsource of truthとして有向pairを選ぶ。
  // candidateは直前のStrokeの押下を外側、今のStrokeの押下を内側に取った組で、`pressFingerPairs`と同じ並び。
  const sameHand = sameHandRate(
    (transitionsByToStroke(analysis.transitions).get(strokeIndex) ?? [])
      .flatMap((transition) => transition.candidates)
      .map((candidate) => [candidate.fromFinger, candidate.toFinger] as const),
    stepsPerSecond,
    calibration,
  );
  if (sameHand !== undefined) return sameHand;

  // Chain境界等でHandTransitionが無い場合も、元Strokeの通常fallbackは維持する。
  return playbackTransitionRate(stroke, previousStroke, stepsPerSecond, calibration);
}

/**
 * ステップの`normalMs`[ms]（倍率1・打鍵の上乗せを足さない）。続け打ちは`r(f)`、それ以外は基準の速さの逆数。
 * 遷移の指の組は、ストロークの押下の指から作る。
 */
function playbackTransitionNormalMs(
  stroke: StrokePressFingers | undefined,
  previousStroke: StrokePressFingers | undefined,
  stepsPerSecond: PlaybackStepsPerSecond,
  calibration?: PlaybackCalibration,
): number {
  return (
    playbackRepeatNormalMs(stroke, previousStroke, calibration) ??
    normalPlaybackStepMs(playbackTransitionRate(stroke, previousStroke, stepsPerSecond, calibration))
  );
}

/** 解析結果の遷移から選ぶ`playbackTransitionNormalMs`。 */
function playbackTransitionNormalMsFromAnalysis(
  analysis: PlaybackRateInput,
  strokeIndex: number,
  stepsPerSecond: PlaybackStepsPerSecond,
  calibration?: PlaybackCalibration,
): number {
  return (
    playbackRepeatNormalMs(analysis.strokes[strokeIndex], analysis.strokes[strokeIndex - 1], calibration) ??
    normalPlaybackStepMs(playbackTransitionRateFromAnalysis(analysis, strokeIndex, stepsPerSecond, calibration))
  );
}

/**
 * ステップ `i` の `normalMs`（倍率1・打鍵の上乗せを足さない）。個人速度で求める（`spec/playback-timing.md` §3.1）。
 * 文章を打つ測定が、実際の間隔から引く1打の時間を求めるのに使う。
 */
export function playbackNormalMs(analysis: PlaybackRateInput, strokeIndex: number, calibration: PlaybackCalibration): number {
  return playbackTransitionNormalMsFromAnalysis(
    analysis,
    strokeIndex,
    // 個人速度が有る時、基準速度は使われない。
    DEFAULT_PLAYBACK_STEPS_PER_SECOND,
    calibration,
  );
}

/**
 * ステップ `i` の、1打の時間（`normalMs`）の側に足す打鍵の上乗せ[ms]（§3.1.1）。
 * 続け打ちのステップは、続け打ちの値を持つ時はその値、持たない時は0。
 * 構造の種類の値は、ステップがかなの中かかなの境目かで、同じ側のその種類の値、同じ側の「その他」の値、
 * その種類の分けない値、「その他」の分けない値の順に最初に見つかった値で、どれも無ければ0。
 * 同指連続のステップの同指連続の値は、`max`の外に足すので`playbackSameFingerOverheadMs`が返す。
 * 個人速度が無い時、打鍵の上乗せを持たない時は0。
 */
export function playbackKeystrokeOverheadMs(
  analysis: Pick<AggregatedAnalysisResult, 'strokes' | 'chains' | 'arpeggioSpans'>,
  strokeIndex: number,
  calibration: PlaybackCalibration | undefined,
): number {
  const overheads = calibration?.keystrokeOverheadMs;
  if (overheads === undefined) return 0;
  const structure: StrokeStructureKind = strokeStructureKinds(analysis)[strokeIndex] ?? 'other';
  const side = strokeOverheadSide(analysis.strokes, strokeIndex);
  const structureMs =
    overheads[sideOverheadKind(structure, side)] ?? overheads[sideOverheadKind('other', side)] ?? overheads[structure] ?? overheads.other ?? 0;
  if (strokeOverheadKinds(analysis)[strokeIndex] !== 'repeat') return structureMs;
  return overheads.repeat ?? 0;
}

/**
 * ステップ`i`のストロークが同時押しの時に、1打の時間（`normalMs`）の側に足す同時押しの上乗せ[ms]（§3.1.2）。
 * ストロークの同時押しの分け方の値を保存値から取る。同時押しのストロークでない時、その分け方の値を持たない時、個人速度が無い時は0。
 */
export function playbackSimultaneousOverheadMs(stroke: StrokePressFingers | undefined, calibration: PlaybackCalibration | undefined): number {
  const overheads = calibration?.simultaneousOverheadMs;
  if (overheads === undefined) return 0;
  const kind = strokeSimultaneousKind(stroke);
  return kind === undefined ? 0 : (overheads[kind] ?? 0);
}

/** 同時押しの測定が基準の時間を求める、ストロークの押下の指の並び（`spec/playback-timing.md` §6.1.1の表）。 */
const SIMULTANEOUS_REFERENCE_FINGERS: Readonly<Record<SimultaneousKind, readonly Finger[]>> = {
  'both-hands': ['LI', 'RI'],
  'one-hand': ['RI', 'RM'],
  thumb: ['RT', 'RI'],
};

/**
 * 同時押しの測定が、間隔の中央値から引く基準の時間[ms]。同時押しのストロークを続けて打つステップの`normalMs`（倍率1・上乗せを足さない）を、
 * 再生と同じ`playbackNormalMs`で求める。ステップは、押下の指が`SIMULTANEOUS_REFERENCE_FINGERS`のストロークの後のステップ。
 */
export function playbackSimultaneousBaseMs(kind: SimultaneousKind, calibration: PlaybackCalibration): number {
  const stroke: StrokePressFingers = {
    presses: SIMULTANEOUS_REFERENCE_FINGERS[kind].map((finger) => ({ finger, keys: [{ id: finger }] })),
  };
  return playbackNormalMs({ strokes: [stroke, stroke], transitions: [] }, 1, calibration);
}

/**
 * 同指連続のステップが`max(normalMs, movementMs)`の外に足す打鍵の上乗せ[ms]。
 * 同指連続の押下を持つステップで、保存値が同指連続の値を持つ時だけ値を返す。それ以外は`undefined`で、
 * 構造の種類の値を`normalMs`の側に足す（`playbackKeystrokeOverheadMs`）。
 */
export function playbackSameFingerOverheadMs(
  analysis: Pick<AggregatedAnalysisResult, 'strokes' | 'chains' | 'arpeggioSpans'>,
  strokeIndex: number,
  calibration: PlaybackCalibration | undefined,
): number | undefined {
  if (strokeOverheadKinds(analysis)[strokeIndex] !== 'sfb') return undefined;
  return calibration?.keystrokeOverheadMs?.sfb;
}

/**
 * 同指連続の押下を持つステップの、指の移動の時間[ms]（倍率1。§3.3）。同指連続の押下が無ければ`undefined`。
 * 指の同じキーを続けて打つ時間`r(f)`と、距離に比例する移動の時間`distance × m(f)`の和。測定値が無い指は代表値。
 */
export function playbackSameFingerMovementMs(stroke: Stroke | undefined, calibration: PlaybackCalibration): number | undefined {
  const sfbPresses = stroke?.presses.filter((press) => press.sfb) ?? [];
  if (sfbPresses.length === 0) return undefined;
  return Math.max(
    ...sfbPresses.map((press) => {
      return playbackRepeatMs(calibration, press.finger) + press.distance * playbackMoveMsPerUnit(calibration, press.finger);
    }),
  );
}

/**
 * 1ステップを表示する時間。正規化ディレイは1uを1打の時間相当とする。
 * 解析結果を受け取らないので、遷移が属する構造の種類が分からず、打鍵の上乗せ（§3.1.1）は足さない。
 * 打鍵の上乗せを含む時間は、解析結果を受け取る`playbackStepDurationMs`が求める。
 */
export function playbackStrokeDurationMs(
  stroke: Stroke | undefined,
  stepsPerSecond: PlaybackStepsPerSecond,
  sameFingerDelay = true,
  calibration?: PlaybackCalibration,
  previousStroke?: Stroke,
  speedMultiplier = DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
): number {
  const normalMs = playbackTransitionNormalMs(stroke, previousStroke, stepsPerSecond, calibration);
  return playbackStrokeDurationFromNormalMs(stroke, normalMs, sameFingerDelay, calibration, speedMultiplier);
}

function playbackStrokeDurationFromNormalMs(
  stroke: Stroke | undefined,
  normalMs: number,
  sameFingerDelay: boolean,
  calibration: PlaybackCalibration | undefined,
  speedMultiplier: number,
  overheadMs = 0,
  /** 同指連続のステップが`max`の外に足す打鍵の上乗せ。 */
  sameFingerOverheadMs?: number,
  /** 同時押しのストロークのステップが足す同時押しの上乗せ。 */
  simultaneousMs = 0,
): number {
  const multiplier = Number.isFinite(speedMultiplier) && speedMultiplier > 0 ? speedMultiplier : DEFAULT_PLAYBACK_SPEED_MULTIPLIER;
  // 打鍵の上乗せと同時押しの上乗せは1打の時間の側にだけ足す。指の移動の時間には足さない。
  const baseMs = Math.max(PLAYBACK_MIN_STEP_MS, normalMs + overheadMs + simultaneousMs);
  if (!stroke || !sameFingerDelay) return baseMs / multiplier;

  const sfbPresses = stroke.presses.filter((press) => press.sfb);
  if (sfbPresses.length === 0) return baseMs / multiplier;

  const sameFingerDistance = Math.max(1, ...sfbPresses.map((press) => press.distance));
  if (calibration) {
    const movementMs = playbackSameFingerMovementMs(stroke, calibration) ?? 0;
    // 同指連続の値を持つ時は、1打の時間と指の移動の時間の遅い方の外に足す。
    if (sameFingerOverheadMs !== undefined) {
      return Math.max(PLAYBACK_MIN_STEP_MS, Math.max(normalMs, movementMs) + sameFingerOverheadMs + simultaneousMs) / multiplier;
    }
    return Math.max(baseMs, movementMs) / multiplier;
  }
  return Math.max(baseMs, normalMs * sameFingerDistance) / multiplier;
}

/**
 * AnalysisResultの隣接Transitionを1回だけ評価するproduction用Timing入口。
 * ArpeggioSpan / Roll / Redirect所属はduration sourceにしない。
 */
export function playbackStepDurationMs(
  analysis: PlaybackTimingAnalysis,
  strokeIndex: number,
  stepsPerSecond: PlaybackStepsPerSecond,
  sameFingerDelay = true,
  calibration?: PlaybackCalibration,
  speedMultiplier = DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
): number {
  const stroke = analysis.strokes[strokeIndex];
  const normalMs = playbackTransitionNormalMsFromAnalysis(analysis, strokeIndex, stepsPerSecond, calibration);
  return playbackStrokeDurationFromNormalMs(
    stroke,
    normalMs,
    sameFingerDelay,
    calibration,
    speedMultiplier,
    playbackKeystrokeOverheadMs(analysis, strokeIndex, calibration),
    playbackSameFingerOverheadMs(analysis, strokeIndex, calibration),
    playbackSimultaneousOverheadMs(stroke, calibration),
  );
}

/** 再生するステップの列の中に、0でない上乗せを式に入れるステップがあるか（`spec/playback-timing.md` §2.2）。 */
export interface PlaybackOverheadUse {
  readonly keystroke: boolean;
  readonly simultaneous: boolean;
}

/**
 * 各ステップに§3.1.1・§3.1.2の選び方で入る上乗せが0でないステップが、再生する列に1つ以上あるか。
 * 同指連続のステップは、同指連続の値を使う時（`sameFingerDelay`が真で保存値が持つ時）はその値、使わない時は構造の種類の値で判定する。
 * 下限や指の移動の時間で結果の時間が変わらないステップも、式に入れたステップに数える。
 */
export function playbackOverheadUse(
  analysis: PlaybackTimingAnalysis,
  sameFingerDelay: boolean,
  calibration: PlaybackCalibration | undefined,
): PlaybackOverheadUse {
  let keystroke = false;
  let simultaneous = false;
  for (let strokeIndex = 0; strokeIndex < analysis.strokes.length; strokeIndex += 1) {
    if (!keystroke) {
      const sameFingerMs = sameFingerDelay ? playbackSameFingerOverheadMs(analysis, strokeIndex, calibration) : undefined;
      const ms = sameFingerMs ?? playbackKeystrokeOverheadMs(analysis, strokeIndex, calibration);
      keystroke = ms !== 0;
    }
    if (!simultaneous) {
      simultaneous = playbackSimultaneousOverheadMs(analysis.strokes[strokeIndex], calibration) !== 0;
    }
    if (keystroke && simultaneous) break;
  }
  return { keystroke, simultaneous };
}

export interface PlaybackTimingStep {
  strokeIndex: number;
  startMs: number;
  endMs: number;
  /**
   * `startMs`から始まる待機の長さ（読点・句点の前後の待機。`spec/playback-timing.md` §3.9）。
   * 待機を足さないステップは持たない。
   */
  waitMs?: number;
  /**
   * 待機を挿入する前に求めた打鍵の時間。待機を挿入したscheduleの全ステップが持つ。
   * 時刻をずらした後の差から計算し直すと浮動小数の誤差が出るので、値として持つ。持たない時は`endMs - startMs - waitMs`。
   */
  typingMs?: number;
}

export interface PlaybackTimingOptions {
  /** 全指の物理移動が間に合う時刻までStrokeを遅らせる。引数を省略した時はfalse（画面の既定は`DEFAULT_PLAYBACK_ALL_FINGER_MOVEMENT_DELAY`が決める）。 */
  allFingerMovementDelay?: boolean;
  /** allFingerMovementDelay=trueの時にホーム位置を得るため必須。 */
  geometry?: Geometry;
  /**
   * ステップの間ごとの待機 [ミリ秒]（`planPunctuationWaits`の`gapMs`）。長さはステップ数+1で、`i`番目はステップ`i`の前。
   * 打鍵の時間を求めた後に挿入するので、各ステップの打鍵の時間は変わらない。
   */
  waitGapsMs?: readonly number[];
}

/** ステップの表示時間（待機を含む）。かな/秒・アクション/秒の平均は、この時間で求める。 */
export function playbackTimingStepDurationMs(schedule: readonly PlaybackTimingStep[] | undefined, strokeIndex: number): number | undefined {
  const step = schedule?.[strokeIndex];
  return step ? Math.max(0, step.endMs - step.startMs) : undefined;
}

/** ステップの打鍵の時間（待機を除く表示時間）。打鍵時間の合計に使う。 */
export function playbackTimingStepTypingMs(schedule: readonly PlaybackTimingStep[] | undefined, strokeIndex: number): number | undefined {
  const step = schedule?.[strokeIndex];
  if (!step) return undefined;
  return step.typingMs ?? Math.max(0, step.endMs - step.startMs - (step.waitMs ?? 0));
}

export interface PlaybackTimeTotals {
  /** 全ステップの打鍵の時間の合計（待機を含まない） */
  typingMs: number;
  /** 打鍵時間に、足した待機をすべて（最後のステップより後の待機を含む）加えた時間 */
  totalMs: number;
}

/** 打鍵時間と総時間（`spec/playback-timing.md` §3.9）。`trailingWaitMs`は最後のステップより後の待機。 */
export function playbackTimeTotals(schedule: readonly PlaybackTimingStep[], trailingWaitMs = 0): PlaybackTimeTotals {
  let typingMs = 0;
  let waitMs = Math.max(0, trailingWaitMs);
  for (let index = 0; index < schedule.length; index++) {
    typingMs += playbackTimingStepTypingMs(schedule, index) ?? 0;
    waitMs += schedule[index].waitMs ?? 0;
  }
  return { typingMs, totalMs: typingMs + waitMs };
}

/**
 * §3で確定したbase duration（ステップの時間）を累積したTiming schedule。
 * allFingerMovementDelay=trueでは、各指の到達可能時刻を追加max制約として適用する。
 */
export function playbackTimingSchedule(
  analysis: PlaybackTimingAnalysis,
  stepsPerSecond: PlaybackStepsPerSecond,
  sameFingerDelay = true,
  calibration?: PlaybackCalibration,
  speedMultiplier = DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
  options: PlaybackTimingOptions = {},
): PlaybackTimingStep[] {
  const typing = playbackTypingSchedule(analysis, stepsPerSecond, sameFingerDelay, calibration, speedMultiplier, options);
  return insertWaits(typing, options.waitGapsMs);
}

/** 打鍵の時間だけを累積したschedule。待機は含まない。 */
function playbackTypingSchedule(
  analysis: PlaybackTimingAnalysis,
  stepsPerSecond: PlaybackStepsPerSecond,
  sameFingerDelay: boolean,
  calibration: PlaybackCalibration | undefined,
  speedMultiplier: number,
  options: PlaybackTimingOptions,
): PlaybackTimingStep[] {
  const baseDurations = analysis.strokes.map((_stroke, strokeIndex) =>
    playbackStepDurationMs(analysis, strokeIndex, stepsPerSecond, sameFingerDelay, calibration, speedMultiplier),
  );

  if (!options.allFingerMovementDelay) {
    let atMs = 0;
    return baseDurations.map((durationMs, strokeIndex) => {
      const startMs = atMs;
      atMs += durationMs;
      return { strokeIndex, startMs, endMs: atMs };
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
    let endMs = startMs + baseDurations[strokeIndex];

    // actual Pressだけが新しい移動要求。held-trigger/continueは後段で占有時間だけ延ばす。
    for (const press of stroke.presses) {
      const moveMs = playbackFingerMoveMs(lastPosition[press.finger], press.target, press.finger, stepsPerSecond, calibration, speedMultiplier);
      endMs = Math.max(endMs, freeAtMs[press.finger] + moveMs);
    }

    schedule.push({ strokeIndex, startMs, endMs });
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
      lastPosition[participation.finger] = stroke.positions[participation.finger] ?? lastPosition[participation.finger];
      freeAtMs[participation.finger] = endMs;
    }
  }

  return schedule;
}

/**
 * 打鍵の時間のscheduleに、ステップの間の待機を挿入する。待機のあるステップは、先頭の`waitMs`が待機になり、
 * 以降のステップの時刻は待機の合計だけ後ろへずれる。待機が無ければ、渡したscheduleをそのまま返す。
 */
function insertWaits(typing: PlaybackTimingStep[], gapsMs: readonly number[] | undefined): PlaybackTimingStep[] {
  if (gapsMs === undefined || !typing.some((_step, index) => (gapsMs[index] ?? 0) > 0)) return typing;
  let shiftMs = 0;
  return typing.map((step, index) => {
    const waitMs = Math.max(0, gapsMs[index] ?? 0);
    const startMs = step.startMs + shiftMs;
    shiftMs += waitMs;
    const endMs = step.endMs + shiftMs;
    const typingMs = Math.max(0, step.endMs - step.startMs);
    return waitMs > 0 ? { strokeIndex: step.strokeIndex, startMs, endMs, waitMs, typingMs } : { strokeIndex: step.strokeIndex, startMs, endMs, typingMs };
  });
}

function isActualPressParticipation(participation: Stroke['participations'][number]): boolean {
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
    if (strokes[index].participations.some((participation) => participation.finger === finger)) {
      return schedule[index]?.endMs ?? 0;
    }
  }
  return 0;
}

export function playbackFingerMoveMs(
  from: Point,
  to: Point,
  finger: Finger,
  stepsPerSecond: PlaybackStepsPerSecond,
  calibration: PlaybackCalibration | undefined,
  speedMultiplier: number,
): number {
  const distance = fingerDist(finger, from, to);
  if (distance <= 0) return 0;
  const multiplier = Number.isFinite(speedMultiplier) && speedMultiplier > 0 ? speedMultiplier : DEFAULT_PLAYBACK_SPEED_MULTIPLIER;
  // 個人速度が無い時は、基準速度を[u/秒]の正規化速度として使う。
  if (calibration === undefined) {
    return Number.isFinite(stepsPerSecond) && stepsPerSecond > 0 ? ((distance / stepsPerSecond) * 1000) / multiplier : Number.POSITIVE_INFINITY;
  }
  // 指が動く時間だけ。キーを打つ時間は含まない（`spec/playback-timing.md` §3.8）。
  return (distance * playbackMoveMsPerUnit(calibration, finger)) / multiplier;
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
  const preparationMs = Number.isFinite(preparationSeconds) && preparationSeconds > 0 ? preparationSeconds * 1000 : 0;
  if (preparationMs === 0 || end >= strokes.length) return positionedKeys;

  const nowMs = (end > 0 ? (schedule[end - 1]?.endMs ?? 0) : 0) + Math.max(0, elapsedMs);

  for (const finger of ALL_FINGERS) {
    let targetIndex = -1;
    for (let index = end; index < strokes.length; index++) {
      if (strokes[index].participations.some((participation) => participation.finger === finger && isActualPressParticipation(participation))) {
        targetIndex = index;
        break;
      }
    }
    if (targetIndex < 0) continue;

    const press = strokes[targetIndex].presses.find((candidate) => candidate.finger === finger);
    if (!press) continue;
    const currentPosition = displayedStroke?.positions[finger] ?? geometry.homes[finger];
    const moveMs = playbackFingerMoveMs(currentPosition, press.target, finger, stepsPerSecond, calibration, speedMultiplier);
    const pressTimeMs = schedule[targetIndex]?.endMs;
    if (pressTimeMs === undefined) continue;
    const idealStartMs = pressTimeMs - preparationMs - moveMs;
    const actualStartMs = Math.max(idealStartMs, previousFingerOccupancyEndMs(strokes, schedule, targetIndex, finger));
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

  const durationMs = Array.from({ length: end - start }, (_, offset) => start + offset).reduce(
    (total, index) =>
      total +
      (playbackTimingStepDurationMs(schedule, index) ??
        playbackStepDurationMs(analysis, index, stepsPerSecond, sameFingerDelay, calibration, speedMultiplier)),
    0,
  );
  return { start, end, durationMs };
}

function playbackRateWindowInputText(strokes: readonly Stroke[], recent: PlaybackRateWindow): string {
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

/**
 * EWMAを1ステップずつ進める状態。ステップ0から順に`advance`を呼ぶと、`snapshot`は
 * 「そのステップまでを先頭から畳み込んだ値」と同じ値（演算の順序も同じ）を返す。
 */
interface PlaybackEwmaState {
  advance(index: number): void;
  snapshot(): PlaybackEwmaRate;
}

function playbackEwmaState(
  analysis: AggregatedAnalysisResult,
  stepsPerSecond: PlaybackStepsPerSecond,
  sameFingerDelay: boolean,
  halfLifeSeconds: number,
  calibration: PlaybackCalibration | undefined,
  speedMultiplier: number,
  schedule: readonly PlaybackTimingStep[] | undefined,
): PlaybackEwmaState {
  const strokes = analysis.strokes;
  let actionRate: number | undefined;
  let kanaRate: number | undefined;
  // 表示するのは直近6件だけなので、それより前の完了済み入力は持たない
  const recentInputs: string[] = [];

  return {
    advance(index) {
      const durationMs =
        playbackTimingStepDurationMs(schedule, index) ??
        playbackStepDurationMs(analysis, index, stepsPerSecond, sameFingerDelay, calibration, speedMultiplier);
      if (!(durationMs > 0)) return;

      const decay = 2 ** (-(durationMs / 1000) / halfLifeSeconds);
      const actionInstant = 1000 / durationMs;
      actionRate = actionRate === undefined ? actionInstant : decay * actionRate + (1 - decay) * actionInstant;

      const inputIndex = strokes[index].inputIndex;
      const nextStartsNewInput = index + 1 >= strokes.length || strokes[index + 1].inputIndex !== inputIndex;
      const completedHere = nextStartsNewInput ? Array.from(strokes[index].inputChar).length : 0;
      if (completedHere > 0) {
        const kanaInstant = (completedHere * 1000) / durationMs;
        kanaRate = kanaRate === undefined ? kanaInstant : decay * kanaRate + (1 - decay) * kanaInstant;
        recentInputs.push(strokes[index].inputChar);
        if (recentInputs.length > 6) recentInputs.shift();
      } else if (kanaRate !== undefined) {
        // 最初の入力単位が完了するまでは未観測。以後の入力途中Strokeでは0へ時間減衰する。
        kanaRate *= decay;
      }
    },
    snapshot() {
      return {
        inputText: recentInputs.join(''),
        ...(kanaRate === undefined ? {} : { kanaPerSecond: kanaRate }),
        ...(actionRate === undefined ? {} : { actionsPerSecond: actionRate }),
      };
    },
  };
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
  const end = clampPlaybackCursor(cursor, analysis.strokes.length);
  if (end === 0 || halfLifeSeconds <= 0) return undefined;

  const state = playbackEwmaState(analysis, stepsPerSecond, sameFingerDelay, halfLifeSeconds, calibration, speedMultiplier, schedule);
  for (let index = 0; index < end; index++) state.advance(index);
  return state.snapshot();
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
    return playbackEwmaRate(analysis, cursor, stepsPerSecond, sameFingerDelay, halfLifeSeconds, calibration, speedMultiplier, schedule)?.actionsPerSecond;
  }
  const recent = playbackRecentRateWindow(analysis, cursor, stepsPerSecond, sameFingerDelay, limit, calibration, speedMultiplier, schedule);
  return recent && recent.durationMs > 0 ? ((recent.end - recent.start) * 1000) / recent.durationMs : undefined;
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
    return playbackEwmaRate(analysis, cursor, stepsPerSecond, sameFingerDelay, halfLifeSeconds, calibration, speedMultiplier, schedule)?.kanaPerSecond;
  }
  const strokes = analysis.strokes;
  const recent = playbackRecentRateWindow(analysis, cursor, stepsPerSecond, sameFingerDelay, limit, calibration, speedMultiplier, schedule);
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
  // ストロークごとに、Chainの中にあるか。カーソルごとに全Chainを走査しない
  const inChain = new Uint8Array(strokes.length);
  for (const chain of analysis.chains) {
    const to = Math.min(chain.endStrokeIndex, strokes.length);
    for (let at = Math.max(0, chain.startStrokeIndex); at < to; at++) inChain[at] = 1;
  }
  // EWMAはカーソルを1つ進めるたびに、前のカーソルの状態から続ける
  const ewmaState =
    average === 'ewma' && halfLifeSeconds > 0
      ? playbackEwmaState(analysis, stepsPerSecond, sameFingerDelay, halfLifeSeconds, calibration, speedMultiplier, schedule)
      : undefined;
  for (let cursor = 1; cursor <= strokes.length; cursor++) {
    const recent =
      average === 'sma'
        ? playbackRecentRateWindow(analysis, cursor, stepsPerSecond, sameFingerDelay, limit, calibration, speedMultiplier, schedule)
        : undefined;
    ewmaState?.advance(cursor - 1);
    const ewma = ewmaState?.snapshot();
    const kanaPerSecond =
      average === 'ewma'
        ? ewma?.kanaPerSecond
        : playbackRecentKanaPerSecond(analysis, cursor, stepsPerSecond, sameFingerDelay, limit, calibration, speedMultiplier, schedule);
    const actionsPerSecond =
      average === 'ewma'
        ? ewma?.actionsPerSecond
        : recent && recent.durationMs > 0
          ? ((recent.end - recent.start) * 1000) / recent.durationMs
          : undefined;
    points.push({
      cursor,
      inputText: ewma?.inputText ?? (recent ? playbackRateWindowInputText(strokes, recent) : ''),
      ...(kanaPerSecond === undefined ? {} : { kanaPerSecond }),
      ...(actionsPerSecond === undefined ? {} : { actionsPerSecond }),
      chain: inChain[cursor - 1] === 1,
      arpeggio: analysis.annotations[cursor - 1]?.inArpeggio ?? false,
    });
  }
  return points;
}

/** 停止・一時停止中の1打鍵送り。再生中はカーソルを動かさない。 */
export function stepPlayback(state: PlaybackState, direction: -1 | 1, strokeCount: number): PlaybackState {
  if (state.playing) return state;
  return {
    ...state,
    cursor: clampPlaybackCursor(state.cursor + direction, strokeCount),
    elapsedMs: 0,
  };
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

  const previousCursor = clampPlaybackCursor(previousState.cursor, previousAnalysis.strokes.length);
  if (previousCursor >= previousAnalysis.strokes.length) {
    return {
      ...nextBaseState,
      cursor,
      playing: previousState.playing,
      elapsedMs: 0,
    };
  }

  const previousStepMs =
    playbackTimingStepDurationMs(previousSchedule, previousCursor) ??
    playbackStepDurationMs(
      previousAnalysis,
      previousCursor,
      previousState.stepsPerSecond,
      previousState.sameFingerDelay,
      previousState.calibration,
      previousState.speedMultiplier,
    );
  const nextStepMs =
    playbackTimingStepDurationMs(nextSchedule, cursor) ??
    playbackStepDurationMs(
      nextAnalysis,
      cursor,
      nextBaseState.stepsPerSecond,
      nextBaseState.sameFingerDelay,
      nextBaseState.calibration,
      nextBaseState.speedMultiplier,
    );
  const progress = previousStepMs > 0 ? Math.min(1, Math.max(0, previousState.elapsedMs / previousStepMs)) : 0;

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
    const stepMs =
      playbackTimingStepDurationMs(schedule, nextCursor) ??
      playbackStepDurationMs(analysis, nextCursor, state.stepsPerSecond, state.sameFingerDelay, state.calibration, state.speedMultiplier);
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
