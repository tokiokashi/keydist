import type { Finger } from '#input/shapes/geometry.ts';
import type { Hand } from './chain.ts';
import { analyzeStrokeTransitions, type FingerTransition, type TransitionAnalysisResult } from './transition.ts';
import type { Stroke } from '#trace/generate.ts';
import type { ChainInterpretation } from './chain.ts';

export interface RedirectCandidate {
  readonly candidateIndex: number;
  readonly beforeCandidateIndex: number;
  readonly afterCandidateIndex: number;
  readonly fromFinger: Finger;
  readonly pivotFinger: Finger;
  readonly toFinger: Finger;
}

/**
 * 3 Stroke window内に方向反転pathが1本以上存在するという局所event。
 * candidate数によらず1 windowにつき最大1件。
 */
export interface RedirectEvent {
  /** 1回のAnalysisResult内で安定するindex。stable IDではない。 */
  readonly redirectIndex: number;
  readonly chainIndex: number;
  readonly hand: Hand;
  readonly pivotStrokeIndex: number;
  readonly beforeTransitionIndex: number;
  readonly afterTransitionIndex: number;
  readonly candidates: readonly RedirectCandidate[];
}

export interface RedirectAnalysisResult extends TransitionAnalysisResult {
  readonly redirects: readonly RedirectEvent[];
}

/**
 * RedirectCandidateのgeometry quality。
 *
 * structural Redirectの成立可否とは独立した派生factで、閾値や良否判定は持たない。
 * horizontalReversalはpivotを境にx方向で実際に引き返した共通量 [u]。
 */
export interface RedirectGeometryQuality {
  readonly candidateIndex: number;
  readonly beforeDx: number;
  readonly afterDx: number;
  readonly horizontalReversal: number;
}

function isDirectional(candidate: FingerTransition): boolean {
  return candidate.fingerDirection !== 'same';
}

function reversesDirection(before: FingerTransition, after: FingerTransition): boolean {
  return isDirectional(before) && isDirectional(after) && before.fingerDirection !== after.fingerDirection;
}

/**
 * before.to と after.from が同じpivot Stroke上の同じPress / participationを指すことを確認する。
 * 別pivot候補の継ぎ接ぎで架空のredirect pathを作らない。
 */
function samePivotParticipation(before: FingerTransition, after: FingerTransition): boolean {
  if (before.toPressIndex !== after.fromPressIndex) return false;
  if (before.toFinger !== after.fromFinger) return false;

  const beforeParticipation = before.toParticipationIndex;
  const afterParticipation = after.fromParticipationIndex;
  if (beforeParticipation !== undefined && afterParticipation !== undefined) {
    return beforeParticipation === afterParticipation;
  }
  return beforeParticipation === afterParticipation;
}

/**
 * 候補とその列を、同じ中身なら同じ値にまとめるための入れ物。
 * 候補はStrokeの位置を持たず、候補の添字と指だけで決まる。同じ組合せは繰り返し現れるので、
 * eventごとに作ると打鍵数に比例して重くなる。作った後に書き換えない値だけを共有する。
 */
interface RedirectCandidatePool {
  readonly candidates: Map<string, RedirectCandidate>;
  readonly lists: Map<string, readonly RedirectCandidate[]>;
}

function redirectCandidates(
  before: TransitionAnalysisResult['transitions'][number],
  after: TransitionAnalysisResult['transitions'][number],
  pool: RedirectCandidatePool,
): readonly RedirectCandidate[] {
  const candidates: RedirectCandidate[] = [];

  for (const beforeCandidate of before.candidates) {
    for (const afterCandidate of after.candidates) {
      if (!samePivotParticipation(beforeCandidate, afterCandidate)) continue;
      if (!reversesDirection(beforeCandidate, afterCandidate)) continue;

      const key = [
        candidates.length,
        beforeCandidate.candidateIndex,
        afterCandidate.candidateIndex,
        beforeCandidate.fromFinger,
        beforeCandidate.toFinger,
        afterCandidate.toFinger,
      ].join('|');
      let candidate = pool.candidates.get(key);
      if (!candidate) {
        candidate = Object.freeze({
          candidateIndex: candidates.length,
          beforeCandidateIndex: beforeCandidate.candidateIndex,
          afterCandidateIndex: afterCandidate.candidateIndex,
          fromFinger: beforeCandidate.fromFinger,
          pivotFinger: beforeCandidate.toFinger,
          toFinger: afterCandidate.toFinger,
        });
        pool.candidates.set(key, candidate);
      }
      candidates.push(candidate);
    }
  }
  if (candidates.length === 0) return NO_REDIRECT_CANDIDATES;

  const listKey = candidates
    .map((candidate) =>
      [candidate.beforeCandidateIndex, candidate.afterCandidateIndex, candidate.fromFinger, candidate.pivotFinger, candidate.toFinger].join('.'),
    )
    .join('|');
  const knownList = pool.lists.get(listKey);
  if (knownList) return knownList;
  const list = Object.freeze(candidates);
  pool.lists.set(listKey, list);
  return list;
}

