import { isRecord } from '#input/codec/index.ts';
import {
  ALL_FINGERS,
  FINGERS,
  HOME_ROW,
  THUMB_KEY,
  dist,
  resolveKeyId,
  type Finger,
  type Geometry,
  type Key,
} from '#input/shapes/geometry.ts';

/**
 * 遷移（直前のストロークから今のストロークへ）が属する構造の種類。打鍵の上乗せ（`keystrokeOverheadMs`）を選ぶ。
 * Arpeggioの中、Chainの中でArpeggioでないもの、どちらでもないもの（最初のストロークを含む）の3つ。
 */
export type StrokeStructureKind = 'arpeggio' | 'chain' | 'other';

export const STROKE_STRUCTURE_KINDS: readonly StrokeStructureKind[] = ['arpeggio', 'chain', 'other'];

/**
 * ステップごとに1つに決まる差の種類（`stroke-structure.ts`）。構造の種類の3つに、続け打ち（`repeat`）と
 * 同指連続（`sfb`）を足した5つ。
 */
export type StepOverheadKind = StrokeStructureKind | 'repeat' | 'sfb';

/** 直前のストロークと同じ入力単位を打つか（かなの中）、違う入力単位を打つか（かなの境目）。 */
export type OverheadSide = 'within' | 'boundary';

export const OVERHEAD_SIDES: readonly OverheadSide[] = ['within', 'boundary'];

/** 構造の種類のかなの中・かなの境目の値のキー（例: `arpeggio-within`）。 */
export type SideOverheadKind = `${StrokeStructureKind}-${OverheadSide}`;

/**
 * 打鍵の上乗せ（`keystrokeOverheadMs`）の値のキー。構造の種類の分けない値・かなの中の値・かなの境目の値と、
 * 続け打ち・同指連続の11個。分けない値とかなの中・境目の値は、どれも独立に持てる。
 */
export type OverheadKind = StepOverheadKind | SideOverheadKind;

export function sideOverheadKind(kind: StrokeStructureKind, side: OverheadSide): SideOverheadKind {
  return `${kind}-${side}`;
}

/** 表示と編集の並び順。構造の種類ごとに、分けない値・かなの中・かなの境目の順。 */
export const OVERHEAD_KINDS: readonly OverheadKind[] = [
  ...STROKE_STRUCTURE_KINDS.flatMap((kind) => [kind, ...OVERHEAD_SIDES.map((side) => sideOverheadKind(kind, side))]),
  'repeat',
  'sfb',
];

/**
 * 同時押しのストローク（押下が2本以上の指にまたがるストローク）の分け方。同時押しの上乗せ（`simultaneousOverheadMs`）を選ぶ。
 * 親指を含む（`thumb`）、親指を含まず左右の手にまたがる（`both-hands`）、親指を含まず全部同じ手（`one-hand`）の3つ。
 */
export type SimultaneousKind = 'both-hands' | 'one-hand' | 'thumb';

/** 表示と編集の並び順。 */
export const SIMULTANEOUS_KINDS: readonly SimultaneousKind[] = ['both-hands', 'one-hand', 'thumb'];

