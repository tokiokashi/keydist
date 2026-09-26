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

export interface MeanDisplacement {
  readonly x: number;
  readonly y: number;
  readonly distance: number;
  readonly angle: number | undefined;
  readonly totalWeight: number;
}

export interface DirectionDistributionBin {
  readonly angle: number;
  readonly proportion: number;
}

export interface DirectionDistribution {
  readonly bins: readonly DirectionDistributionBin[];
  readonly directionalWeight: number;
}

export interface DirectionResponseSample {
  readonly angle: number;
  readonly response: number;
}

export interface DirectionResponse {
  readonly samples: readonly DirectionResponseSample[];
  readonly directionalWeight: number;
  readonly bandwidthDegrees: number;
}

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


/** frequency-weighted mean displacement。距離を保持するため単位はgeometryのu。 */
export function meanDisplacement(
  vectors: readonly BigramVector[],
  hand: 'left' | 'right',
): MeanDisplacement {
  let x = 0;
  let y = 0;
  let totalWeight = 0;

  for (const vector of vectors) {
    if (vector.hand !== hand) continue;
    x += vector.dx * vector.weight;
    y += vector.dy * vector.weight;
    totalWeight += vector.weight;
  }

  if (totalWeight === 0) {
    return { x: 0, y: 0, distance: 0, angle: undefined, totalWeight: 0 };
  }

  x /= totalWeight;
  y /= totalWeight;
  const distance = Math.hypot(x, y);
  return {
    x,
    y,
    distance,
    angle: distance < 1e-12 ? undefined : Math.atan2(y, x),
    totalWeight,
  };
}

/**
 * 方向頻度を円周上の構成比へ変換する。
 * 各vectorは隣接するbinへ線形補間して、離散geometry由来の角度を一点binに固定しない。
 */
export function directionDistribution(
  vectors: readonly BigramVector[],
  hand: 'left' | 'right',
  binCount = 16,
): DirectionDistribution {
  if (!Number.isInteger(binCount) || binCount < 4) {
    throw new RangeError('binCount must be an integer >= 4');
  }

  const weights = Array.from({ length: binCount }, () => 0);
  let directionalWeight = 0;
  const tau = Math.PI * 2;
  const binWidth = tau / binCount;

  for (const vector of vectors) {
    if (vector.hand !== hand || vector.distance < 1e-12) continue;

    const angle = ((vector.angle % tau) + tau) % tau;
    const position = angle / binWidth;
    const lower = Math.floor(position) % binCount;
    const fraction = position - Math.floor(position);
    const upper = (lower + 1) % binCount;

    weights[lower] += vector.weight * (1 - fraction);
    weights[upper] += vector.weight * fraction;
    directionalWeight += vector.weight;
  }

  const bins = weights.map((weight, index) => Object.freeze({
    angle: index * binWidth,
    proportion: directionalWeight === 0 ? 0 : weight / directionalWeight,
  }));

  return {
    bins: Object.freeze(bins),
    directionalWeight,
  };
}


/**
 * 実vector角度へvon Mises相当の円周kernelを重ね、連続的な方向応答をsampleする。
 * bandwidthDegreesはkernel強度がpeakの1/2になる半値角。
 * responseは各vectorのweight比で平均するため0..1の共通尺度を保つ。
 */
export function directionResponse(
  vectors: readonly BigramVector[],
  hand: 'left' | 'right',
  bandwidthDegrees = 15,
  sampleCount = 96,
): DirectionResponse {
  if (!(bandwidthDegrees > 0 && bandwidthDegrees < 180)) {
    throw new RangeError('bandwidthDegrees must be > 0 and < 180');
  }
  if (!Number.isInteger(sampleCount) || sampleCount < 16) {
    throw new RangeError('sampleCount must be an integer >= 16');
  }

  const directional = vectors.filter(
    (vector) => vector.hand === hand && vector.distance >= 1e-12,
  );
  const directionalWeight = directional.reduce((sum, vector) => sum + vector.weight, 0);
  const tau = Math.PI * 2;
  const halfWidth = bandwidthDegrees * Math.PI / 180;
  const kappa = Math.log(2) / (1 - Math.cos(halfWidth));

  const samples = Array.from({ length: sampleCount }, (_, index) => {
    const angle = index * tau / sampleCount;
    if (directionalWeight === 0) {
      return Object.freeze({ angle, response: 0 });
    }

    let weightedResponse = 0;
    for (const vector of directional) {
      const delta = angle - vector.angle;
      const kernel = Math.exp(kappa * (Math.cos(delta) - 1));
      weightedResponse += vector.weight * kernel;
    }

    return Object.freeze({
      angle,
      response: weightedResponse / directionalWeight,
    });
  });

  return {
    samples: Object.freeze(samples),
    directionalWeight,
    bandwidthDegrees,
  };
}
