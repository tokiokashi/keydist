import { fingerRelation, type FingerDirection } from './analysis-transition.ts';
import { isThumb, type Finger, type Point } from './geometry.ts';
import type { Press, Stroke } from './evaluate.ts';

export type BigramSource = 'actual' | 'within-hand';
export type VectorHand = 'left' | 'right' | 'cross';
export type FingerClass = 'pinky' | 'ring' | 'middle' | 'index';

export interface BigramVector {
  readonly id: string;
  readonly source: BigramSource;
  readonly fromStrokeIndex: number;
  readonly toStrokeIndex: number;
  readonly fromFinger: Finger;
  readonly toFinger: Finger;
  readonly fromFingerClass: FingerClass;
  readonly toFingerClass: FingerClass;
  readonly fromKeyIds: readonly string[];
  readonly toKeyIds: readonly string[];
  readonly from: Point;
  readonly to: Point;
  readonly hand: VectorHand;
  readonly fingerDirection: FingerDirection | undefined;
  readonly dx: number;
  readonly dy: number;
  readonly distance: number;
  readonly angle: number;
  /** raw vectorは1。aggregate後は同一vectorの出現回数。 */
  readonly weight: number;
}

export interface DirectionBin {
  readonly index: number;
  readonly startAngle: number;
  readonly endAngle: number;
  readonly centerAngle: number;
  readonly weight: number;
}

export interface DirectionProfilePoint {
  readonly angle: number;
  readonly weight: number;
  readonly inwardWeight: number;
  readonly outwardWeight: number;
  readonly sameWeight: number;
}

export interface DirectionSummary {
  readonly x: number;
  readonly y: number;
  readonly angle: number | undefined;
  readonly magnitude: number;
  readonly directionalWeight: number;
  readonly inwardWeight: number;
  readonly outwardWeight: number;
  readonly sameWeight: number;
}

const TAU = Math.PI * 2;

export function fingerClass(finger: Finger): FingerClass | undefined {
  switch (finger[1]) {
    case 'P': return 'pinky';
    case 'R': return 'ring';
    case 'M': return 'middle';
    case 'I': return 'index';
    case 'T': return undefined;
    default: {
      const exhaustive: never = finger[1] as never;
      return exhaustive;
    }
  }
}

function handOfFinger(finger: Finger): Exclude<VectorHand, 'cross'> {
  return finger.startsWith('L') ? 'left' : 'right';
}

function vectorHand(from: Finger, to: Finger): VectorHand {
  const fromHand = handOfFinger(from);
  return fromHand === handOfFinger(to) ? fromHand : 'cross';
}

function vectorId(
  source: BigramSource,
  fromStrokeIndex: number,
  toStrokeIndex: number,
  fromPressIndex: number,
  toPressIndex: number,
  from: Press,
  to: Press,
): string {
  return [
    source,
    fromStrokeIndex,
    toStrokeIndex,
    fromPressIndex,
    toPressIndex,
    from.finger,
    to.finger,
    from.keys.map((key) => key.id).join('+'),
    to.keys.map((key) => key.id).join('+'),
  ].join(':');
}