/** 再生へ反映する個人の打鍵・指の移動の時間。 */
export interface PlaybackCalibration {
  /** 通常の連続打鍵速度。 */
  actionsPerSecond: number;
  /** 異手の方向別連続打鍵速度。測っていない方向は持たない。 */
  actionsPerSecondByDirection?: Readonly<Partial<Record<HandDirection, number>>>;
  /** 同じ手の別の指へ移る連続打鍵速度の代表値。 */
  sameHandDifferentFingerActionsPerSecond: number;
  /** 同じ手の別指の組ごとの測定速度。キーは正規化した指ペア（例: `LM:LI`）。 */
  sameHandDifferentFingerActionsPerSecondByPair: Readonly<Record<string, number>>;
  /** 同じ手の別指の方向別測定速度。キーは `LM>LI` 形式。 */
  sameHandDifferentFingerActionsPerDirectedPair?: Readonly<Record<string, number>>;
  /**
   * 指ごとの、同じキーを続けて打つ時間[ms]（`r(f)`。続け打ちの基準）。測れなかった指は持たない。
   * 持つ指の組は`fingerMoveMsPerUnit`と同じ。
   */
  fingerRepeatMs: Partial<Record<Finger, number>>;
  /** 指ごとの、1uあたりの移動の時間[ms/u]（`m(f)`）。測れなかった指は持たない。測った2つの間隔の差が0以下だった指は0。 */
  fingerMoveMsPerUnit: Partial<Record<Finger, number>>;
  /** 指ごとの値が無い指に使う、同じキーを続けて打つ時間[ms]。 */
  fallbackRepeatMs: number;
  /** 指ごとの値が無い指に使う、1uあたりの移動の時間[ms/u]。 */
  fallbackMoveMsPerUnit: number;
  /**
   * 文章を打つ時の打鍵の上乗せ[ms]。差の種類ごとに持ち、構造の種類はかなの中・かなの境目の値も持てる。
   * 続け打ちと同指連続を除く種類は、基準の時間のうち1打の時間（`normalMs`）の側にだけ足す。
   * 同指連続のステップは、値を持つ時は`max(normalMs, 移動の時間)`の外に足す。
   * 持たない値は、同じ側の「その他」、分けない値、分けない「その他」の順で代わりの値を使う（`playbackKeystrokeOverheadMs`）。
   */
  keystrokeOverheadMs?: Readonly<Partial<Record<OverheadKind, number>>>;
  /**
   * 同時押しの上乗せ[ms]。同時押しのストロークのステップで、1打の時間（`normalMs`）の側に、打鍵の上乗せと同じ場所へ足す。
   * 同じ同時押しを続けて打った間隔の中央値から、再生がそのステップに選ぶ1打の時間を引いた差。分け方ごとに持ち、持たない分け方は足さない。
   */
  simultaneousOverheadMs?: Readonly<Partial<Record<SimultaneousKind, number>>>;
  /**
   * 文章を打つ測定の保存が、保存した行（構造の種類と同指連続）の値を求めるのに数えたストロークに入っていた同時押しの分け方。
   * 空は「同時押しのストロークが入っていない」、持たない時は「分からない」を表す。
   * 同時押しの測定が打鍵の上乗せを消すかを決める（`calibration-session.ts`）。
   */
  sentenceSimultaneousKinds?: readonly SimultaneousKind[];
  measuredAt: number;
}

export interface CalibrationKeyPair {
  finger: Finger;
  fromKey: string;
  toKey: string;
  distance: number;
}

export const CALIBRATION_ACTIONS_PER_SECOND_MIN = 0.1;
export const CALIBRATION_ACTIONS_PER_SECOND_MAX = 40;
/** 同じキーを続けて打つ時間[ms]の範囲。通常速度の範囲（アクション/秒）の逆数。 */
export const CALIBRATION_REPEAT_MS_MIN = 1000 / CALIBRATION_ACTIONS_PER_SECOND_MAX;
export const CALIBRATION_REPEAT_MS_MAX = 1000 / CALIBRATION_ACTIONS_PER_SECOND_MIN;
/** 1uあたりの移動の時間[ms/u]の範囲。0は、測った2つの間隔の差が0以下だったことを表す。 */
export const CALIBRATION_MOVE_MS_PER_UNIT_MIN = 0;
export const CALIBRATION_MOVE_MS_PER_UNIT_MAX = 10000;
export const CALIBRATION_OVERHEAD_MS_MIN = -1000;
export const CALIBRATION_OVERHEAD_MS_MAX = 1000;
export const CALIBRATION_ACTION_SAMPLES = 9;
/** 指ごとに、同じキーを続けて打つ時間を取る間隔の数。 */
export const CALIBRATION_REPEAT_SAMPLES = 9;
/** 指ごとに、ホームと下段のキーを交互に打つ間隔の数。 */
export const CALIBRATION_FINGER_SAMPLES = 6;
export const CALIBRATION_SAME_HAND_SAMPLES = 6;

export type HandDirection = 'L→R' | 'R→L';

function positiveFiniteValues(values: readonly number[]): number[] {
  return values.filter((value) => Number.isFinite(value) && value > 0);
}

