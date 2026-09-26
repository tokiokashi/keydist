import type { Stroke } from '#trace/evaluate.ts';
import type { ChainPolicy } from './chain.ts';
import {
  analyzeStrokeArpeggios,
  type ArpeggioAnalysisResult,
  type ArpeggioPolicy,
} from './arpeggio.ts';
import type { FingerDirection, HandTransition } from './transition.ts';
import {
  DEFAULT_ACTION_REALIZATION_POLICY,
  DEFAULT_TRIGGER_REALIZATION_POLICY,
  type ActionRealizationPolicy,
  type TriggerRealizationPolicy,
} from '#input/semantics/index.ts';

export interface StrokeAnnotation {
  readonly inLongRoll: boolean;
  readonly inTwoRoll: boolean;
  readonly inArpeggio: boolean;
  readonly inRedirect: boolean;
  readonly inSfb: boolean;
}

export interface CoverageMetric {
  /** unionしたStroke数。raw Event/Span数とは別物。 */
  readonly strokes: number;
  /** 全Strokeを分母にしたcoverage。Stroke 0件なら0。 */
  readonly rate: number;
}

export interface ArpeggioAggregate {
  /** overlapしていてもraw Spanをそのまま数える。 */
  readonly spans: number;
  readonly meanSpanLength: number;
  readonly coverage: CoverageMetric;
}

export interface RollAggregate {
  readonly longRoll: CoverageMetric;
  readonly twoRoll: CoverageMetric;
  readonly anyRoll: CoverageMetric;
}

export interface DirectionalTransitionAggregate {
  /** HandTransitionを基準単位にする。candidate数では増えない。 */
  readonly total: number;
  readonly inward: number;
  readonly outward: number;
  readonly same: number;
  /** 1 Transition内に複数direction candidateが共存する場合。 */
  readonly mixed: number;
  /** candidateを持たないTransition。 */
  readonly empty: number;
}

export interface RedirectAggregate {
  readonly events: number;
  readonly pivots: CoverageMetric;
}

export interface SfbAggregate {
  readonly events: number;
  readonly involvedStrokes: CoverageMetric;
}

export interface StructuralConditionSnapshot {
  readonly chainPolicy: Readonly<ChainPolicy>;
  readonly arpeggioPolicy: Readonly<ArpeggioPolicy>;
  readonly triggerRealizationPolicy: Readonly<TriggerRealizationPolicy>;
  readonly actionRealizationPolicy: Readonly<ActionRealizationPolicy>;
}

export interface StructuralAggregate {
  readonly strokeCount: number;
  readonly arpeggio: ArpeggioAggregate;
  readonly roll: RollAggregate;
  readonly directionalTransitions: DirectionalTransitionAggregate;
  readonly redirect: RedirectAggregate;
  readonly sfb: SfbAggregate;
  /** 集計値を生成した解決済みPolicyのsnapshot。UI stateを後から参照しない。 */
  readonly conditions: StructuralConditionSnapshot;
}

export interface AggregatedAnalysisResult extends ArpeggioAnalysisResult {
  readonly annotations: readonly StrokeAnnotation[];
  readonly aggregate: StructuralAggregate;
}

const emptyAnnotation = (): StrokeAnnotation => ({
  inLongRoll: false,
  inTwoRoll: false,
  inArpeggio: false,
  inRedirect: false,
  inSfb: false,
});

function annotateRange(
  annotations: StrokeAnnotation[],
  start: number,
  end: number,
  key: keyof StrokeAnnotation,
): void {
  const from = Math.max(0, start);
  const to = Math.min(annotations.length, end);
  for (let index = from; index < to; index++) {
    annotations[index] = Object.freeze({
      ...annotations[index],
      [key]: true,
    });
  }
}

function annotateIndex(
  annotations: StrokeAnnotation[],
  index: number,
  key: keyof StrokeAnnotation,
): void {
  annotateRange(annotations, index, index + 1, key);
}

/** Structural factsのunionから非排他的なStrokeAnnotationを派生する。 */
export function buildStrokeAnnotations(
  analysis: ArpeggioAnalysisResult,
): readonly StrokeAnnotation[] {
  const annotations = Array.from(
    { length: analysis.strokes.length },
    () => Object.freeze(emptyAnnotation()),
  );

  for (const roll of analysis.longRolls) {
    annotateRange(
      annotations,
      roll.startStrokeIndex,
      roll.endStrokeIndex,
      'inLongRoll',
    );
  }
  for (const roll of analysis.twoRolls) {
    annotateRange(
      annotations,
      roll.startStrokeIndex,
      roll.endStrokeIndex,
      'inTwoRoll',
    );
  }
  for (const span of analysis.arpeggioSpans) {
    annotateRange(
      annotations,
      span.startStrokeIndex,
      span.endStrokeIndex,
      'inArpeggio',
    );
  }
  for (const redirect of analysis.redirects) {
    annotateIndex(
      annotations,
      redirect.pivotStrokeIndex,
      'inRedirect',
    );
  }
  for (const index of analysis.sfbStrokeIndexes) {
    annotateIndex(annotations, index, 'inSfb');
  }

  return Object.freeze(annotations);
}

