import type { Finger } from '#input/shapes/geometry.ts';
import type { Stroke, StrokeParticipation } from '#trace/generate.ts';
import {
  analyzeStrokeRedirects,
  type RedirectAnalysisResult,
} from './redirect.ts';
import type {
  FingerDirection,
  FingerTransition,
  HandTransition,
} from './transition.ts';
import type { ChainInterpretation, Hand } from './chain.ts';

export type RollDirection = Exclude<FingerDirection, 'same'>;

/**
 * 3 Stroke以上のmaximal pure roll。
 * 範囲のsource of truthはStroke index half-openだけにし、
 * Transition範囲を重複保存しない。
 */
export interface RollElement {
  readonly chainIndex: number;
  readonly startStrokeIndex: number;
  readonly endStrokeIndex: number;
  readonly direction: RollDirection;
}

/**
 * LongRollに包含されない独立した2 Stroke directional roll。
 * LongRoll ∩ TwoRoll = ∅ をstructural contractとする。
 */
export interface TwoRoll {
  readonly chainIndex: number;
  readonly startStrokeIndex: number;
  readonly endStrokeIndex: number;
  readonly direction: RollDirection;
}

export interface RollAnalysisResult extends RedirectAnalysisResult {
  readonly longRolls: readonly RollElement[];
  readonly twoRolls: readonly TwoRoll[];
}

function handOf(finger: Finger): Hand {
  return finger.startsWith('L') ? 'left' : 'right';
}

function participationForFinger(
  stroke: Stroke,
  hand: Hand,
  finger: Finger,
): StrokeParticipation | undefined {
  return stroke.participations.find(
    (participation) => participation.hand === hand && participation.finger === finger,
  );
}

/**
 * LongRoll / TwoRollで共通して使うStroke eligibility。
 *
 * - target handは1 Pressだけ
 * - そのPressはnormalized semantic上 output roleを持つ
 * - opposite handの新規trigger activationが同一Strokeにあればpure rollから除外
 *
 * held-triggerだけでは除外しない。holdPhase=start/releaseの未決事項もここで推測しない。
 */
export function isRollEligibleStroke(
  stroke: Stroke,
  hand: Hand,
): boolean {
  const targetPresses = stroke.presses.filter((press) => handOf(press.finger) === hand);
  if (targetPresses.length !== 1) return false;

  const targetParticipation = participationForFinger(
    stroke,
    hand,
    targetPresses[0].finger,
  );
  if (!targetParticipation?.roles.includes('output')) return false;

  const oppositeHand = hand === 'left' ? 'right' : 'left';
  if (stroke.participations.some(
    (participation) =>
      participation.hand === oppositeHand
      && participation.roles.includes('trigger'),
  )) return false;

  return true;
}

/**
 * Stroke span [start,end) に対応する同一Chain内Transitionを導出する唯一のhelper。
 * structural/UI/Aggregator/Timing側でoff-by-one変換を再実装しないためexportする。
 */
export function transitionsForStrokeSpan(
  analysis: RedirectAnalysisResult,
  chainIndex: number,
  startStrokeIndex: number,
  endStrokeIndex: number,
): readonly HandTransition[] {
  if (endStrokeIndex <= startStrokeIndex + 1) return Object.freeze([]);
  return Object.freeze(analysis.transitions.filter(
    (transition) =>
      transition.chainIndex === chainIndex
      && transition.fromStrokeIndex >= startStrokeIndex
      && transition.toStrokeIndex < endStrokeIndex,
  ));
}

function pureDirectionalCandidate(
  analysis: RedirectAnalysisResult,
  transition: HandTransition,
): FingerTransition | undefined {
  const fromStroke = analysis.strokes[transition.fromStrokeIndex];
  const toStroke = analysis.strokes[transition.toStrokeIndex];

  if (!isRollEligibleStroke(fromStroke, transition.hand)
    || !isRollEligibleStroke(toStroke, transition.hand)) return undefined;

  // eligibilityがtarget hand 1 Pressを保証するため、candidateも1件だけになる。
  if (transition.candidates.length !== 1) return undefined;
  const candidate = transition.candidates[0];
  if (candidate.fingerDirection === 'same') return undefined;
  return candidate;
}

