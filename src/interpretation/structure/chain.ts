import type { Finger } from '#input/shapes/geometry.ts';
import type { Stroke } from '#trace/generate.ts';

export type Hand = 'left' | 'right';

/** Chain境界を決めるPolicy。各条件は独立して適用する。 */
export interface ChainInterpretation {
  breakOnSameFinger: boolean;
  breakOnTriggerOnly: boolean;
  /** 対象手の参加指がすべて親指のStrokeを境界にする。 */
  breakOnThumbOnly: boolean;
  breakOnOppositeHandSimultaneous: boolean;
}

/**
 * 現行UIの既定値
 *   chainIncludeSameFinger = false
 *   chainIncludeLayerKeys = true
 * と同じ意味になるPolicy。
 */
export const DEFAULT_CHAIN_INTERPRETATION: ChainInterpretation = {
  breakOnSameFinger: true,
  breakOnTriggerOnly: false,
  breakOnThumbOnly: true,
  breakOnOppositeHandSimultaneous: false,
};

export function sameChainInterpretation(left: ChainInterpretation, right: ChainInterpretation): boolean {
  return left.breakOnSameFinger === right.breakOnSameFinger
    && left.breakOnTriggerOnly === right.breakOnTriggerOnly
    && left.breakOnThumbOnly === right.breakOnThumbOnly
    && left.breakOnOppositeHandSimultaneous === right.breakOnOppositeHandSimultaneous;
}

/**
 * 正規化Strokeから得られる、1手・1Strokeぶんの参加fact。
 * Chainを切る判断は含めない。
 */
export interface RawHandStep {
  readonly strokeIndex: number;
  readonly hand: Hand;
  readonly participationIndexes: readonly number[];
  /** canonical classificationから導出したcomposition fact。 */
  readonly isComposition: boolean;
  /** 同じ手でこのStrokeにoutputが存在する。 */
  readonly hasOutput: boolean;
  /** 今回新たに操作したtriggerが存在する。held-triggerは含めない。 */
  readonly hasTrigger: boolean;
  readonly hasHeldTrigger: boolean;
  /** 新規triggerだけでoutputを持たないStroke。 */
  readonly triggerOnly: boolean;
  /** この手の参加指がすべて親指。 */
  readonly thumbOnly: boolean;
  /** 親指だけ、かつ新規triggerだけのStroke。#166用のhook。 */
  readonly thumbTriggerOnly: boolean;
  /** 現在Strokeで同指移動(sfb)が起きた。親指もfactとして保持する。 */
  readonly sameFinger: boolean;
  /** 旧chainIncludeSameFingerと同じく、親指を除く同指移動。 */
  readonly nonThumbSameFinger: boolean;
  /** 同じStrokeに逆手のoutputが存在する。 */
  readonly oppositeHandOutput: boolean;
}

export interface RawHandRun {
  readonly hand: Hand;
  /** Stroke indexのhalf-open範囲。 */
  readonly startStrokeIndex: number;
  readonly endStrokeIndex: number;
  readonly steps: readonly RawHandStep[];
}

export interface AnalysisChain {
  /** 1回のAnalysisResult内で安定するindex。stable IDではない。 */
  readonly chainIndex: number;
  readonly rawRunIndex: number;
  readonly hand: Hand;
  /** Stroke indexのhalf-open範囲。 */
  readonly startStrokeIndex: number;
  readonly endStrokeIndex: number;
}

export interface ChainAnalysisResult {
  /**
   * 元Stroke列への参照。結果側へStrokeをコピーしない。
   * 呼び出し側も1回の解析中はimmutableとして扱う契約。
   */
  readonly strokes: readonly Stroke[];
  readonly rawHandRuns: readonly RawHandRun[];
  readonly chains: readonly AnalysisChain[];
  readonly chainInterpretation: Readonly<ChainInterpretation>;
}

function handOf(finger: Finger): Hand {
  return finger.startsWith('L') ? 'left' : 'right';
}

function isThumb(finger: Finger): boolean {
  return finger === 'LT' || finger === 'RT';
}

function opposite(hand: Hand): Hand {
  return hand === 'left' ? 'right' : 'left';
}

