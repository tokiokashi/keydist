import type { Stroke } from '#trace/generate.ts';
import {
  DEFAULT_ACTION_REALIZATION_POLICY,
  DEFAULT_TRIGGER_REALIZATION_POLICY,
  type ActionRealizationPolicy,
  type TriggerRealizationPolicy,
} from '#input/semantics/index.ts';
import { isThumb, type Finger } from '#input/shapes/geometry.ts';
import type { Hand } from './chain.ts';

/**
 * Hand Rhythm（仕様 §10.7）。左右の手の切り替えと同じ手の継続を、Chainとは別の解析軸として数える。
 *
 * 手は「新しい押下を持つ手」で決める。Raw hand run（`chain.ts`）が保持を続ける層キーの手も参加に入れるのと違い、
 * 押し続けているだけの層キーは打鍵を作らないので、リズムに入れない。Chainの境界（同指・親指だけなど）は使わない。
 * 親指以外の押下があるアクションは、親指の押下を手の集合から外す。親指の押下だけのアクションは、親指の手を手の集合にする。
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

/** 1つのStrokeで手の集合に入る手1つぶんの事実。 */
export interface HandPress {
  readonly hand: Hand;
  readonly role: HandPressRole;
}

/** Strokeを押下する手で分けた種類。 */
export type HandStrokeKind =
  /** 手の集合が1つ。 */
  | 'one-hand'
  /** 手の集合が2つで、どちらも文字を出す。 */
  | 'both-output'
  /** 手の集合が2つで、少なくとも一方が文字を出さない。 */
  | 'both-mixed'
  /** 手の集合が空。通常は作られない。 */
  | 'none';

export interface HandStrokeFact {
  readonly strokeIndex: number;
  readonly kind: HandStrokeKind;
  /** 手の集合。左手、右手の順。親指以外の押下がある時は、親指の押下を外した後の手。 */
  readonly presses: readonly HandPress[];
  /** 押下を持たず、保持を続けている層キーだけがある手。集計には使わない。 */
  readonly heldHands: readonly Hand[];
  /** `kind` が `one-hand` の時の、その手。 */
  readonly hand?: Hand;
}

/**
 * 隣り合う2つのStrokeの組。後のStrokeに重み1を持たせ、後のStrokeの手の数で等分する。
 * 手ごとに、前のStrokeの手の集合に入っていれば継続、入っていなければ切り替えに足す。
 */
export interface HandPair {
  /** どちらも手の集合が空でない。偽ならどの数にも入れない。 */
  readonly counted: boolean;
  /** 切り替えに足す重み。`counted` が偽なら0。 */
  readonly switches: number;
  /** 継続に足す重み。`counted` が偽なら0。 */
  readonly continuations: number;
  /** 少なくとも一方が両手のStroke（手の集合が左右の2つ）。 */
  readonly bothHands: boolean;
}

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
  /** 手の切り替えの回数。両手のStrokeを含む組は手ごとに分けるので、0.5刻みの値になりうる。 */
  readonly switches: number;
  /** 同じ手の継続の回数。0.5刻みの値になりうる。 */
  readonly continuations: number;
  /** 同じ手の継続率（0〜1）。分母は切り替え + 継続で、どちらも押下を持つ隣り合う組の数と一致する。分母が0なら0。 */
  readonly continuationRate: number;
  /** 両手を含む組の数。切り替えと継続にも数えている。 */
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
  /** この`Trace`を生成した、Trigger realizationとAction realizationのPolicyのsnapshot。 */
  readonly conditions: {
    readonly triggerRealizationPolicy: Readonly<TriggerRealizationPolicy>;
    readonly actionRealizationPolicy: Readonly<ActionRealizationPolicy>;
  };
}

export interface HandRhythmResult {
  readonly strokes: readonly HandStrokeFact[];
  /** `strokes.length - 1` 件。`pairs[i]` はStroke `i` と `i + 1` の組。 */
  readonly pairs: readonly HandPair[];
  readonly alternatingRuns: readonly HandRhythmRun[];
  readonly sameHandRuns: readonly SameHandRun[];
  readonly aggregate: HandRhythmAggregate;
}

