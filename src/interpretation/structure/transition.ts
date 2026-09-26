import type { Finger, Key } from '#input/shapes/geometry.ts';
import type { Stroke } from '#trace/evaluate.ts';
import {
  analyzeChains,
  type ChainAnalysisResult,
  type ChainPolicy,
  type Hand,
} from './chain.ts';

export type FingerDirection = 'inward' | 'outward' | 'same';

/**
 * Analysis Chain内の隣接Stroke間に存在する1本のPress×Press候補。
 *
 * fromKeys / toKeys は元StrokeのPressが持つKey配列への参照で、Key/Pointを複製しない。
 * press / participation indexは1回のAnalysisResult内でのみ安定する参照。
 */
export interface FingerTransition {
  readonly candidateIndex: number;
  readonly fromPressIndex: number;
  readonly toPressIndex: number;
  readonly fromParticipationIndex: number | undefined;
  readonly toParticipationIndex: number | undefined;
  readonly fromFinger: Finger;
  readonly toFinger: Finger;
  readonly fromKeys: readonly Key[];
  readonly toKeys: readonly Key[];
  readonly fingerDirection: FingerDirection;
  /** 解剖学的rank差の絶対値。sameは0、飛び指も削除せず保持する。 */
  readonly fingerStep: number;
  /** Press target間の物理座標差。方向判定には使わない品質fact。 */
  readonly dx: number;
  readonly dy: number;
}

/** Analysis Chain内の隣接Stroke pair × handに対応するfact。 */
export interface HandTransition {
  /** 1回のAnalysisResult内で安定するindex。stable IDではない。 */
  readonly transitionIndex: number;
  readonly chainIndex: number;
  readonly hand: Hand;
  readonly fromStrokeIndex: number;
  readonly toStrokeIndex: number;
  /** 対象handのPress×Press直積。代表候補へ潰さない。 */
  readonly candidates: readonly FingerTransition[];
}

/**
 * SFBはsame候補を1つ以上持つHandTransitionという構造的事実。
 * 1 Transitionにsame候補が複数あってもeventは1件で、候補indexをすべて保持する。
 */
export interface SfbEvent {
  readonly transitionIndex: number;
  readonly chainIndex: number;
  readonly hand: Hand;
  readonly candidateIndexes: readonly number[];
}

export interface TransitionAnalysisResult extends ChainAnalysisResult {
  readonly transitions: readonly HandTransition[];
  readonly sfbEvents: readonly SfbEvent[];
  /** SFB eventの両端Strokeをunionした、重複なしのindex集合。 */
  readonly sfbStrokeIndexes: readonly number[];
}

function handOf(finger: Finger): Hand {
  return finger.startsWith('L') ? 'left' : 'right';
}

/**
 * pinky -> ring -> middle -> index -> thumb
 * 左右の物理x座標とは独立した解剖学的rank。
 */
export function fingerRank(finger: Finger): number {
  switch (finger[1]) {
    case 'P': return 0;
    case 'R': return 1;
    case 'M': return 2;
    case 'I': return 3;
    case 'T': return 4;
    default: {
      const exhaustive: never = finger[1] as never;
      return exhaustive;
    }
  }
}

export function fingerRelation(from: Finger, to: Finger): {
  direction: FingerDirection;
  step: number;
} {
  const delta = fingerRank(to) - fingerRank(from);
  return {
    direction: delta > 0 ? 'inward' : delta < 0 ? 'outward' : 'same',
    step: Math.abs(delta),
  };
}

function participationIndex(stroke: Stroke, hand: Hand, finger: Finger): number | undefined {
  const index = stroke.participations.findIndex(
    (participation) => participation.hand === hand && participation.finger === finger,
  );
  return index < 0 ? undefined : index;
}

