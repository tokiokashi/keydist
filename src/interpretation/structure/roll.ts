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
  const transitions = analysis.transitionsByChain[chainIndex] ?? [];
  const found: HandTransition[] = [];
  for (
    let index = firstTransitionFrom(transitions, startStrokeIndex);
    index < transitions.length && transitions[index].toStrokeIndex < endStrokeIndex;
    index++
  ) found.push(transitions[index]);
  return Object.freeze(found);
}

/**
 * Chain内のTransition（fromStrokeIndex昇順）のうち、fromStrokeIndexが`strokeIndex`以上になる最初の位置。
 * 無ければ長さを返す。
 */
function firstTransitionFrom(
  transitions: readonly HandTransition[],
  strokeIndex: number,
): number {
  let low = 0;
  let high = transitions.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (transitions[middle].fromStrokeIndex < strokeIndex) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Chain内で、`strokeIndex`のStrokeへ入るTransition。無ければundefined。 */
export function transitionEndingAt(
  analysis: RedirectAnalysisResult,
  chainIndex: number,
  strokeIndex: number,
): HandTransition | undefined {
  const transitions = analysis.transitionsByChain[chainIndex];
  if (!transitions) return undefined;
  const index = firstTransitionFrom(transitions, strokeIndex - 1);
  const transition = transitions[index];
  return transition?.toStrokeIndex === strokeIndex ? transition : undefined;
}

/** Chain内で、`strokeIndex`のStrokeから出るTransition。無ければundefined。 */
export function transitionStartingAt(
  analysis: RedirectAnalysisResult,
  chainIndex: number,
  strokeIndex: number,
): HandTransition | undefined {
  const transitions = analysis.transitionsByChain[chainIndex];
  if (!transitions) return undefined;
  const transition = transitions[firstTransitionFrom(transitions, strokeIndex)];
  return transition?.fromStrokeIndex === strokeIndex ? transition : undefined;
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
    const transitions = analysis.transitionsByChain[chain.chainIndex];

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

/** いずれかのLongRollに含まれるTransitionの`transitionIndex`の集合。 */
function transitionIndexesCoveredByLongRolls(
  analysis: RedirectAnalysisResult,
  longRolls: readonly RollElement[],
): ReadonlySet<number> {
  const covered = new Set<number>();
  for (const roll of longRolls) {
    for (const transition of transitionsForStrokeSpan(
      analysis,
      roll.chainIndex,
      roll.startStrokeIndex,
      roll.endStrokeIndex,
    )) covered.add(transition.transitionIndex);
  }
  return covered;
}

/**
 * LongRollに含まれない2 Stroke directional pairだけをTwoRollにする。
 *
 * Redirect pivotの除外はend側だけ。start側pivotは意図的に許容する。
 * この非対称はstructural classification contract（docs/analysis-model.md）。
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

  const coveredByLongRoll = transitionIndexesCoveredByLongRolls(analysis, longRolls);

  const rolls: TwoRoll[] = [];
  for (const transition of analysis.transitions) {
    const candidate = pureDirectionalCandidate(analysis, transition);
    if (!candidate) continue;
    if (coveredByLongRoll.has(transition.transitionIndex)) continue;
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