/** 3 Stroke以上・同一directionのmaximal区間だけをLongRollとして返す。 */
export function buildLongRolls(
  analysis: RedirectAnalysisResult,
): readonly RollElement[] {
  const rolls: RollElement[] = [];

  for (const chain of analysis.chains) {
    const transitions = analysis.transitions.filter(
      (transition) => transition.chainIndex === chain.chainIndex,
    );

    let startStrokeIndex: number | undefined;
    let direction: RollDirection | undefined;
    let lastToStrokeIndex: number | undefined;
    let transitionCount = 0;

    const flush = () => {
      if (
        startStrokeIndex !== undefined
        && lastToStrokeIndex !== undefined
        && direction !== undefined
        && transitionCount >= 2
      ) {
        rolls.push(Object.freeze({
          chainIndex: chain.chainIndex,
          startStrokeIndex,
          endStrokeIndex: lastToStrokeIndex + 1,
          direction,
        }));
      }
      startStrokeIndex = undefined;
      direction = undefined;
      lastToStrokeIndex = undefined;
      transitionCount = 0;
    };

    for (const transition of transitions) {
      const candidate = pureDirectionalCandidate(analysis, transition);
      if (!candidate) {
        flush();
        continue;
      }

      const nextDirection = candidate.fingerDirection as RollDirection;
      const contiguous = lastToStrokeIndex === undefined
        || transition.fromStrokeIndex === lastToStrokeIndex;

      if (
        startStrokeIndex === undefined
        || direction === undefined
        || !contiguous
      ) {
        flush();
        startStrokeIndex = transition.fromStrokeIndex;
        direction = nextDirection;
        lastToStrokeIndex = transition.toStrokeIndex;
        transitionCount = 1;
        continue;
      }

      if (direction !== nextDirection) {
        flush();
        startStrokeIndex = transition.fromStrokeIndex;
        direction = nextDirection;
        lastToStrokeIndex = transition.toStrokeIndex;
        transitionCount = 1;
        continue;
      }

      lastToStrokeIndex = transition.toStrokeIndex;
      transitionCount++;
    }

    flush();
  }

  return Object.freeze(rolls);
}

function transitionCoveredByLongRoll(
  transition: HandTransition,
  longRolls: readonly RollElement[],
): boolean {
  return longRolls.some(
    (roll) =>
      roll.chainIndex === transition.chainIndex
      && roll.startStrokeIndex <= transition.fromStrokeIndex
      && transition.toStrokeIndex < roll.endStrokeIndex,
  );
}

/**
 * LongRollに含まれない2 Stroke directional pairだけをTwoRollにする。
 *
 * Redirect pivotの除外はend側だけ。start側pivotは意図的に許容する。
 * この非対称は#200 §8のstructural classification contract。
 */
export function buildTwoRolls(
  analysis: RedirectAnalysisResult,
  longRolls: readonly RollElement[],
): readonly TwoRoll[] {
  const redirectPivots = new Set(
    analysis.redirects.map(
      (redirect) => `${redirect.chainIndex}:${redirect.pivotStrokeIndex}`,
    ),
  );

  const rolls: TwoRoll[] = [];
  for (const transition of analysis.transitions) {
    const candidate = pureDirectionalCandidate(analysis, transition);
    if (!candidate) continue;
    if (transitionCoveredByLongRoll(transition, longRolls)) continue;
    if (redirectPivots.has(
      `${transition.chainIndex}:${transition.toStrokeIndex}`,
    )) continue;

    rolls.push(Object.freeze({
      chainIndex: transition.chainIndex,
      startStrokeIndex: transition.fromStrokeIndex,
      endStrokeIndex: transition.toStrokeIndex + 1,
      direction: candidate.fingerDirection as RollDirection,
    }));
  }

  return Object.freeze(rolls);
}

export function analyzeRolls(
  redirectAnalysis: RedirectAnalysisResult,
): RollAnalysisResult {
  const longRolls = buildLongRolls(redirectAnalysis);
  const twoRolls = buildTwoRolls(redirectAnalysis, longRolls);

  return Object.freeze({
    ...redirectAnalysis,
    longRolls,
    twoRolls,
  });
}

/** 呼び出し側向けの合成入口。 */
export function analyzeStrokeRolls(
  strokes: readonly Stroke[],
  policy?: ChainInterpretation,
): RollAnalysisResult {
  return analyzeRolls(analyzeStrokeRedirects(strokes, policy));
}
