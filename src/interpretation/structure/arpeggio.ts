import { isThumb } from './geometry.ts';
import type { Stroke } from './evaluate.ts';
import type { ChainPolicy, Hand } from './analysis-chain.ts';
import type { HandTransition } from './analysis-transition.ts';
import type { RedirectEvent } from './analysis-redirect.ts';
import {
  analyzeStrokeRolls,
  isRollEligibleStroke,
  transitionsForStrokeSpan,
  type RollAnalysisResult,
  type RollDirection,
} from './analysis-roll.ts';

export interface ArpeggioPolicy {
  readonly includeThumb: boolean;
  readonly bridgeSameFinger: boolean;
  readonly includeSingleRedirectTail: boolean;
}

export const DEFAULT_ARPEGGIO_POLICY: ArpeggioPolicy = {
  includeThumb: false,
  bridgeSameFinger: false,
  includeSingleRedirectTail: false,
};

export function sameArpeggioPolicy(
  left: ArpeggioPolicy,
  right: ArpeggioPolicy,
): boolean {
  return left.includeThumb === right.includeThumb
    && left.bridgeSameFinger === right.bridgeSameFinger
    && left.includeSingleRedirectTail === right.includeSingleRedirectTail;
}

export type ArpeggioExtension =
  | 'same-finger-bridge'
  | 'single-redirect-tail';

export interface ArpeggioSpan {
  readonly startStrokeIndex: number;
  readonly endStrokeIndex: number;
  readonly hand: Hand;
  readonly coreKind: 'roll' | 'two-roll';
  readonly direction: RollDirection;
  readonly extensions: readonly ArpeggioExtension[];
}

export interface ArpeggioAnalysisResult extends RollAnalysisResult {
  readonly arpeggioPolicy: Readonly<ArpeggioPolicy>;
  readonly arpeggioSpans: readonly ArpeggioSpan[];
}

interface SpanSeed extends ArpeggioSpan {
  readonly chainIndex: number;
}

function chainHand(
  analysis: RollAnalysisResult,
  chainIndex: number,
): Hand {
  const chain = analysis.chains.find((candidate) => candidate.chainIndex === chainIndex);
  if (!chain) throw new Error(`Unknown chainIndex: ${chainIndex}`);
  return chain.hand;
}

function spanHasThumb(
  analysis: RollAnalysisResult,
  chainIndex: number,
  startStrokeIndex: number,
  endStrokeIndex: number,
): boolean {
  return transitionsForStrokeSpan(
    analysis,
    chainIndex,
    startStrokeIndex,
    endStrokeIndex,
  ).some((transition) => transition.candidates.some(
    (candidate) => isThumb(candidate.fromFinger) || isThumb(candidate.toFinger),
  ));
}

function coreSeeds(
  analysis: RollAnalysisResult,
  policy: ArpeggioPolicy,
): readonly SpanSeed[] {
  const seeds: SpanSeed[] = [];

  for (const roll of analysis.longRolls) {
    if (!policy.includeThumb && spanHasThumb(
      analysis,
      roll.chainIndex,
      roll.startStrokeIndex,
      roll.endStrokeIndex,
    )) continue;
    seeds.push({
      chainIndex: roll.chainIndex,
      startStrokeIndex: roll.startStrokeIndex,
      endStrokeIndex: roll.endStrokeIndex,
      hand: chainHand(analysis, roll.chainIndex),
      coreKind: 'roll',
      direction: roll.direction,
      extensions: [],
    });
  }

  for (const roll of analysis.twoRolls) {
    if (!policy.includeThumb && spanHasThumb(
      analysis,
      roll.chainIndex,
      roll.startStrokeIndex,
      roll.endStrokeIndex,
    )) continue;
    seeds.push({
      chainIndex: roll.chainIndex,
      startStrokeIndex: roll.startStrokeIndex,
      endStrokeIndex: roll.endStrokeIndex,
      hand: chainHand(analysis, roll.chainIndex),
      coreKind: 'two-roll',
      direction: roll.direction,
      extensions: [],
    });
  }

  return Object.freeze(seeds);
}

/**
 * bridgeSameFingerでSpanをmaximal化する時に使えるTransition direction。
 *
 * Roll eligibilityを満たす単一candidateだけを使い、includeThumb=falseなら
 * 親指Transitionを拡張経路にも入れない。sameは中立、同方向は継続として扱う。
 */
function bridgeTransitionDirection(
  analysis: RollAnalysisResult,
  transition: HandTransition,
  policy: ArpeggioPolicy,
): 'same' | RollDirection | undefined {
  const fromStroke = analysis.strokes[transition.fromStrokeIndex];
  const toStroke = analysis.strokes[transition.toStrokeIndex];
  if (!isRollEligibleStroke(fromStroke, transition.hand)
    || !isRollEligibleStroke(toStroke, transition.hand)) return undefined;
  if (transition.candidates.length !== 1) return undefined;

  const candidate = transition.candidates[0];
  if (!policy.includeThumb
    && (isThumb(candidate.fromFinger) || isThumb(candidate.toFinger))) return undefined;
  return candidate.fingerDirection;
}

