import { ALL_FINGERS, keyId, resolveKeyId, type Finger, type Geometry } from './geometry.ts';
import { classifyFaces, faceCells, foldedLayerCells, type Layer } from './layers.ts';
import type { Stroke } from './evaluate.ts';
import type { Layout } from './layouts/types.ts';
import {
  handDirection,
  sameHandDirectedFingerPairKey,
  sameHandFingerPairKey,
  type PlaybackCalibration,
} from './playback-calibration.ts';
import {
  playbackArpeggioSpans,
  type ArpeggioConditions,
} from './playback-arpeggio.ts';

/** 再生速度の入力範囲。実際の打鍵時間や距離モデルとは無関係。 */
export const PLAYBACK_STEPS_PER_SECOND_MIN = 0.1;
export const PLAYBACK_STEPS_PER_SECOND_MAX = 20;
export type PlaybackStepsPerSecond = number;
export const DEFAULT_PLAYBACK_STEPS_PER_SECOND: PlaybackStepsPerSecond = 1.25;
export const PLAYBACK_SPEED_MULTIPLIER_MIN = 0.1;
export const PLAYBACK_SPEED_MULTIPLIER_MAX = 10;
export const DEFAULT_PLAYBACK_SPEED_MULTIPLIER = 1;

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
  /** アルペジオ時間モデル。未指定なら従来の時間モデルを使う。 */
  arpeggio?: ArpeggioConditions;
  arpeggioDelayMode: 'before' | 'distributed';
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

/**
 * 直前のステップと今のステップの両方で押されているキーを返す。
 *
 * 同じキーを連打すると `data-playback-active` が点きっぱなしになり、打ち直した
 * のか止まっているのか見分けが付かない。ここで拾ったキーへ毎ステップ発火演出を
 * 重ねることで「今また打った」を示す。かな配列では面（レイヤー）が違えば同じ
 * 物理キーに別のかなが乗るため、`character`ではなくキーid（物理キー）の一致で見る。
 *
 * 親指キーは対象から外す。新下駄・薙刀式では親指シフトがほぼ毎ステップ入るため、
 * 含めると常時光り続けて「今また打った」という意味が薄れる
 * （同指連続・チェーンの判定で親指を除く isThumb と同じ判断）。
 */
export function playbackRepeatedKeys(
  strokes: readonly Stroke[],
  cursor: number,
): ReadonlySet<string> {
  const index = Math.min(Math.max(0, cursor), strokes.length) - 1;
  const repeated = new Set<string>();
  if (index <= 0) return repeated;

  const previousKeys = new Set(
    strokes[index - 1].presses
      .filter((press) => !isThumb(press.finger))
      .flatMap((press) => press.keys.map((key) => key.id)),
  );
  for (const press of strokes[index].presses) {
    if (isThumb(press.finger)) continue;
    for (const key of press.keys) {
      if (previousKeys.has(key.id)) repeated.add(key.id);
    }
  }
  return repeated;
}

function fingerHand(finger: Finger): 'left' | 'right' {
  return finger.startsWith('L') ? 'left' : 'right';
}

/**
 * 親指キー（スペース等）はチェーンの材料から外す。
 *
 * 新下駄・薙刀式のような配列では親指が同時押しのシフトを担う。これは指が鍵盤を
 * 渡り歩く動きではないので、手の連続の判定にも移動の起点・終点にも使わない。
 */
function isThumb(finger: Finger): boolean {
  return finger === 'LT' || finger === 'RT';
}

/**
 * 打鍵を手ごとのキーidへ分ける。
 *
 * 左右同時押しのステップは両方の手に現れる。手ごとに見ることで、逆の手が混ざっても
 * 片方の手の連続が途切れない。
 */
function strokeHandKeys(
  stroke: Stroke,
  includeLayerKeys = true,
): Map<'left' | 'right', string[]> {
  // 層操作として押したキー。親指シフトはどのみち親指として落ちるので、ここで
  // 効くのは中指シフトのように親指以外がトリガーを兼ねる配列になる。
  const triggers = includeLayerKeys
    ? undefined
    : new Set(stroke.triggerKeys.map(resolveKeyId));
  const hands = new Map<'left' | 'right', string[]>();
  for (const press of stroke.presses) {
    if (isThumb(press.finger)) continue;
    const keys = press.keys
      .map((key) => key.id)
      .filter((id) => !triggers?.has(id));
    if (keys.length === 0) continue;
    const hand = fingerHand(press.finger);
    hands.set(hand, [...(hands.get(hand) ?? []), ...keys]);
  }
  return hands;
}