const NO_REDIRECT_CANDIDATES: readonly RedirectCandidate[] = Object.freeze([]);

/**
 * 同一Analysis Chain内で隣接する2 Transitionを3 Stroke windowとして走査する。
 *
 * Redirectはpure runではなく「実在する反転pathがある」というexistential factなので、
 * pivot Strokeが対象手の複数Pressを含むこと自体では除外しない。
 */
export function buildRedirectEvents(analysis: TransitionAnalysisResult): readonly RedirectEvent[] {
  const events: RedirectEvent[] = [];
  const pool: RedirectCandidatePool = {
    candidates: new Map(),
    lists: new Map(),
  };

  for (const chain of analysis.chains) {
    const transitions = analysis.transitionsByChain[chain.chainIndex];

    for (let index = 0; index + 1 < transitions.length; index++) {
      const before = transitions[index];
      const after = transitions[index + 1];

      // 同じChain内でも将来非連続Transitionが入る拡張に備え、3 Stroke windowを明示検証する。
      if (before.toStrokeIndex !== after.fromStrokeIndex) continue;
      if (before.hand !== after.hand) continue;

      const candidates = redirectCandidates(before, after, pool);
      if (candidates.length === 0) continue;

      events.push(
        Object.freeze({
          redirectIndex: events.length,
          chainIndex: chain.chainIndex,
          hand: chain.hand,
          pivotStrokeIndex: before.toStrokeIndex,
          beforeTransitionIndex: before.transitionIndex,
          afterTransitionIndex: after.transitionIndex,
          candidates,
        }),
      );
    }
  }

  return Object.freeze(events);
}

function transitionCandidate(analysis: TransitionAnalysisResult, transitionIndex: number, candidateIndex: number): FingerTransition {
  const transition = analysis.transitions[transitionIndex];
  const candidate = transition?.candidates.find((entry) => entry.candidateIndex === candidateIndex);
  if (!candidate) {
    throw new Error(`Redirect geometry参照が不正: transition=${transitionIndex}, candidate=${candidateIndex}`);
  }
  return candidate;
}

/**
 * 1 RedirectEventの各candidateについてhorizontal geometry qualityを導出する。
 *
 * finger-direction上のRedirectでもphysical dxが反転しない場合は0。
 * Event単位のmax/min等へ集約せず、candidateごとの値をそのまま返す。
 */
export function redirectGeometryQualities(analysis: TransitionAnalysisResult, event: RedirectEvent): readonly RedirectGeometryQuality[] {
  return Object.freeze(
    event.candidates.map((candidate) => {
      const before = transitionCandidate(analysis, event.beforeTransitionIndex, candidate.beforeCandidateIndex);
      const after = transitionCandidate(analysis, event.afterTransitionIndex, candidate.afterCandidateIndex);
      const horizontalReversal = before.dx * after.dx < 0 ? Math.min(Math.abs(before.dx), Math.abs(after.dx)) : 0;

      return Object.freeze({
        candidateIndex: candidate.candidateIndex,
        beforeDx: before.dx,
        afterDx: after.dx,
        horizontalReversal,
      });
    }),
  );
}

export function analyzeRedirects(transitionAnalysis: TransitionAnalysisResult): RedirectAnalysisResult {
  const redirects = buildRedirectEvents(transitionAnalysis);
  return Object.freeze({
    ...transitionAnalysis,
    redirects,
  });
}

/** 呼び出し側向けの合成入口。 */
export function analyzeStrokeRedirects(strokes: readonly Stroke[], policy?: ChainInterpretation): RedirectAnalysisResult {
  return analyzeRedirects(analyzeStrokeTransitions(strokes, policy));
}