function vectorsBetween(
  source: BigramSource,
  fromStrokeIndex: number,
  toStrokeIndex: number,
  fromPresses: readonly Press[],
  toPresses: readonly Press[],
): BigramVector[] {
  const result: BigramVector[] = [];

  fromPresses.forEach((fromPress, fromPressIndex) => {
    const fromClass = fingerClass(fromPress.finger);
    if (fromClass === undefined || isThumb(fromPress.finger)) return;

    toPresses.forEach((toPress, toPressIndex) => {
      const toClass = fingerClass(toPress.finger);
      if (toClass === undefined || isThumb(toPress.finger)) return;

      const hand = vectorHand(fromPress.finger, toPress.finger);
      const dx = toPress.target.x - fromPress.target.x;
      const dy = toPress.target.y - fromPress.target.y;
      result.push(Object.freeze({
        id: vectorId(
          source,
          fromStrokeIndex,
          toStrokeIndex,
          fromPressIndex,
          toPressIndex,
          fromPress,
          toPress,
        ),
        source,
        fromStrokeIndex,
        toStrokeIndex,
        fromFinger: fromPress.finger,
        toFinger: toPress.finger,
        fromFingerClass: fromClass,
        toFingerClass: toClass,
        fromKeyIds: Object.freeze(fromPress.keys.map((key) => key.id)),
        toKeyIds: Object.freeze(toPress.keys.map((key) => key.id)),
        from: Object.freeze({ ...fromPress.target }),
        to: Object.freeze({ ...toPress.target }),
        hand,
        fingerDirection: hand === 'cross'
          ? undefined
          : fingerRelation(fromPress.finger, toPress.finger).direction,
        dx,
        dy,
        distance: Math.hypot(dx, dy),
        angle: Math.atan2(dy, dx),
        weight: 1,
      }));
    });
  });

  return result;
}

function actualVectors(strokes: readonly Stroke[]): BigramVector[] {
  const result: BigramVector[] = [];
  for (let index = 0; index + 1 < strokes.length; index++) {
    result.push(...vectorsBetween(
      'actual',
      index,
      index + 1,
      strokes[index].presses,
      strokes[index + 1].presses,
    ));
  }
  return result;
}

function withinHandVectors(strokes: readonly Stroke[]): BigramVector[] {
  const result: BigramVector[] = [];

  for (const hand of ['left', 'right'] as const) {
    let previous: { strokeIndex: number; presses: readonly Press[] } | undefined;

    for (const [strokeIndex, stroke] of strokes.entries()) {
      const presses = stroke.presses.filter((press) => handOfFinger(press.finger) === hand);
      if (presses.length === 0) continue;

      if (previous !== undefined) {
        result.push(...vectorsBetween(
          'within-hand',
          previous.strokeIndex,
          strokeIndex,
          previous.presses,
          presses,
        ));
      }
      // 同じ手の親指だけのStrokeも「手の次の打鍵」なので境界として残す。
      previous = { strokeIndex, presses };
    }
  }

  return result;
}

/**
 * 実Stroke bigram、または反対手だけを飛ばした手内bigramをvector factへ変換する。
 * Roll / Arpeggioの成立判定やChainPolicyは参照しない。
 */
export function buildBigramVectors(
  strokes: readonly Stroke[],
  source: BigramSource,
): readonly BigramVector[] {
  return Object.freeze(source === 'actual' ? actualVectors(strokes) : withinHandVectors(strokes));
}

export function filterBigramVectors(
  vectors: readonly BigramVector[],
  selected: readonly FingerClass[],
): readonly BigramVector[] {
  if (selected.length === 0) return vectors;
  if (selected.length === 1) {
    const finger = selected[0];
    return vectors.filter(
      (vector) => vector.fromFingerClass === finger || vector.toFingerClass === finger,
    );
  }

  const [first, second] = selected;
  return vectors.filter((vector) =>
    (vector.fromFingerClass === first && vector.toFingerClass === second)
    || (vector.fromFingerClass === second && vector.toFingerClass === first));
}

function aggregateKey(vector: BigramVector): string {
  return [
    vector.source,
    vector.hand,
    vector.fromFinger,
    vector.toFinger,
    vector.fromKeyIds.join('+'),
    vector.toKeyIds.join('+'),
    vector.from.x.toFixed(6),
    vector.from.y.toFixed(6),
    vector.to.x.toFixed(6),
    vector.to.y.toFixed(6),
  ].join('|');
}

/** 同じ物理vectorをまとめ、出現回数をweightへ積む。 */
export function aggregateBigramVectors(
  vectors: readonly BigramVector[],
): readonly BigramVector[] {
  const byKey = new Map<string, BigramVector>();

  for (const vector of vectors) {
    const key = aggregateKey(vector);
    const current = byKey.get(key);
    byKey.set(key, current === undefined
      ? vector
      : Object.freeze({ ...current, weight: current.weight + vector.weight }));
  }

  return Object.freeze([...byKey.values()]);
}