const handOf = (finger: Finger): Hand => (finger.startsWith('L') ? 'left' : 'right');

/** 1つのStrokeの、手の集合に入る手ごとの事実。 */
export function strokeHandFact(stroke: HandRhythmStroke, strokeIndex: number): HandStrokeFact {
  const hasNonThumbPress = stroke.presses.some((press) => !isThumb(press.finger));
  // 親指以外の押下があれば親指を外す。親指の押下だけなら、親指の手を手の集合にする。
  const countedFingers = new Set<Finger>(stroke.presses.filter((press) => !hasNonThumbPress || !isThumb(press.finger)).map((press) => press.finger));
  const roleByHand = new Map<Hand, HandPressRole>();
  for (const finger of countedFingers) roleByHand.set(handOf(finger), 'none');

  for (const participation of stroke.participations) {
    if (!countedFingers.has(participation.finger)) continue;
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
  const pressedHands = new Set(stroke.presses.map((press) => handOf(press.finger)));
  const pressFingers = new Set<Finger>(stroke.presses.map((press) => press.finger));
  const heldHands = (['left', 'right'] as const).filter(
    (hand) => !pressedHands.has(hand) && stroke.participations.some((p) => handOf(p.finger) === hand && !pressFingers.has(p.finger)),
  );

  const kind: HandStrokeKind =
    presses.length === 0 ? 'none' : presses.length === 1 ? 'one-hand' : presses.every((press) => press.role === 'output') ? 'both-output' : 'both-mixed';
  return { strokeIndex, kind, presses, heldHands, ...(kind === 'one-hand' ? { hand: presses[0].hand } : {}) };
}

function pairOf(before: HandStrokeFact, after: HandStrokeFact): HandPair {
  if (before.presses.length === 0 || after.presses.length === 0) return { counted: false, switches: 0, continuations: 0, bothHands: false };
  const previous = new Set(before.presses.map((press) => press.hand));
  const weight = 1 / after.presses.length;
  const continued = after.presses.filter((press) => previous.has(press.hand)).length;
  return {
    counted: true,
    switches: weight * (after.presses.length - continued),
    continuations: weight * continued,
    bothHands: before.presses.length > 1 || after.presses.length > 1,
  };
}

/** 隣り合う2つのStrokeの手の集合が、共通の手を持たない。 */
function isAlternating(before: HandStrokeFact, after: HandStrokeFact): boolean {
  return (
    before.presses.length > 0 && after.presses.length > 0 && !after.presses.some((press) => before.presses.some((other) => other.hand === press.hand))
  );
}

function alternatingRunsOf(facts: readonly HandStrokeFact[]): HandRhythmRun[] {
  const runs: HandRhythmRun[] = [];
  let start = 0;
  for (let index = 1; index <= facts.length; index++) {
    // 区間は、隣り合う組が共通の手を持たない間だけ伸びる。両手のStrokeは、前後のどのStrokeとも共通の手を持つので区間を切る。
    if (index < facts.length && isAlternating(facts[index - 1], facts[index])) continue;
    if (index - start >= ALTERNATION_MIN_STROKES) runs.push({ startStrokeIndex: start, endStrokeIndex: index });
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
  const pairs = facts.slice(1).map((fact, index) => pairOf(facts[index], fact));
  const alternatingRuns = alternatingRunsOf(facts);
  const sameHandRuns = sameHandRunsOf(facts);

  const switches = pairs.reduce((sum, pair) => sum + pair.switches, 0);
  const continuations = pairs.reduce((sum, pair) => sum + pair.continuations, 0);
  const lengths = alternatingRuns.map((run) => run.endStrokeIndex - run.startStrokeIndex);
  // 交互打鍵の連続は極大で、隣り合う区間は端のStrokeを共有しないので、長さの和が覆うStroke数になる。
  const covered = lengths.reduce((sum, length) => sum + length, 0);

  const aggregate: HandRhythmAggregate = Object.freeze({
    strokeCount: facts.length,
    switches,
    continuations,
    continuationRate: switches + continuations === 0 ? 0 : continuations / (switches + continuations),
    bothHandPairs: pairs.filter((pair) => pair.bothHands).length,
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
