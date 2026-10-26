import type { Stroke } from '#trace/generate.ts';
import {
  DEFAULT_ACTION_REALIZATION_POLICY,
  DEFAULT_TRIGGER_REALIZATION_POLICY,
  type ActionRealizationPolicy,
  type TriggerRealizationPolicy,
} from '#input/semantics/index.ts';
import type { Hand } from './chain.ts';

/**
 * Hand Rhythm（仕様 §10.7）。左右の手の切り替えと同じ手の継続を、Chainとは別の解析軸として数える。
 *
 * 手は「新しい押下を持つ手」で決める。Raw hand run（`chain.ts`）が保持を続ける層キーの手も参加に入れるのと違い、
 * 押し続けているだけの層キーは打鍵を作らないので、リズムに入れない。Chainの境界（同指・親指だけなど）は使わない。
 */

/** Hand Rhythmが読むStrokeの部分。 */
export type HandRhythmStroke = Pick<Stroke, 'presses' | 'participations'>;

/** 押下する手が、その打鍵でどう参加するか。 */
export type HandPressRole =
  /** その手の押下が、文字を出す役を持つ。 */
  | 'output'
  /** 文字を出す役を持たず、層を操作するキーの役だけを持つ（前置シフトのシフトキーなど）。 */
  | 'trigger-only'
  /** 文字を出す役もトリガーの役も持たない押下だけ。 */
  | 'none';

/** 1つのStrokeで押下を持つ手1つぶんの事実。 */
export interface HandPress {
  readonly hand: Hand;
  readonly role: HandPressRole;
}

/** Strokeを押下する手で分けた種類。 */
export type HandStrokeKind =
  /** 押下する手が1つ。 */
  | 'one-hand'
  /** 押下する手が2つで、どちらも文字を出す。 */
  | 'both-output'
  /** 押下する手が2つで、少なくとも一方が文字を出さない。 */
  | 'both-mixed'
  /** 押下する手が無い。通常は作られない。 */
  | 'none';

export interface HandStrokeFact {
  readonly strokeIndex: number;
  readonly kind: HandStrokeKind;
  /** 押下する手。左手、右手の順。 */
  readonly presses: readonly HandPress[];
  /** 押下を持たず、保持を続けている層キーだけがある手。集計には使わない。 */
  readonly heldHands: readonly Hand[];
  /** `kind` が `one-hand` の時の、その手。 */
  readonly hand?: Hand;
}

/** 隣り合う2つのStrokeの組の種類。 */
export type HandPairKind =
  /** どちらも片手のStrokeで、手が違う。 */
  | 'switch'
  /** どちらも片手のStrokeで、手が同じ。 */
  | 'continue'
  /** 少なくとも一方が両手のStroke。 */
  | 'both-hands'
  /** 少なくとも一方に押下する手が無い。どの組にも数えない。 */
  | 'unclassified';

/** Stroke indexのhalf-open範囲。 */
export interface HandRhythmRun {
  readonly startStrokeIndex: number;
  readonly endStrokeIndex: number;
}

/** 同じ手の連続。1Strokeから数える。 */
export interface SameHandRun extends HandRhythmRun {
  readonly hand: Hand;
}

/** 交互打鍵の連続を数える最小のStroke数。 */
export const ALTERNATION_MIN_STROKES = 3;

export interface HandRhythmAggregate {
  readonly strokeCount: number;
  /** 手の切り替えの組数。 */
  readonly switches: number;
  /** 同じ手の継続の組数。 */
  readonly continuations: number;
  /** 同じ手の継続率（0〜1）。分母は切り替え + 継続の組数。分母が0なら0。 */
  readonly continuationRate: number;
  /** 両手を含む組の数。継続率の分母に入れない。 */
  readonly bothHandPairs: number;
  readonly bothHandStrokes: {
    readonly simultaneous: number;
    readonly mixed: number;
  };
  readonly alternation: {
    readonly runs: number;
    readonly meanLength: number;
    readonly maxLength: number;
    /** 交互打鍵の連続が覆うStroke index数。rateは全Stroke数が分母で、0件なら0。 */
    readonly coverage: { readonly strokes: number; readonly rate: number };
  };
  /** 値に効く2つのPolicyのsnapshot。 */
  readonly conditions: {
    readonly triggerRealizationPolicy: Readonly<TriggerRealizationPolicy>;
    readonly actionRealizationPolicy: Readonly<ActionRealizationPolicy>;
  };
}

export interface HandRhythmResult {
  readonly strokes: readonly HandStrokeFact[];
  /** `strokes.length - 1` 件。`pairs[i]` はStroke `i` と `i + 1` の組。 */
  readonly pairs: readonly HandPairKind[];
  readonly alternatingRuns: readonly HandRhythmRun[];
  readonly sameHandRuns: readonly SameHandRun[];
  readonly aggregate: HandRhythmAggregate;
}

const handOf = (finger: string): Hand => (finger.startsWith('L') ? 'left' : 'right');