function rawStep(strokes: readonly Stroke[], strokeIndex: number, hand: Hand): RawHandStep | undefined {
  const stroke = strokes[strokeIndex];
  const participationIndexes = stroke.participations
    .map((participation, index) => ({ participation, index }))
    .filter(({ participation }) => participation.hand === hand)
    .map(({ index }) => index);
  if (participationIndexes.length === 0) return undefined;

  const participations = participationIndexes.map((index) => stroke.participations[index]);
  const roles = participations.flatMap((participation) => participation.roles);
  const hasOutput = roles.includes('output');
  const hasTrigger = roles.includes('trigger');
  const hasHeldTrigger = roles.includes('held-trigger');
  const thumbOnly = participations.every((participation) => isThumb(participation.finger));
  const sameFinger = stroke.presses.some(
    (press) => handOf(press.finger) === hand && press.sfb,
  );
  const nonThumbSameFinger = stroke.presses.some(
    (press) => handOf(press.finger) === hand && !isThumb(press.finger) && press.sfb,
  );
  const oppositeHandOutput = stroke.participations.some(
    (participation) => participation.hand === opposite(hand) && participation.roles.includes('output'),
  );

  return Object.freeze({
    strokeIndex,
    hand,
    participationIndexes: Object.freeze(participationIndexes),
    isComposition: stroke.classifications.includes('composition'),
    hasOutput,
    hasTrigger,
    hasHeldTrigger,
    triggerOnly: hasTrigger && !hasOutput,
    thumbOnly,
    thumbTriggerOnly: thumbOnly && hasTrigger && !hasOutput,
    sameFinger,
    nonThumbSameFinger,
    oppositeHandOutput,
  });
}

/** Stroke列から、手が連続して参加したというfactだけをRaw hand runへする。 */
export function buildRawHandRuns(strokes: readonly Stroke[]): readonly RawHandRun[] {
  const runs: RawHandRun[] = [];
  for (const hand of ['left', 'right'] as const) {
    let steps: RawHandStep[] = [];
    const flush = () => {
      if (steps.length === 0) return;
      runs.push(Object.freeze({
        hand,
        startStrokeIndex: steps[0].strokeIndex,
        endStrokeIndex: steps[steps.length - 1].strokeIndex + 1,
        steps: Object.freeze(steps),
      }));
      steps = [];
    };

    for (let strokeIndex = 0; strokeIndex < strokes.length; strokeIndex++) {
      const step = rawStep(strokes, strokeIndex, hand);
      if (!step) {
        flush();
        continue;
      }
      steps.push(step);
    }
    flush();
  }

  runs.sort((left, right) =>
    left.startStrokeIndex - right.startStrokeIndex || left.hand.localeCompare(right.hand));
  return Object.freeze(runs);
}

function breaksChain(step: RawHandStep, policy: ChainInterpretation): boolean {
  // same-fingerは旧UI互換のため非親指だけを対象にし、親指onlyは独立Policyで扱う。
  return (policy.breakOnSameFinger && step.nonThumbSameFinger)
    || (policy.breakOnTriggerOnly && step.triggerOnly && !step.isComposition)
    || (policy.breakOnThumbOnly && step.thumbOnly)
    || (policy.breakOnOppositeHandSimultaneous && step.oppositeHandOutput);
}

/**
 * Raw hand runへPolicyを適用する。
 *
 * 境界Strokeは従来のsame-finger / layer-key除外と同じくChain自体には含めない。
 */
export function buildAnalysisChains(
  rawHandRuns: readonly RawHandRun[],
  policy: ChainInterpretation = DEFAULT_CHAIN_INTERPRETATION,
): readonly AnalysisChain[] {
  const chains: AnalysisChain[] = [];

  rawHandRuns.forEach((run, rawRunIndex) => {
    let start: number | undefined;
    const flush = (end: number) => {
      if (start === undefined || start >= end) {
        start = undefined;
        return;
      }
      chains.push(Object.freeze({
        chainIndex: chains.length,
        rawRunIndex,
        hand: run.hand,
        startStrokeIndex: start,
        endStrokeIndex: end,
      }));
      start = undefined;
    };

    for (const step of run.steps) {
      if (breaksChain(step, policy)) {
        flush(step.strokeIndex);
        continue;
      }
      if (start === undefined) start = step.strokeIndex;
    }
    flush(run.endStrokeIndex);
  });

  return Object.freeze(chains);
}

/**
 * 1回の解析結果をimmutableなindex参照として固定する。
 * stable IDは導入せず、StrokeIndex / chainIndexはこのresult内だけで意味を持つ。
 */
export function analyzeChains(
  strokes: readonly Stroke[],
  policy: ChainInterpretation = DEFAULT_CHAIN_INTERPRETATION,
): ChainAnalysisResult {
  const rawHandRuns = buildRawHandRuns(strokes);
  const chainInterpretation = Object.freeze({ ...policy });
  const chains = buildAnalysisChains(rawHandRuns, chainInterpretation);
  return Object.freeze({
    strokes,
    rawHandRuns,
    chains,
    chainInterpretation,
  });
}