/** その手が同指連打をしているか。親指は数えない。 */
function handHasSameFinger(stroke: Stroke, hand: 'left' | 'right'): boolean {
  return stroke.presses.some(
    (press) => !isThumb(press.finger) && fingerHand(press.finger) === hand && press.sfb,
  );
}

/**
 * 直前の打鍵が同じ手だった時、その位置から現在のキーへの移動を返す。
 *
 * 同指連続（playbackSameFingerKeyMotions）が「同じ指がキーをまたぐ」動きなのに対し、
 * こちらは「手が鍵盤を横切る」動きを1枚のキーで見せる。区間全体を一度に動かさず
 * 1ステップ1本に絞るのは、2キーの短い区間でも必ず動きが出るようにするため。
 */
export function playbackHandKeyMotions(
  strokes: readonly Stroke[],
  cursor: number,
  includeSameFinger = false,
  includeLayerKeys = true,
): PlaybackKeyMotion[] {
  const index = Math.min(Math.max(0, cursor), strokes.length) - 1;
  if (index <= 0) return [];

  const stroke = strokes[index];
  const current = strokeHandKeys(stroke, includeLayerKeys);
  const previous = strokeHandKeys(strokes[index - 1], includeLayerKeys);

  const motions: PlaybackKeyMotion[] = [];
  for (const [hand, toKeys] of current) {
    const fromKeys = previous.get(hand);
    if (!fromKeys || fromKeys.length === 0 || toKeys.length === 0) continue;
    if (!includeSameFinger && handHasSameFinger(stroke, hand)) continue;
    const finger = stroke.presses.find(
      (press) => !isThumb(press.finger) && fingerHand(press.finger) === hand,
    )?.finger;
    if (!finger) continue;
    // 同時押しの起点は先頭のキーに寄せる。どれを選んでも手の移動という意味は変わらない
    motions.push({ fromKey: fromKeys[0], toKeys, finger });
  }
  return motions;
}

/** アルペジオ判定済み区間の直前キーから現在キーへの移動を返す。 */
export function playbackArpeggioKeyMotions(
  strokes: readonly Stroke[],
  cursor: number,
  conditions: ArpeggioConditions,
): PlaybackKeyMotion[] {
  const index = Math.min(Math.max(0, cursor), strokes.length) - 1;
  if (index <= 0) return [];
  const span = playbackArpeggioSpans(strokes, conditions)
    .find((candidate) => index >= candidate.start && index < candidate.end);
  if (!span) return [];

  const outputKeys = (stroke: Stroke): string[] => {
    const triggers = new Set(stroke.triggerKeys.map(resolveKeyId));
    return stroke.presses
      .filter((press) => !isThumb(press.finger) && fingerHand(press.finger) === span.hand)
      .flatMap((press) => press.keys.map((key) => resolveKeyId(key.id)))
      .filter((key) => !triggers.has(key));
  };
  const toKeys = outputKeys(strokes[index]);
  if (toKeys.length === 0) return [];
  let previousIndex = index - 1;
  while (previousIndex >= span.start && outputKeys(strokes[previousIndex]).length === 0) previousIndex--;
  if (previousIndex < span.start) return [];
  const fromKey = outputKeys(strokes[previousIndex])[0];
  const finger = strokes[index].presses.find(
    (press) => !isThumb(press.finger) && fingerHand(press.finger) === span.hand,
  )?.finger;
  return finger && fromKey
    ? [{ fromKey, toKeys, finger }]
    : [];
}