/** 1つのStrokeの、押下する手ごとの事実。 */
export function strokeHandFact(stroke: HandRhythmStroke, strokeIndex: number): HandStrokeFact {
  const pressFingers = new Set<string>(stroke.presses.map((press) => press.finger));
  const roleByHand = new Map<Hand, HandPressRole>();
  for (const press of stroke.presses) roleByHand.set(handOf(press.finger), 'none');

  for (const participation of stroke.participations) {
    if (!pressFingers.has(participation.finger)) continue;
    const hand = handOf(participation.finger);
    if (participation.roles.includes('output')) {
      roleByHand.set(hand, 'output');
    } else if (roleByHand.get(hand) === 'none' && (participation.roles.includes('trigger') || participation.roles.includes('held-trigger'))) {
      roleByHand.set(hand, 'trigger-only');
    }
  }

  const presses = (['left', 'right'] as const).flatMap((hand): HandPress[] => {
    const role = roleByHand.get(hand);
    return role === undefined ? [] : [{ hand, role }];
  });
  const pressHands = new Set(presses.map((press) => press.hand));
  const heldHands = (['left', 'right'] as const).filter(
    (hand) => !pressHands.has(hand) && stroke.participations.some((p) => handOf(p.finger) === hand && !pressFingers.has(p.finger)),
  );

  const kind: HandStrokeKind =
    presses.length === 0 ? 'none' : presses.length === 1 ? 'one-hand' : presses.every((press) => press.role === 'output') ? 'both-output' : 'both-mixed';
  return { strokeIndex, kind, presses, heldHands, ...(kind === 'one-hand' ? { hand: presses[0].hand } : {}) };
}

function pairKind(before: HandStrokeFact, after: HandStrokeFact): HandPairKind {
  if (before.kind === 'none' || after.kind === 'none') return 'unclassified';
  if (before.kind !== 'one-hand' || after.kind !== 'one-hand') return 'both-hands';
  return before.hand === after.hand ? 'continue' : 'switch';
}

function alternatingRunsOf(facts: readonly HandStrokeFact[], pairs: readonly HandPairKind[]): HandRhythmRun[] {
  const runs: HandRhythmRun[] = [];
  let start = 0;
  for (let index = 1; index <= facts.length; index++) {
    // 区間は、片手のStrokeが続き、組がすべて切り替えの間だけ伸びる。
    const continues = index < facts.length && facts[index].kind === 'one-hand' && pairs[index - 1] === 'switch';
    if (continues) continue;
    if (facts[start]?.kind === 'one-hand' && index - start >= ALTERNATION_MIN_STROKES) {
      runs.push({ startStrokeIndex: start, endStrokeIndex: index });
    }
    start = index;
  }
  return runs;
}

function sameHandRunsOf(facts: readonly HandStrokeFact[]): SameHandRun[] {
  const runs: SameHandRun[] = [];
  let start = 0;
  for (let index = 1; index <= facts.length; index++) {
    const continues = index < facts.length && facts[index].kind === 'one-hand' && facts[index].hand === facts[start].hand;
    if (continues) continue;
    const { hand } = facts[start];
    if (hand !== undefined) runs.push({ hand, startStrokeIndex: start, endStrokeIndex: index });
    start = index;
  }
  return runs;
}

export function analyzeHandRhythm(
  strokes: readonly HandRhythmStroke[],
  triggerRealizationPolicy: TriggerRealizationPolicy = DEFAULT_TRIGGER_REALIZATION_POLICY,
  actionRealizationPolicy: ActionRealizationPolicy = DEFAULT_ACTION_REALIZATION_POLICY,
): HandRhythmResult {
  const facts = strokes.map((stroke, index) => strokeHandFact(stroke, index));
  const pairs = facts.slice(1).map((fact, index) => pairKind(facts[index], fact));
  const alternatingRuns = alternatingRunsOf(facts, pairs);
  const sameHandRuns = sameHandRunsOf(facts);

  const switches = pairs.filter((pair) => pair === 'switch').length;
  const continuations = pairs.filter((pair) => pair === 'continue').length;
  const lengths = alternatingRuns.map((run) => run.endStrokeIndex - run.startStrokeIndex);
  // 交互打鍵の連続は極大で、隣り合う区間は端のStrokeを共有しないので、長さの和が覆うStroke数になる。
  const covered = lengths.reduce((sum, length) => sum + length, 0);

  const aggregate: HandRhythmAggregate = Object.freeze({
    strokeCount: facts.length,
    switches,
    continuations,
    continuationRate: switches + continuations === 0 ? 0 : continuations / (switches + continuations),
    bothHandPairs: pairs.filter((pair) => pair === 'both-hands').length,
    bothHandStrokes: Object.freeze({
      simultaneous: facts.filter((fact) => fact.kind === 'both-output').length,
      mixed: facts.filter((fact) => fact.kind === 'both-mixed').length,
    }),
    alternation: Object.freeze({
      runs: alternatingRuns.length,
      meanLength: lengths.length === 0 ? 0 : covered / lengths.length,
      maxLength: lengths.reduce((max, length) => Math.max(max, length), 0),
      coverage: Object.freeze({ strokes: covered, rate: facts.length === 0 ? 0 : covered / facts.length }),
    }),
    conditions: Object.freeze({
      triggerRealizationPolicy: Object.freeze({ ...triggerRealizationPolicy }),
      actionRealizationPolicy: Object.freeze({ ...actionRealizationPolicy }),
    }),
  });

  return Object.freeze({ strokes: facts, pairs, alternatingRuns, sameHandRuns, aggregate });
}
