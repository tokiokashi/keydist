import { ALL_FINGERS, keyId, resolveKeyId, type Finger, type Geometry } from './geometry.ts';
import { faceCells } from './layers.ts';
import type { Stroke } from './evaluate.ts';
import type { Layout } from './layouts/types.ts';

/** 表示上の1打鍵の基準間隔。実際の打鍵時間や距離モデルとは無関係。 */
export const PLAYBACK_STEP_MS = 800;
export const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2, 4] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

/** 非アクティブなタブから戻った時の一気送りを防ぐため、1フレームの経過時間を制限する。 */
const MAX_FRAME_MS = 100;

export interface PlaybackState {
  /** 0は開始前、nはn打鍵ぶん進んだ位置。 */
  cursor: number;
  speed: PlaybackSpeed;
  playing: boolean;
  elapsedMs: number;
}

export interface PlaybackStrokeDisplay {
  /** 現在の出力キーが面に持つ文字。シフトだけのステップでは undefined */
  character?: string;
  /** 現在のステップで表示するキーごとの刻印 */
  keyLabels: ReadonlyMap<string, string>;
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
    if (next <= end && inputIndex !== currentInputIndex) completed.push(strokes[at].inputChar);
    at = next;
  }
  return completed.slice(-limit);
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
  const keyLabels = new Map<string, string>();

  // 面に空欄として定義されたキーは、基底面の刻印へ戻さず空欄にする。
  for (const face of faces) {
    face.rows.forEach((row, rowIndex) => {
      const cells = typeof row === 'string' ? [...row] : [...row];
      cells.forEach((_label, colIndex) => keyLabels.set(keyId(rowIndex, colIndex), ''));
    });
  }
  for (const face of faces) {
    for (const [key, label] of faceCells(face)) {
      const previous = keyLabels.get(key);
      keyLabels.set(key, previous && label !== previous ? `${previous} / ${label}` : label);
    }
  }
  for (const key of triggerKeys) keyLabels.set(key, '⇧');

  const character = outputKeys
    .map((key) => keyLabels.get(key))
    .filter((label): label is string => label !== undefined && label !== '')
    .join(' / ');
  return { character: character || undefined, keyLabels };
}

export function createPlaybackState(speed: PlaybackSpeed = 1): PlaybackState {
  return { cursor: 0, speed, playing: false, elapsedMs: 0 };
}

export function clampPlaybackCursor(cursor: number, strokeCount: number): number {
  return Math.min(Math.max(0, cursor), Math.max(0, strokeCount));
}

/** カーソル位置に表示する打鍵。0は開始前なので文字を表示しない。 */
export function playbackStrokeAt(strokes: readonly Stroke[], cursor: number): Stroke | undefined {
  if (cursor <= 0 || strokes.length === 0) return undefined;
  return strokes[Math.min(cursor - 1, strokes.length - 1)];
}

export function setPlaybackSpeed(state: PlaybackState, speed: PlaybackSpeed): PlaybackState {
  return { ...state, speed, elapsedMs: 0 };
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
  strokeCount: number,
): PlaybackState {
  const cursor = clampPlaybackCursor(state.cursor, strokeCount);
  if (!state.playing || strokeCount === 0 || cursor >= strokeCount) {
    return { ...state, cursor, playing: false, elapsedMs: 0 };
  }

  let remaining = state.elapsedMs + Math.min(Math.max(0, elapsedMs), MAX_FRAME_MS);
  let nextCursor = cursor;
  const stepMs = PLAYBACK_STEP_MS / state.speed;
  while (remaining >= stepMs && nextCursor < strokeCount) {
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