function candidatesFor(
  fromStroke: Stroke,
  toStroke: Stroke,
  hand: Hand,
): readonly FingerTransition[] {
  const fromPresses = fromStroke.presses
    .map((press, index) => ({ press, index }))
    .filter(({ press }) => handOf(press.finger) === hand);
  const toPresses = toStroke.presses
    .map((press, index) => ({ press, index }))
    .filter(({ press }) => handOf(press.finger) === hand);

  const candidates: FingerTransition[] = [];
  for (const from of fromPresses) {
    for (const to of toPresses) {
      const relation = fingerRelation(from.press.finger, to.press.finger);
      candidates.push(Object.freeze({
        candidateIndex: candidates.length,
        fromPressIndex: from.index,
        toPressIndex: to.index,
        fromParticipationIndex: participationIndex(fromStroke, hand, from.press.finger),
        toParticipationIndex: participationIndex(toStroke, hand, to.press.finger),
        fromFinger: from.press.finger,
        toFinger: to.press.finger,
        fromKeys: from.press.keys,
        toKeys: to.press.keys,
        fingerDirection: relation.direction,
        fingerStep: relation.step,
        dx: to.press.target.x - from.press.target.x,
        dy: to.press.target.y - from.press.target.y,
      }));
    }
  }
  return Object.freeze(candidates);
}

/**
 * Analysis Chain内の隣接Stroke pairからTransition factsを作る。
 * candidate削減・Roll/Redirect/Arpeggio判定・Timing/Calibration参照はしない。
 */
export function buildHandTransitions(
  analysis: ChainAnalysisResult,
): readonly HandTransition[] {
  const transitions: HandTransition[] = [];

  for (const chain of analysis.chains) {
    for (
      let fromStrokeIndex = chain.startStrokeIndex;
      fromStrokeIndex + 1 < chain.endStrokeIndex;
      fromStrokeIndex++
    ) {
      const toStrokeIndex = fromStrokeIndex + 1;
      transitions.push(Object.freeze({
        transitionIndex: transitions.length,
        chainIndex: chain.chainIndex,
        hand: chain.hand,
        fromStrokeIndex,
        toStrokeIndex,
        candidates: candidatesFor(
          analysis.strokes[fromStrokeIndex],
          analysis.strokes[toStrokeIndex],
          chain.hand,
        ),
      }));
    }
  }

  return Object.freeze(transitions);
}

/** same候補を持つTransitionだけをSFB eventとして抽出する。 */
export function buildSfbEvents(
  transitions: readonly HandTransition[],
): readonly SfbEvent[] {
  return Object.freeze(transitions.flatMap((transition) => {
    const candidateIndexes = transition.candidates
      .filter((candidate) => candidate.fingerDirection === 'same')
      .map((candidate) => candidate.candidateIndex);
    if (candidateIndexes.length === 0) return [];
    return [Object.freeze({
      transitionIndex: transition.transitionIndex,
      chainIndex: transition.chainIndex,
      hand: transition.hand,
      candidateIndexes: Object.freeze(candidateIndexes),
    })];
  }));
}

/** SFB eventの両端Strokeをunionし、coverage用の重複なしindex列を返す。 */
export function sfbStrokeIndexUnion(
  transitions: readonly HandTransition[],
  events: readonly SfbEvent[],
): readonly number[] {
  const indexes = new Set<number>();
  for (const event of events) {
    const transition = transitions[event.transitionIndex];
    if (!transition) continue;
    indexes.add(transition.fromStrokeIndex);
    indexes.add(transition.toStrokeIndex);
  }
  return Object.freeze([...indexes].sort((left, right) => left - right));
}

/**
 * Chain解析結果へTransition/SFB factsを追加する。
 * 既存のStroke / Raw hand run / Chainは参照をそのまま共有する。
 */
export function analyzeTransitions(
  chainAnalysis: ChainAnalysisResult,
): TransitionAnalysisResult {
  const transitions = buildHandTransitions(chainAnalysis);
  const sfbEvents = buildSfbEvents(transitions);
  const sfbStrokeIndexes = sfbStrokeIndexUnion(transitions, sfbEvents);
  return Object.freeze({
    ...chainAnalysis,
    transitions,
    sfbEvents,
    sfbStrokeIndexes,
  });
}

/** 呼び出し側向けの合成入口。 */
export function analyzeStrokeTransitions(
  strokes: readonly Stroke[],
  policy?: ChainPolicy,
): TransitionAnalysisResult {
  return analyzeTransitions(analyzeChains(strokes, policy));
}