/** 直近の同じ手の連続打鍵へ、表示順を割り当てる。 */
export function playbackChainOrders(
  strokes: readonly Stroke[],
  cursor: number,
  includeSameFinger = false,
  limit = Number.POSITIVE_INFINITY,
  includeLayerKeys = true,
): ReadonlyMap<string, number> {
  const end = Math.min(Math.max(0, cursor), strokes.length);
  const orders = new Map<string, number>();
  const span = Math.max(0, Math.floor(limit));
  if (end === 0 || span === 0) return orders;

  // 手ごとに、現在の打鍵を含む区間を前後へ広げる。
  //
  // 遡るだけだと区間の番号が打つたびに増えていき、区間の全体像は最後の打鍵まで
  // 見えない。チェーンは1つのまとまりとして読みたいので、先の打鍵も数える。
  //
  // 左右同時押しのステップは両方の手の区間に参加するため、逆の手が混ざっても
  // 片方の手のチェーンは途切れない。
  for (const hand of strokeHandKeys(strokes[end - 1], includeLayerKeys).keys()) {
    // 同指連打は区間の区切り。区切り自身はどちらの区間にも属さない
    if (!includeSameFinger && handHasSameFinger(strokes[end - 1], hand)) continue;

    const belongs = (index: number): boolean => {
      const stroke = strokes[index];
      if (!strokeHandKeys(stroke, includeLayerKeys).has(hand)) return false;
      return includeSameFinger || !handHasSameFinger(stroke, hand);
    };

    let start = end - 1;
    while (start > 0 && belongs(start - 1)) start--;
    let finish = end;
    while (finish < strokes.length && belongs(finish)) finish++;
    finish = Math.min(finish, start + span);

    // 1つのキーをチェーンの中で何度も踏むことがある。単純に上書きすると後の
    // 番号だけが残り、手前の番号が見えなくなる。カーソルが今いる位置から見て
    // 次に踏む番号を出す（通り過ぎた番号は出さない）。
    const visits = new Map<string, number[]>();
    for (let index = start; index < finish; index++) {
      const keys = strokeHandKeys(strokes[index], includeLayerKeys).get(hand);
      if (!keys) continue;
      const order = index - start + 1;
      for (const key of keys) {
        const seen = visits.get(key);
        // 同じステップで同時押しされた同一キーは1回として数える
        if (!seen) visits.set(key, [order]);
        else if (seen[seen.length - 1] !== order) seen.push(order);
      }
    }

    const position = end - start;
    for (const [key, list] of visits) {
      // 全部通り過ぎていれば最後の番号を残す。踏んだ実績まで消す必要はない
      orders.set(key, list.find((order) => order >= position) ?? list[list.length - 1]);
    }
  }
  return orders;
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
  limit = 10,
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
  arpeggio?: ArpeggioConditions,
  arpeggioDelayMode: 'before' | 'distributed' = 'before',
): PlaybackState {
  return {
    cursor: 0,
    stepsPerSecond,
    speedMultiplier,
    sameFingerDelay,
    calibration,
    arpeggio,
    arpeggioDelayMode,
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

export function setPlaybackArpeggio(
  state: PlaybackState,
  arpeggio: ArpeggioConditions | undefined,
  arpeggioDelayMode: 'before' | 'distributed' = state.arpeggioDelayMode,
): PlaybackState {
  return { ...state, arpeggio, arpeggioDelayMode, elapsedMs: 0 };
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
  useArpeggioCalibration = false,
): number {
  const crossDirection = playbackCrossHandDirection(stroke, previousStroke);
  if (useArpeggioCalibration && crossDirection !== undefined) {
    return calibration?.actionsPerSecondByDirection?.[crossDirection]
      ?? calibration?.actionsPerSecond
      ?? stepsPerSecond;
  }
  const sameHandPair = playbackSameHandDifferentFingerPair(stroke, previousStroke);
  if (sameHandPair !== undefined) {
    const sameHandDirectedPair = useArpeggioCalibration
      ? playbackSameHandDirectedPair(stroke, previousStroke)
      : undefined;
    return (sameHandDirectedPair === undefined
      ? undefined
      : calibration?.sameHandDifferentFingerActionsPerDirectedPair?.[sameHandDirectedPair])
      ?? calibration?.sameHandDifferentFingerActionsPerSecondByPair[sameHandPair]
      ?? calibration?.sameHandDifferentFingerActionsPerSecond
      ?? stepsPerSecond;
  }
  return calibration?.actionsPerSecond ?? stepsPerSecond;
}

/** アルペジオ判定を切った時は、拡張した方向別速度を従来の再生へ持ち込まない。 */
function playbackCalibrationWithoutArpeggio(
  calibration: PlaybackCalibration | undefined,
): PlaybackCalibration | undefined {
  if (!calibration) return undefined;
  const {
    actionsPerSecondByDirection: _actionsPerSecondByDirection,
    sameHandDifferentFingerActionsPerDirectedPair: _directedPair,
    ...legacyCalibration
  } = calibration;
  return legacyCalibration;
}

export interface PlaybackArpeggioTiming {
  intervalMs: number;
  /** 区間の手前へまとめる遅れ。分散モードでは0。 */
  leadDelayMs: number;
}

/** アルペジオ区間の各エッジへ、方向別速度から得た時間を割り当てる。 */
export function playbackArpeggioTimings(
  strokes: readonly Stroke[],
  conditions: ArpeggioConditions,
  stepsPerSecond: PlaybackStepsPerSecond,
  calibration?: PlaybackCalibration,
  delayMode: 'before' | 'distributed' = 'before',
  sameFingerDelay = true,
): ReadonlyMap<number, PlaybackArpeggioTiming> {
  const timings = new Map<number, PlaybackArpeggioTiming>();
  for (const span of playbackArpeggioSpans(strokes, conditions)) {
    const edges: { index: number; intervalMs: number; normalMs: number }[] = [];
    for (let index = span.start + 1; index < span.end; index++) {
      const intervalMs = normalPlaybackStepMs(playbackTransitionRate(
        strokes[index],
        strokes[index - 1],
        stepsPerSecond,
        calibration,
        true,
      ));
      const normalMs = playbackStrokeDurationMs(
        strokes[index],
        stepsPerSecond,
        sameFingerDelay,
        calibration,
        strokes[index - 1],
        1,
      );
      edges.push({ index, intervalMs, normalMs });
    }
    const leadDelayMs = delayMode === 'before'
      ? edges.reduce((total, edge) => total + Math.max(0, edge.intervalMs - edge.normalMs), 0)
      : 0;
    for (const edge of edges) {
      const timing = {
        // 前寄せでは個別のアルペジオ間隔を通常時間へ重ねず、超過分だけを
        // 区間の先頭へ寄せる。これで分散時と総時間が一致する。
        intervalMs: delayMode === 'before' ? 0 : edge.intervalMs,
        leadDelayMs: delayMode === 'before' && edge.index === span.start + 1
          ? leadDelayMs
          : 0,
      };
      const previous = timings.get(edge.index);
      if (!previous
        || timing.intervalMs > previous.intervalMs
        || timing.leadDelayMs > previous.leadDelayMs) {
        timings.set(edge.index, {
          intervalMs: Math.max(previous?.intervalMs ?? 0, timing.intervalMs),
          leadDelayMs: Math.max(previous?.leadDelayMs ?? 0, timing.leadDelayMs),
        });
      }
    }
  }
  return timings;
}

/** 1ステップを表示する時間。正規化ディレイは1uを通常の1アクション相当とする。 */
export function playbackStrokeDurationMs(
  stroke: Stroke | undefined,
  stepsPerSecond: PlaybackStepsPerSecond,
  sameFingerDelay = true,
  calibration?: PlaybackCalibration,
  previousStroke?: Stroke,
  speedMultiplier = DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
  arpeggioTiming?: PlaybackArpeggioTiming,
): number {
  const normalMs = normalPlaybackStepMs(playbackTransitionRate(
    stroke,
    previousStroke,
    stepsPerSecond,
    calibration,
  ));
  const arpeggioMs = arpeggioTiming?.intervalMs ?? 0;
  const leadDelayMs = arpeggioTiming?.leadDelayMs ?? 0;
  const multiplier = Number.isFinite(speedMultiplier) && speedMultiplier > 0
    ? speedMultiplier
    : DEFAULT_PLAYBACK_SPEED_MULTIPLIER;
  if (!stroke || !sameFingerDelay) return (Math.max(normalMs, arpeggioMs) + leadDelayMs) / multiplier;

  const sameFingerDistance = Math.max(
    1,
    ...stroke.presses.filter((press) => press.sfb).map((press) => press.distance),
  );
  if (!stroke.presses.some((press) => press.sfb)) {
    return (Math.max(normalMs, arpeggioMs) + leadDelayMs) / multiplier;
  }
  if (calibration) {
    const movementMs = Math.max(
      ...stroke.presses
        .filter((press) => press.sfb)
        .map((press) => {
          const speed = calibration.fingerSpeedUnitsPerSecond[press.finger]
            ?? calibration.fallbackFingerSpeedUnitsPerSecond;
          return (press.distance / speed) * 1000;
        }),
    );
    return (Math.max(normalMs, arpeggioMs, movementMs) + leadDelayMs) / multiplier;
  }
  const movementMs = normalMs * sameFingerDistance;
  return (Math.max(normalMs, arpeggioMs, movementMs) + leadDelayMs) / multiplier;
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
  strokes: readonly Stroke[],
  cursor: number,
  stepsPerSecond: PlaybackStepsPerSecond,
  sameFingerDelay: boolean,
  limit: number,
  calibration?: PlaybackCalibration,
  speedMultiplier = DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
  arpeggio?: ArpeggioConditions,
  arpeggioDelayMode: 'before' | 'distributed' = 'before',
  cachedArpeggioTimings?: ReadonlyMap<number, PlaybackArpeggioTiming>,
): PlaybackRateWindow | undefined {
  const end = clampPlaybackCursor(cursor, strokes.length);
  const span = Math.max(0, Math.floor(limit));
  const start = Math.max(0, end - span);
  if (start === end) return undefined;

  const timingCalibration = arpeggio
    ? calibration
    : playbackCalibrationWithoutArpeggio(calibration);
  const arpeggioTimings = arpeggio
    ? cachedArpeggioTimings ?? playbackArpeggioTimings(
      strokes,
      arpeggio,
      stepsPerSecond,
      timingCalibration,
      arpeggioDelayMode,
      sameFingerDelay,
    )
    : undefined;
  const durationMs = strokes
    .slice(start, end)
    .reduce((total, stroke, offset) => {
      const index = start + offset;
      return total + playbackStrokeDurationMs(
        stroke,
        stepsPerSecond,
        sameFingerDelay,
        timingCalibration,
        strokes[index - 1],
        speedMultiplier,
        arpeggioTimings?.get(index),
      );
    }, 0);
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

/** 直近の完了済み打鍵を実際の表示時間で割った実効アクション毎秒。 */
export function playbackRecentActionsPerSecond(
  strokes: readonly Stroke[],
  cursor: number,
  stepsPerSecond: PlaybackStepsPerSecond,
  sameFingerDelay = true,
  limit = 10,
  calibration?: PlaybackCalibration,
  speedMultiplier = DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
  arpeggio?: ArpeggioConditions,
  arpeggioDelayMode: 'before' | 'distributed' = 'before',
  cachedArpeggioTimings?: ReadonlyMap<number, PlaybackArpeggioTiming>,
): number | undefined {
  const recent = playbackRecentRateWindow(
    strokes,
    cursor,
    stepsPerSecond,
    sameFingerDelay,
    limit,
    calibration,
    speedMultiplier,
    arpeggio,
    arpeggioDelayMode,
    cachedArpeggioTimings,
  );
  return recent && recent.durationMs > 0
    ? ((recent.end - recent.start) * 1000) / recent.durationMs
    : undefined;
}

/** 直近の入力単位に含まれるかな文字数を、同じ表示時間で割った実効かな毎秒。 */
export function playbackRecentKanaPerSecond(
  strokes: readonly Stroke[],
  cursor: number,
  stepsPerSecond: PlaybackStepsPerSecond,
  sameFingerDelay = true,
  limit = 10,
  calibration?: PlaybackCalibration,
  speedMultiplier = DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
  arpeggio?: ArpeggioConditions,
  arpeggioDelayMode: 'before' | 'distributed' = 'before',
  cachedArpeggioTimings?: ReadonlyMap<number, PlaybackArpeggioTiming>,
): number | undefined {
  const recent = playbackRecentRateWindow(
    strokes,
    cursor,
    stepsPerSecond,
    sameFingerDelay,
    limit,
    calibration,
    speedMultiplier,
    arpeggio,
    arpeggioDelayMode,
    cachedArpeggioTimings,
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

/** 再生カーソルごとの実効速度と、その速度計算に触れた入力文字列。 */
export function playbackRateChartData(
  strokes: readonly Stroke[],
  stepsPerSecond: PlaybackStepsPerSecond,
  sameFingerDelay = true,
  limit = 10,
  calibration?: PlaybackCalibration,
  speedMultiplier = DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
  arpeggio?: ArpeggioConditions,
  arpeggioDelayMode: 'before' | 'distributed' = 'before',
  cachedArpeggioTimings?: ReadonlyMap<number, PlaybackArpeggioTiming>,
): PlaybackRateChartPoint[] {
  const arpeggioSpans = arpeggio ? playbackArpeggioSpans(strokes, arpeggio) : undefined;
  const arpeggioCursors = arpeggioSpans
    ? new Set(arpeggioSpans.flatMap((span) => Array.from(
      { length: span.end - span.start },
      (_, offset) => span.start + offset,
    )))
    : undefined;
  const arpeggioTimings = arpeggio
    ? cachedArpeggioTimings ?? playbackArpeggioTimings(
      strokes,
      arpeggio,
      stepsPerSecond,
      calibration,
      arpeggioDelayMode,
      sameFingerDelay,
    )
    : undefined;
  const points: PlaybackRateChartPoint[] = [{ cursor: 0, inputText: '' }];
  for (let cursor = 1; cursor <= strokes.length; cursor++) {
    const recent = playbackRecentRateWindow(
      strokes,
      cursor,
      stepsPerSecond,
      sameFingerDelay,
      limit,
      calibration,
      speedMultiplier,
      arpeggio,
      arpeggioDelayMode,
      arpeggioTimings,
    );
    points.push({
      cursor,
      inputText: recent ? playbackRateWindowInputText(strokes, recent) : '',
      kanaPerSecond: playbackRecentKanaPerSecond(
        strokes,
        cursor,
        stepsPerSecond,
        sameFingerDelay,
        limit,
        calibration,
        speedMultiplier,
        arpeggio,
        arpeggioDelayMode,
        arpeggioTimings,
      ),
      actionsPerSecond: recent && recent.durationMs > 0
        ? ((recent.end - recent.start) * 1000) / recent.durationMs
        : undefined,
      chain: playbackChainOrders(strokes, cursor).size > 0,
      arpeggio: arpeggioCursors
        ? arpeggioCursors.has(cursor - 1)
        : false,
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

/** requestAnimationFrameの経過時間から再生位置を進める。 */
export function advancePlayback(
  state: PlaybackState,
  elapsedMs: number,
  strokes: readonly Stroke[],
): PlaybackState {
  const strokeCount = strokes.length;
  const cursor = clampPlaybackCursor(state.cursor, strokeCount);
  if (!state.playing || strokeCount === 0 || cursor >= strokeCount) {
    return { ...state, cursor, playing: false, elapsedMs: 0 };
  }

  let remaining = state.elapsedMs + Math.min(Math.max(0, elapsedMs), MAX_FRAME_MS);
  let nextCursor = cursor;
  const timingCalibration = state.arpeggio
    ? state.calibration
    : playbackCalibrationWithoutArpeggio(state.calibration);
  const arpeggioTimings = state.arpeggio
    ? playbackArpeggioTimings(
      strokes,
      state.arpeggio,
      state.stepsPerSecond,
      timingCalibration,
      state.arpeggioDelayMode,
      state.sameFingerDelay,
    )
    : undefined;
  while (nextCursor < strokeCount) {
    const stepMs = playbackStrokeDurationMs(
      strokes[nextCursor],
      state.stepsPerSecond,
      state.sameFingerDelay,
      timingCalibration,
      strokes[nextCursor - 1],
      state.speedMultiplier,
      arpeggioTimings?.get(nextCursor),
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