function transitionEndingAt(
  analysis: RollAnalysisResult,
  chainIndex: number,
  strokeIndex: number,
): HandTransition | undefined {
  return analysis.transitions.find(
    (transition) =>
      transition.chainIndex === chainIndex
      && transition.toStrokeIndex === strokeIndex,
  );
}

function transitionStartingAt(
  analysis: RollAnalysisResult,
  chainIndex: number,
  strokeIndex: number,
): HandTransition | undefined {
  return analysis.transitions.find(
    (transition) =>
      transition.chainIndex === chainIndex
      && transition.fromStrokeIndex === strokeIndex,
  );
}

function expandSeedForBridge(
  analysis: RollAnalysisResult,
  seed: SpanSeed,
  policy: ArpeggioPolicy,
): SpanSeed {
  let startStrokeIndex = seed.startStrokeIndex;
  let endStrokeIndex = seed.endStrokeIndex;
  let changed = false;
  let sawSame = false;

  while (true) {
    const transition = transitionEndingAt(
      analysis,
      seed.chainIndex,
      startStrokeIndex,
    );
    if (!transition) break;
    const direction = bridgeTransitionDirection(analysis, transition, policy);
    if (direction !== 'same' && direction !== seed.direction) break;
    if (direction === 'same') sawSame = true;
    startStrokeIndex = transition.fromStrokeIndex;
    changed = true;
  }

  while (true) {
    const transition = transitionStartingAt(
      analysis,
      seed.chainIndex,
      endStrokeIndex - 1,
    );
    if (!transition) break;
    const direction = bridgeTransitionDirection(analysis, transition, policy);
    if (direction !== 'same' && direction !== seed.direction) break;
    if (direction === 'same') sawSame = true;
    endStrokeIndex = transition.toStrokeIndex + 1;
    changed = true;
  }

  return {
    ...seed,
    startStrokeIndex,
    endStrokeIndex,
    extensions: changed && sawSame ? ['same-finger-bridge'] : [],
  };
}

function extensionsUnion(
  left: readonly ArpeggioExtension[],
  right: readonly ArpeggioExtension[],
): readonly ArpeggioExtension[] {
  return [...new Set([...left, ...right])];
}

/**
 * sameで拡張されたcoreが重なった場合だけ1つのmaximal Spanへ正規化する。
 * adjacentな別Spanはmergeしない。
 */
function normalizeBridgedSeeds(
  seeds: readonly SpanSeed[],
): readonly SpanSeed[] {
  const groups = new Map<string, SpanSeed[]>();
  for (const seed of seeds) {
    const key = `${seed.chainIndex}:${seed.direction}`;
    const group = groups.get(key) ?? [];
    group.push(seed);
    groups.set(key, group);
  }

  const normalized: SpanSeed[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort(
      (left, right) =>
        left.startStrokeIndex - right.startStrokeIndex
        || left.endStrokeIndex - right.endStrokeIndex,
    );

    let current: SpanSeed | undefined;
    for (const seed of sorted) {
      if (!current) {
        current = seed;
        continue;
      }

      // overlapだけをmergeする。end === start のadjacent Spanは別のまま。
      if (seed.startStrokeIndex >= current.endStrokeIndex) {
        normalized.push(current);
        current = seed;
        continue;
      }

      current = {
        ...current,
        startStrokeIndex: Math.min(current.startStrokeIndex, seed.startStrokeIndex),
        endStrokeIndex: Math.max(current.endStrokeIndex, seed.endStrokeIndex),
        coreKind: current.coreKind === 'roll' || seed.coreKind === 'roll'
          ? 'roll'
          : 'two-roll',
        extensions: extensionsUnion(
          extensionsUnion(current.extensions, seed.extensions),
          ['same-finger-bridge'],
        ),
      };
    }
    if (current) normalized.push(current);
  }

  return Object.freeze(normalized.sort(
    (left, right) =>
      left.startStrokeIndex - right.startStrokeIndex
      || left.endStrokeIndex - right.endStrokeIndex
      || left.hand.localeCompare(right.hand)
      || left.direction.localeCompare(right.direction),
  ));
}

function applySameFingerBridge(
  analysis: RollAnalysisResult,
  seeds: readonly SpanSeed[],
  policy: ArpeggioPolicy,
): readonly SpanSeed[] {
  if (!policy.bridgeSameFinger) return Object.freeze([...seeds]);
  return normalizeBridgedSeeds(
    seeds.map((seed) => expandSeedForBridge(analysis, seed, policy)),
  );
}