function coverage(
  annotations: readonly StrokeAnnotation[],
  predicate: (annotation: StrokeAnnotation) => boolean,
): CoverageMetric {
  const strokes = annotations.reduce(
    (count, annotation) => count + (predicate(annotation) ? 1 : 0),
    0,
  );
  return Object.freeze({
    strokes,
    rate: annotations.length === 0 ? 0 : strokes / annotations.length,
  });
}

function transitionDirection(
  transition: HandTransition,
): FingerDirection | 'mixed' | 'empty' {
  const directions = new Set(
    transition.candidates.map((candidate) => candidate.fingerDirection),
  );
  if (directions.size === 0) return 'empty';
  if (directions.size > 1) return 'mixed';
  return [...directions][0];
}

function directionalTransitionAggregate(
  transitions: readonly HandTransition[],
): DirectionalTransitionAggregate {
  const counts = {
    total: transitions.length,
    inward: 0,
    outward: 0,
    same: 0,
    mixed: 0,
    empty: 0,
  };

  for (const transition of transitions) {
    counts[transitionDirection(transition)]++;
  }

  return Object.freeze(counts);
}

export function aggregateStructuralAnalysis(
  analysis: ArpeggioAnalysisResult,
  annotations: readonly StrokeAnnotation[] = buildStrokeAnnotations(analysis),
  triggerRealizationPolicy: TriggerRealizationPolicy = DEFAULT_TRIGGER_REALIZATION_POLICY,
  actionRealizationPolicy: ActionRealizationPolicy = DEFAULT_ACTION_REALIZATION_POLICY,
): StructuralAggregate {
  const arpeggioLengths = analysis.arpeggioSpans.map(
    (span) => span.endStrokeIndex - span.startStrokeIndex,
  );

  const longRoll = coverage(annotations, (annotation) => annotation.inLongRoll);
  const twoRoll = coverage(annotations, (annotation) => annotation.inTwoRoll);
  const anyRoll = coverage(
    annotations,
    (annotation) => annotation.inLongRoll || annotation.inTwoRoll,
  );

  return Object.freeze({
    strokeCount: analysis.strokes.length,
    arpeggio: Object.freeze({
      spans: analysis.arpeggioSpans.length,
      meanSpanLength: arpeggioLengths.length === 0
        ? 0
        : arpeggioLengths.reduce((sum, length) => sum + length, 0)
          / arpeggioLengths.length,
      coverage: coverage(annotations, (annotation) => annotation.inArpeggio),
    }),
    roll: Object.freeze({
      longRoll,
      twoRoll,
      anyRoll,
    }),
    directionalTransitions: directionalTransitionAggregate(analysis.transitions),
    redirect: Object.freeze({
      events: analysis.redirects.length,
      pivots: coverage(annotations, (annotation) => annotation.inRedirect),
    }),
    sfb: Object.freeze({
      events: analysis.sfbEvents.length,
      involvedStrokes: coverage(annotations, (annotation) => annotation.inSfb),
    }),
    conditions: Object.freeze({
      chainPolicy: Object.freeze({ ...analysis.chainPolicy }),
      arpeggioPolicy: Object.freeze({ ...analysis.arpeggioPolicy }),
      triggerRealizationPolicy: Object.freeze({ ...triggerRealizationPolicy }),
      actionRealizationPolicy: Object.freeze({ ...actionRealizationPolicy }),
    }),
  });
}

export function aggregateAnalysis(
  analysis: ArpeggioAnalysisResult,
  triggerRealizationPolicy: TriggerRealizationPolicy = DEFAULT_TRIGGER_REALIZATION_POLICY,
  actionRealizationPolicy: ActionRealizationPolicy = DEFAULT_ACTION_REALIZATION_POLICY,
): AggregatedAnalysisResult {
  const annotations = buildStrokeAnnotations(analysis);
  const aggregate = aggregateStructuralAnalysis(
    analysis,
    annotations,
    triggerRealizationPolicy,
    actionRealizationPolicy,
  );
  return Object.freeze({
    ...analysis,
    annotations,
    aggregate,
  });
}

export function analyzeStrokeStructure(
  strokes: readonly Stroke[],
  chainPolicy?: ChainPolicy,
  arpeggioPolicy?: ArpeggioPolicy,
  triggerRealizationPolicy: TriggerRealizationPolicy = DEFAULT_TRIGGER_REALIZATION_POLICY,
  actionRealizationPolicy: ActionRealizationPolicy = DEFAULT_ACTION_REALIZATION_POLICY,
): AggregatedAnalysisResult {
  return aggregateAnalysis(
    analyzeStrokeArpeggios(strokes, chainPolicy, arpeggioPolicy),
    triggerRealizationPolicy,
    actionRealizationPolicy,
  );
}