export function directionProfile(
  vectors: readonly BigramVector[],
  hand: 'left' | 'right',
  precisionRadians = 1e-6,
): readonly DirectionProfilePoint[] {
  if (!Number.isFinite(precisionRadians) || precisionRadians <= 0) {
    throw new RangeError('precisionRadiansは0より大きい有限値で指定する');
  }

  const grouped = new Map<number, {
    weight: number;
    inwardWeight: number;
    outwardWeight: number;
    sameWeight: number;
  }>();

  for (const vector of vectors) {
    if (vector.hand !== hand || vector.distance === 0) continue;
    const normalized = normalizedAngle(vector.angle);
    const bucket = Math.round(normalized / precisionRadians);
    const current = grouped.get(bucket) ?? {
      weight: 0,
      inwardWeight: 0,
      outwardWeight: 0,
      sameWeight: 0,
    };
    current.weight += vector.weight;
    if (vector.fingerDirection === 'inward') current.inwardWeight += vector.weight;
    else if (vector.fingerDirection === 'outward') current.outwardWeight += vector.weight;
    else if (vector.fingerDirection === 'same') current.sameWeight += vector.weight;
    grouped.set(bucket, current);
  }

  return Object.freeze(
    [...grouped.entries()]
      .map(([bucket, value]) => Object.freeze({
        angle: normalizedAngle(bucket * precisionRadians),
        ...value,
      }))
      .sort((a, b) => a.angle - b.angle),
  );
}

export function directionSummary(
  vectors: readonly BigramVector[],
  hand: 'left' | 'right',
): DirectionSummary {
  let x = 0;
  let y = 0;
  let directionalWeight = 0;
  let inwardWeight = 0;
  let outwardWeight = 0;
  let sameWeight = 0;

  for (const vector of vectors) {
    if (vector.hand !== hand) continue;

    if (vector.fingerDirection === 'inward') inwardWeight += vector.weight;
    else if (vector.fingerDirection === 'outward') outwardWeight += vector.weight;
    else if (vector.fingerDirection === 'same') sameWeight += vector.weight;

    if (vector.distance === 0) continue;
    x += (vector.dx / vector.distance) * vector.weight;
    y += (vector.dy / vector.distance) * vector.weight;
    directionalWeight += vector.weight;
  }

  if (directionalWeight === 0) {
    return {
      x: 0,
      y: 0,
      angle: undefined,
      magnitude: 0,
      directionalWeight: 0,
      inwardWeight,
      outwardWeight,
      sameWeight,
    };
  }

  x /= directionalWeight;
  y /= directionalWeight;
  return {
    x,
    y,
    angle: Math.atan2(y, x),
    magnitude: Math.hypot(x, y),
    directionalWeight,
    inwardWeight,
    outwardWeight,
    sameWeight,
  };
}

function normalizedAngle(angle: number): number {
  return ((angle % TAU) + TAU) % TAU;
}

export function directionBins(
  vectors: readonly BigramVector[],
  hand: 'left' | 'right',
  binCount = 16,
): readonly DirectionBin[] {
  if (!Number.isInteger(binCount) || binCount < 1) {
    throw new RangeError('binCountは1以上の整数で指定する');
  }

  const binWidth = TAU / binCount;
  const weights = Array<number>(binCount).fill(0);
  for (const vector of vectors) {
    if (vector.hand !== hand || vector.distance === 0) continue;
    const index = Math.min(
      binCount - 1,
      Math.floor(normalizedAngle(vector.angle) / binWidth),
    );
    weights[index] += vector.weight;
  }

  return Object.freeze(weights.map((weight, index) => Object.freeze({
    index,
    startAngle: index * binWidth,
    endAngle: (index + 1) * binWidth,
    centerAngle: (index + 0.5) * binWidth,
    weight,
  })));
}