/** 外れ値の影響を抑えるための中央値。 */
export function median(values: readonly number[]): number | undefined {
  const sorted = positiveFiniteValues(values).sort((a, b) => a - b);
  if (sorted.length === 0) return undefined;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function actionsPerSecondFromIntervals(intervalsMs: readonly number[]): number | undefined {
  const typicalMs = median(intervalsMs);
  return typicalMs === undefined ? undefined : 1000 / typicalMs;
}

/** 指ごとの測定項目の値。`r(f)`と`I(f)`の中央値と、測った2つのキーの距離[u]から`m(f)`を求める。 */
export interface FingerMeasurement {
  /** 同じキーを続けて打つ時間の中央値[ms]（`r(f)`）。 */
  readonly repeatMs: number;
  /** 1uあたりの移動の時間[ms/u]（`m(f)`）。 */
  readonly moveMsPerUnit: number;
}

/**
 * 指ごとの測定項目の値を求める。`repeatIntervalsMs`はホームキーを続けて打った間隔、`moveIntervalsMs`はホームと下段のキーを交互に打った間隔。
 * `m(f) = max(0, I(f) − r(f)) / distance`。どちらかが測れていない、距離が正でない時は`undefined`。
 */
export function fingerMeasurementFromIntervals(
  repeatIntervalsMs: readonly number[],
  moveIntervalsMs: readonly number[],
  distance: number,
): FingerMeasurement | undefined {
  const repeatMs = median(repeatIntervalsMs);
  const moveMs = median(moveIntervalsMs);
  if (repeatMs === undefined || moveMs === undefined) return undefined;
  if (!Number.isFinite(distance) || distance <= 0) return undefined;
  return { repeatMs, moveMsPerUnit: Math.max(0, moveMs - repeatMs) / distance };
}

/** 値の中央値。`median`と違って0も値に数える（移動の時間が0の指も代表値の根拠になる）。 */
export function medianIncludingZero(values: readonly number[]): number | undefined {
  const sorted = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (sorted.length === 0) return undefined;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** 指の同じキーを続けて打つ時間[ms]。測れなかった指は代表値。 */
export function playbackRepeatMs(calibration: Pick<PlaybackCalibration, 'fingerRepeatMs' | 'fallbackRepeatMs'>, finger: Finger): number {
  return calibration.fingerRepeatMs[finger] ?? calibration.fallbackRepeatMs;
}

/** 指の1uあたりの移動の時間[ms/u]。測れなかった指は代表値。 */
export function playbackMoveMsPerUnit(calibration: Pick<PlaybackCalibration, 'fingerMoveMsPerUnit' | 'fallbackMoveMsPerUnit'>, finger: Finger): number {
  return calibration.fingerMoveMsPerUnit[finger] ?? calibration.fallbackMoveMsPerUnit;
}

/**
 * 続け打ちの基準の、親指を除く8本の指の平均[ms]。続け打ちの上乗せは全ての指をまとめた1つの値なので、
 * `r(f)`を測り直した時に、この平均の変化の分だけずらす（`spec/playback-timing.md` §6.3）。
 */
export function meanRepeatMs(calibration: Pick<PlaybackCalibration, 'fingerRepeatMs' | 'fallbackRepeatMs'>): number {
  return FINGERS.reduce((sum, finger) => sum + playbackRepeatMs(calibration, finger), 0) / FINGERS.length;
}

/** 同じ手の別指を識別する、順序に依存しないキーを返す。 */
export function sameHandFingerPairKey(first: Finger, second: Finger): string | undefined {
  if (first === second || first[0] !== second[0]) return undefined;
  if (!FINGERS.includes(first as typeof FINGERS[number])
    || !FINGERS.includes(second as typeof FINGERS[number])) return undefined;
  const ordered = [first, second].sort((a, b) =>
    FINGERS.indexOf(a as typeof FINGERS[number]) - FINGERS.indexOf(b as typeof FINGERS[number]),
  );
  return `${ordered[0]}:${ordered[1]}`;
}

/** 異手の方向を、保存キーに使える記号へ正規化する。 */
export function handDirection(first: Finger, second: Finger): HandDirection | undefined {
  if (first[0] === second[0]) return undefined;
  return first[0] === 'L' ? 'L→R' : 'R→L';
}

/** 同手別指の順序を残した保存キーを返す。 */
export function sameHandDirectedFingerPairKey(from: Finger, to: Finger): string | undefined {
  if (from === to || from[0] !== to[0]) return undefined;
  if (!FINGERS.includes(from as typeof FINGERS[number])
    || !FINGERS.includes(to as typeof FINGERS[number])) return undefined;
  return `${from}>${to}`;
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isRateRecord(value: unknown, keyValid: (key: string) => boolean, min: number, max: number): boolean {
  return isRecord(value)
    && Object.entries(value).every(([key, speed]) => keyValid(key) && inRange(speed, min, max));
}

function isSameHandPairKey(key: string): boolean {
  const parts = key.split(':');
  return parts.length === 2 && sameHandFingerPairKey(parts[0] as Finger, parts[1] as Finger) === key;
}

function isDirectedPairKey(key: string): boolean {
  const parts = key.split('>');
  return parts.length === 2 && sameHandDirectedFingerPairKey(parts[0] as Finger, parts[1] as Finger) === key;
}

/**
 * 個人速度として保存できない理由。保存できる値なら `undefined`。
 * 必須の項目が欠けた値、範囲を外れた値、知らない指や組のキーを持つ値を保存できない値とする。
 */
export function playbackCalibrationProblem(value: unknown): string | undefined {
  if (!isRecord(value)) return '個人速度の形が正しくありません';
  const rateOk = (speed: unknown) => inRange(speed, CALIBRATION_ACTIONS_PER_SECOND_MIN, CALIBRATION_ACTIONS_PER_SECOND_MAX);
  if (!rateOk(value.actionsPerSecond)) return '通常の打鍵速度が範囲外です';
  if (!rateOk(value.sameHandDifferentFingerActionsPerSecond)) return '同手・別指の代表の速度が範囲外です';
  if (!inRange(value.fallbackRepeatMs, CALIBRATION_REPEAT_MS_MIN, CALIBRATION_REPEAT_MS_MAX)) return '測定できなかった指の同じキーを続けて打つ時間が範囲外です';
  if (!inRange(value.fallbackMoveMsPerUnit, CALIBRATION_MOVE_MS_PER_UNIT_MIN, CALIBRATION_MOVE_MS_PER_UNIT_MAX)) return '測定できなかった指の移動の時間が範囲外です';
  if (typeof value.measuredAt !== 'number' || !Number.isFinite(value.measuredAt)) return '測定した時刻が正しくありません';
  if (!isRateRecord(
    value.sameHandDifferentFingerActionsPerSecondByPair,
    isSameHandPairKey,
    CALIBRATION_ACTIONS_PER_SECOND_MIN,
    CALIBRATION_ACTIONS_PER_SECOND_MAX,
  )) return '同手・別指の組ごとの速度が正しくありません';
  const fingerKey = (finger: string) => ALL_FINGERS.includes(finger as Finger);
  if (!isRateRecord(value.fingerRepeatMs, fingerKey, CALIBRATION_REPEAT_MS_MIN, CALIBRATION_REPEAT_MS_MAX)) {
    return '指ごとの同じキーを続けて打つ時間が正しくありません';
  }
  if (!isRateRecord(value.fingerMoveMsPerUnit, fingerKey, CALIBRATION_MOVE_MS_PER_UNIT_MIN, CALIBRATION_MOVE_MS_PER_UNIT_MAX)) {
    return '指ごとの移動の時間が正しくありません';
  }
  // 同じ指の2つで1組の値なので、片方だけを持つ指があれば保存できない値とする。
  const repeatFingers = Object.keys(value.fingerRepeatMs as object);
  const moveFingers = Object.keys(value.fingerMoveMsPerUnit as object);
  if (repeatFingers.length !== moveFingers.length || repeatFingers.some((finger) => !moveFingers.includes(finger))) {
    return '指ごとの同じキーを続けて打つ時間と移動の時間の指が揃っていません';
  }
  if (value.actionsPerSecondByDirection !== undefined && !isRateRecord(
    value.actionsPerSecondByDirection,
    (direction) => direction === 'L→R' || direction === 'R→L',
    CALIBRATION_ACTIONS_PER_SECOND_MIN,
    CALIBRATION_ACTIONS_PER_SECOND_MAX,
  )) return '異手の方向別の速度が正しくありません';
  if (value.sameHandDifferentFingerActionsPerDirectedPair !== undefined && !isRateRecord(
    value.sameHandDifferentFingerActionsPerDirectedPair,
    isDirectedPairKey,
    CALIBRATION_ACTIONS_PER_SECOND_MIN,
    CALIBRATION_ACTIONS_PER_SECOND_MAX,
  )) return '同手・別指の方向別の速度が正しくありません';
  if (value.keystrokeOverheadMs !== undefined && !isRateRecord(
    value.keystrokeOverheadMs,
    (kind) => OVERHEAD_KINDS.includes(kind as OverheadKind),
    CALIBRATION_OVERHEAD_MS_MIN,
    CALIBRATION_OVERHEAD_MS_MAX,
  )) return '打鍵の上乗せが正しくありません';
  if (value.simultaneousOverheadMs !== undefined && !isRateRecord(
    value.simultaneousOverheadMs,
    (kind) => SIMULTANEOUS_KINDS.includes(kind as SimultaneousKind),
    CALIBRATION_OVERHEAD_MS_MIN,
    CALIBRATION_OVERHEAD_MS_MAX,
  )) return '同時押しの上乗せが正しくありません';
  if (value.sentenceSimultaneousKinds !== undefined && !isSimultaneousKindList(value.sentenceSimultaneousKinds)) {
    return '文章に入った同時押しの分け方が正しくありません';
  }
  return undefined;
}

/** 同時押しの分け方の並び。知らない分け方と重複を持たない。 */
function isSimultaneousKindList(value: unknown): boolean {
  return Array.isArray(value)
    && value.every((kind) => SIMULTANEOUS_KINDS.includes(kind as SimultaneousKind))
    && new Set(value).size === value.length;
}

/** 打鍵の上乗せのうち、文章に入った同時押しの分け方の記録を残す根拠になる種類（構造の種類の分けない値・かなの中・かなの境目の値と、同指連続）。 */
export const SENTENCE_RECORDED_OVERHEAD_KINDS: readonly OverheadKind[] = OVERHEAD_KINDS.filter((kind) => kind !== 'repeat');

/**
 * 構造の種類と同指連続の打鍵の上乗せが全部無い保存値から、文章に入った同時押しの分け方の記録を外す。
 * 記録は、それらの値を求めたストロークの分け方なので、値が無ければ意味を持たない。
 */
export function withoutOrphanedSentenceSimultaneous(calibration: PlaybackCalibration): PlaybackCalibration {
  if (calibration.sentenceSimultaneousKinds === undefined) return calibration;
  const overheads = calibration.keystrokeOverheadMs;
  if (overheads !== undefined && SENTENCE_RECORDED_OVERHEAD_KINDS.some((kind) => overheads[kind] !== undefined)) return calibration;
  const { sentenceSimultaneousKinds: _kinds, ...others } = calibration;
  return others;
}

export function isPlaybackCalibration(value: unknown): value is PlaybackCalibration {
  return playbackCalibrationProblem(value) === undefined;
}

const CALIBRATION_KEY_LABEL_PATTERN = /\p{L}|\p{P}/u;

/** 選択中の配列で文字・ピリオド・コンマが刻印された物理キーだけを候補にする。 */
export function calibrationEligibleKeyIds(
  geometry: Geometry,
  legends?: ReadonlyMap<string, string>,
): ReadonlySet<string> {
  const gridKeyIds = new Set(geometry.grid.flat().map((key) => key.id));
  if (!legends) return gridKeyIds;
  return new Set(
    [...gridKeyIds].filter((keyId) => {
      const label = legends.get(keyId);
      return label !== undefined && CALIBRATION_KEY_LABEL_PATTERN.test(label);
    }),
  );
}

/**
 * 指のホームキーと同じ列（`col`）の、ホーム段の1つ下の段のキー。数字段は使わない。
 * キーが無い、刻印が無い、その指の担当でない時は`undefined`。別の下段のキーで代わりにしない。
 */
function lowerKeyInHomeColumn(
  geometry: Geometry,
  finger: typeof FINGERS[number],
  home: Key,
  eligibleKeyIds: ReadonlySet<string>,
): Key | undefined {
  return [...geometry.keys.values()].find((key) => key.finger === finger
    && key.row === HOME_ROW + 1
    && key.col === home.col
    && eligibleKeyIds.has(key.id));
}

/**
 * 各指の測定項目に使う、ホームと同じ列の下段のキーの組（`spec/playback-timing.md` §6.1）。
 * ホームキーか下段のキーが使えない（刻印が無い・その指の担当でない・無い）指、距離が0の指は組を作らない。
 */
export function calibrationKeyPairs(
  geometry: Geometry,
  eligibleKeyIds = calibrationEligibleKeyIds(geometry),
): CalibrationKeyPair[] {
  const pairs: CalibrationKeyPair[] = [];
  for (const finger of FINGERS) {
    const homeId = geometry.assignment.homeKey[finger];
    const home = geometry.keys.get(homeId);
    if (!home) continue;
    if (!eligibleKeyIds.has(home.id)) continue;
    const target = lowerKeyInHomeColumn(geometry, finger, home, eligibleKeyIds);
    if (!target) continue;
    const distance = dist(home, target);
    if (distance <= 0) continue;
    pairs.push({ finger, fromKey: home.id, toKey: target.id, distance });
  }
  return pairs;
}

/** 通常の打鍵速度の測定に使う、左右人差し指のホームキー。 */
export function calibrationActionPair(
  geometry: Geometry,
  eligibleKeyIds = calibrationEligibleKeyIds(geometry),
): [string, string] | undefined {
  const left = geometry.assignment.homeKey.LI;
  const right = geometry.assignment.homeKey.RI;
  return left && right && left !== right && eligibleKeyIds.has(left) && eligibleKeyIds.has(right)
    ? [left, right]
    : undefined;
}

/** 同じ手の別指を交互に打つ測定用のホームキー組。候補キーだけで全組合せを作る。 */
export function calibrationSameHandPairs(
  geometry: Geometry,
  eligibleKeyIds = calibrationEligibleKeyIds(geometry),
): [string, string][] {
  const pairs: [string, string][] = [];
  for (const hand of ['L', 'R'] as const) {
    const fingers = FINGERS.filter((finger) => finger.startsWith(hand));
    for (let leftIndex = 0; leftIndex < fingers.length; leftIndex++) {
      for (let rightIndex = leftIndex + 1; rightIndex < fingers.length; rightIndex++) {
        const left = geometry.assignment.homeKey[fingers[leftIndex]];
        const right = geometry.assignment.homeKey[fingers[rightIndex]];
        if (left && right && left !== right && eligibleKeyIds.has(left) && eligibleKeyIds.has(right)) {
          pairs.push([left, right]);
        }
      }
    }
  }
  return pairs;
}

/** アルペジオ用の同手・別指の全方向キー組を作る。 */
export function calibrationDirectedSameHandPairs(
  geometry: Geometry,
  eligibleKeyIds = calibrationEligibleKeyIds(geometry),
): [string, string][] {
  const pairs: [string, string][] = [];
  for (const [first, second] of calibrationSameHandPairs(geometry, eligibleKeyIds)) {
    pairs.push([first, second], [second, first]);
  }
  return pairs;
}

export function calibrationKeyMatches(event: { readonly key: string; readonly code: string }, keyId: string, keyLabel = keyId): boolean {
  // 右手の親指のキーはSpace。物理配列はSpaceを右手の親指のキーとして扱う。
  if (resolveKeyId(keyId) === THUMB_KEY.RT) return event.code === 'Space' || event.key === ' ';
  const eventKey = event.key.toLowerCase();
  if (eventKey === keyId.toLowerCase() || eventKey === keyLabel.toLowerCase()) return true;

  const codeToKey: Record<string, string> = {
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=',
  };
  const code = event.code;
  const physicalKey = code.startsWith('Key')
    ? code.slice(3).toLowerCase()
    : code.startsWith('Digit')
      ? code.slice(5)
      : codeToKey[code];
  return physicalKey !== undefined && physicalKey === keyId.toLowerCase();
}