function redirectTailFor(
  analysis: RollAnalysisResult,
  seed: SpanSeed,
): { redirect: RedirectEvent; endStrokeIndex: number } | undefined {
  const pivotStrokeIndex = seed.endStrokeIndex - 1;
  const redirect = analysis.redirects.find(
    (candidate) =>
      candidate.chainIndex === seed.chainIndex
      && candidate.pivotStrokeIndex === pivotStrokeIndex,
  );
  if (!redirect) return undefined;

  const before = analysis.transitions[redirect.beforeTransitionIndex];
  const after = analysis.transitions[redirect.afterTransitionIndex];
  if (!before || !after) return undefined;
  if (before.fromStrokeIndex < seed.startStrokeIndex
    || before.toStrokeIndex !== pivotStrokeIndex
    || after.fromStrokeIndex !== pivotStrokeIndex
    || after.toStrokeIndex !== seed.endStrokeIndex) return undefined;

  const candidateMatches = redirect.candidates.some((candidate) => {
    const beforeCandidate = before.candidates[candidate.beforeCandidateIndex];
    const afterCandidate = after.candidates[candidate.afterCandidateIndex];
    return beforeCandidate?.fingerDirection === seed.direction
      && afterCandidate?.fingerDirection !== 'same'
      && afterCandidate?.fingerDirection !== seed.direction;
  });
  if (!candidateMatches) return undefined;

  return {
    redirect,
    endStrokeIndex: after.toStrokeIndex + 1,
  };
}

function applyRedirectTail(
  analysis: RollAnalysisResult,
  seeds: readonly SpanSeed[],
  enabled: boolean,
): readonly SpanSeed[] {
  if (!enabled) return Object.freeze([...seeds]);

  return Object.freeze(seeds.map((seed) => {
    const tail = redirectTailFor(analysis, seed);
    if (!tail) return seed;
    return {
      ...seed,
      endStrokeIndex: tail.endStrokeIndex,
      extensions: extensionsUnion(seed.extensions, ['single-redirect-tail']),
    };
  }));
}

function dedupeFinalSpans(
  seeds: readonly SpanSeed[],
): readonly ArpeggioSpan[] {
  const map = new Map<string, SpanSeed>();

  for (const seed of seeds) {
    const key = [
      seed.startStrokeIndex,
      seed.endStrokeIndex,
      seed.hand,
      seed.direction,
    ].join(':');
    const existing = map.get(key);
    if (!existing) {
      map.set(key, seed);
      continue;
    }
    map.set(key, {
      ...existing,
      coreKind: existing.coreKind === 'roll' || seed.coreKind === 'roll'
        ? 'roll'
        : 'two-roll',
      extensions: extensionsUnion(existing.extensions, seed.extensions),
    });
  }

  return Object.freeze(
    [...map.values()]
      .sort(
        (left, right) =>
          left.startStrokeIndex - right.startStrokeIndex
          || left.endStrokeIndex - right.endStrokeIndex
          || left.hand.localeCompare(right.hand)
          || left.direction.localeCompare(right.direction),
      )
      .map((seed) => Object.freeze({
        startStrokeIndex: seed.startStrokeIndex,
        endStrokeIndex: seed.endStrokeIndex,
        hand: seed.hand,
        coreKind: seed.coreKind,
        direction: seed.direction,
        extensions: Object.freeze([...seed.extensions]),
      })),
  );
}

export function buildArpeggioSpans(
  analysis: RollAnalysisResult,
  policy: ArpeggioPolicy = DEFAULT_ARPEGGIO_POLICY,
): readonly ArpeggioSpan[] {
  const seeds = coreSeeds(analysis, policy);
  const bridged = applySameFingerBridge(analysis, seeds, policy);
  const tailed = applyRedirectTail(
    analysis,
    bridged,
    policy.includeSingleRedirectTail,
  );
  return dedupeFinalSpans(tailed);
}

export function analyzeArpeggios(
  rollAnalysis: RollAnalysisResult,
  policy: ArpeggioPolicy = DEFAULT_ARPEGGIO_POLICY,
): ArpeggioAnalysisResult {
  const arpeggioPolicy = Object.freeze({ ...policy });
  const arpeggioSpans = buildArpeggioSpans(rollAnalysis, arpeggioPolicy);
  return Object.freeze({
    ...rollAnalysis,
    arpeggioPolicy,
    arpeggioSpans,
  });
}

export function analyzeStrokeArpeggios(
  strokes: readonly Stroke[],
  chainPolicy?: ChainPolicy,
  arpeggioPolicy: ArpeggioPolicy = DEFAULT_ARPEGGIO_POLICY,
): ArpeggioAnalysisResult {
  return analyzeArpeggios(
    analyzeStrokeRolls(strokes, chainPolicy),
    arpeggioPolicy,
  );
}
