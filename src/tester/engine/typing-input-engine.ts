import { resolveKeyId } from '#input/shapes/geometry.ts';
import {
  applyActionRealizationPolicy,
  DEFAULT_ACTION_REALIZATION_POLICY,
  DEFAULT_TRIGGER_REALIZATION_POLICY,
  realizeTriggerActions,
  type ActionRealizationPolicy,
  type BaseActionRealization,
  type CanonicalInputMap,
  type InputAlternative,
  type InputContextRequirement,
  type PhysicalKeyId,
  type RealizedSemanticAction,
  type SemanticInput,
  type TriggerHoldState,
  type TriggerRealizationPolicy,
} from '#input/semantics/index.ts';

export interface PhysicalKeyEvent {
  readonly type: 'down' | 'up';
  readonly key: PhysicalKeyId;
}

export interface TypingInputEngineOptions {
  readonly triggerRealizationPolicy?: TriggerRealizationPolicy;
  readonly actionRealizationPolicy?: ActionRealizationPolicy;
  readonly contextSatisfied?: (
    requirements: readonly InputContextRequirement[],
  ) => boolean;
}

export interface RecognizedTypingInput {
  readonly output: string;
  readonly alternative: InputAlternative;
  readonly actions: readonly RealizedSemanticAction[];
  /**
   * このrecognitionが直前に確定済みの文字列を包含するmulti-step pathなら、
   * UIはこのsuffixを削除してからoutputを挿入する。
   */
  readonly replacePreviousText?: string;
}

export interface TypingInputResult {
  readonly recognized: readonly RecognizedTypingInput[];
  readonly pressedKeys: readonly PhysicalKeyId[];
  /**
   * 現在のrecognition windowに残っているphysical key。
   * prefix release後やhold seedも含み、presentationがactive modifier stateを表示するために使える。
   */
  readonly recognitionKeys: readonly PhysicalKeyId[];
}

interface Candidate {
  readonly output: string;
  readonly alternative: InputAlternative;
  readonly operationSignatures: readonly string[];
  readonly order: number;
}

interface StepCandidate {
  readonly candidate: Candidate;
  readonly stepIndex: number;
  readonly input: SemanticInput;
  readonly realization: BaseActionRealization;
  readonly signature: string;
  readonly continuation: boolean;
}

interface RecognitionSegment {
  readonly operationSignatures: readonly string[];
  readonly visibleOutput: string;
  readonly actions: readonly RealizedSemanticAction[];
  readonly holdStateBefore?: TriggerHoldState;
  readonly holdStateAfter?: TriggerHoldState;
}

interface MultiStepMatch {
  readonly candidate: Candidate;
  readonly previousSegments: readonly RecognitionSegment[];
}

interface ReplayWindowKey {
  readonly key: PhysicalKeyId;
  readonly released: boolean;
  readonly order: number;
}

const canonicalKeys = (keys: readonly PhysicalKeyId[]): PhysicalKeyId[] =>
  [...new Set(keys.map(resolveKeyId))];

const sortedCanonicalKeys = (keys: readonly PhysicalKeyId[]): PhysicalKeyId[] =>
  canonicalKeys(keys).sort();

const keySet = (keys: readonly PhysicalKeyId[]): ReadonlySet<PhysicalKeyId> =>
  new Set(canonicalKeys(keys));

const isSubset = (
  subset: ReadonlySet<PhysicalKeyId>,
  superset: ReadonlySet<PhysicalKeyId>,
): boolean => [...subset].every((key) => superset.has(key));

const isStrictSubset = (
  subset: ReadonlySet<PhysicalKeyId>,
  superset: ReadonlySet<PhysicalKeyId>,
): boolean => subset.size < superset.size && isSubset(subset, superset);

const requirementSignature = (input: SemanticInput): string =>
  input.requirements.map((requirement) => {
    if (requirement.kind === 'overlap') {
      return 'overlap:' + sortedCanonicalKeys(requirement.keys).join('\u0000');
    }
    return 'order:'
      + sortedCanonicalKeys(requirement.before).join('\u0000')
      + '>'
      + sortedCanonicalKeys(requirement.after).join('\u0000');
  }).sort().join('\u0001');

/**
 * physical recognizerで区別できるoperation identity。
 * output/classification/capabilityは発火条件ではないためidentityへ含めず、
 * multi-step pathの選択はInputAlternative側で行う。
 */
const operationSignature = (input: SemanticInput): string => [
  sortedCanonicalKeys(input.physicalKeys).join('\u0000'),
  requirementSignature(input),
].join('\u0002');

const sameStrings = (
  left: readonly string[],
  right: readonly string[],
): boolean => left.length === right.length
  && left.every((value, index) => value === right[index]);

/**
 * #270 Input Converter向けframework-independent入力engine。
 *
 * physical eventから1 SemanticInput相当のoperationを認識し、その履歴を
 * InputAlternative.semanticInputs列へ照合する。multi-step pathが後から成立した場合は
 * 既に確定済みのcomponent outputをreplacePreviousTextで置換するため、
 * 単打の即時出力を遅延させずcomposed outputを扱える。
 */
export class TypingInputEngine {
  readonly #candidates: readonly Candidate[];
  readonly #knownPhysicalKeys = new Set<PhysicalKeyId>();
  readonly #maxSequenceLength: number;
  readonly #triggerPolicy: TriggerRealizationPolicy;
  readonly #actionPolicy: ActionRealizationPolicy;
  readonly #contextSatisfied: (
    requirements: readonly InputContextRequirement[],
  ) => boolean;

  readonly #pressed = new Set<PhysicalKeyId>();
  readonly #windowKeys = new Set<PhysicalKeyId>();
  readonly #releasedWindowKeys = new Set<PhysicalKeyId>();
  readonly #pressOrder = new Map<PhysicalKeyId, number>();
  readonly #seededHoldKeys = new Set<PhysicalKeyId>();
  readonly #segments: RecognitionSegment[] = [];

  #nextOrder = 1;
  #pending: StepCandidate | undefined;
  #holdState: TriggerHoldState | undefined;

  constructor(
    canonicalInputs: CanonicalInputMap,
    options: TypingInputEngineOptions = {},
  ) {
    const candidates: Candidate[] = [];
    let order = 0;
    for (const [output, alternatives] of canonicalInputs) {
      for (const alternative of alternatives) {
        if (alternative.semanticInputs.length === 0) continue;
        for (const input of alternative.semanticInputs) {
          for (const rawKey of input.physicalKeys) {
            this.#knownPhysicalKeys.add(resolveKeyId(rawKey));
          }
        }
        if (alternative.semanticInputs.length !== alternative.baseRealizations.length) {
          throw new Error(
            'InputAlternativeのSemanticInput列とBaseActionRealization列の長さが一致しない',
          );
        }
        candidates.push({
          output,
          alternative,
          operationSignatures: alternative.semanticInputs.map(operationSignature),
          order,
        });
        order += 1;
      }
    }
    this.#candidates = candidates;
    this.#maxSequenceLength = Math.max(
      1,
      ...candidates.map((candidate) => candidate.operationSignatures.length),
    );
    this.#triggerPolicy =
      options.triggerRealizationPolicy ?? DEFAULT_TRIGGER_REALIZATION_POLICY;
    this.#actionPolicy =
      options.actionRealizationPolicy ?? DEFAULT_ACTION_REALIZATION_POLICY;
    this.#contextSatisfied = options.contextSatisfied
      ?? ((requirements) => requirements.length === 0);
  }

  handle(event: PhysicalKeyEvent): TypingInputResult {
    const key = resolveKeyId(event.key);
    const recognized: RecognizedTypingInput[] = [];

    if (event.type === 'up') {
      this.#pressed.delete(key);
      if (this.#windowKeys.has(key)) this.#releasedWindowKeys.add(key);
      if (this.#seededHoldKeys.has(key)) {
        this.#seededHoldKeys.delete(key);
        this.#windowKeys.delete(key);
        this.#releasedWindowKeys.delete(key);
        this.#pressOrder.delete(key);
        this.#holdState = undefined;
      }

      if (
        this.#pending?.input.physicalKeys.map(resolveKeyId).includes(key)
        && !this.#hasPotentialExtension(this.#pending)
      ) {
        recognized.push(...this.#commitStep(this.#pending));
      }

      return this.#result(recognized);
    }

    if (this.#pressed.has(key)) return this.#result(recognized);

    if (this.#pending !== undefined && !this.#canExtendPendingWith(key)) {
      recognized.push(...this.#commitStep(this.#pending));
    }

    this.#pressed.add(key);

    if (!this.#knownPhysicalKeys.has(key)) {
      this.#resetRecognitionWindow();
      return this.#result(recognized);
    }

    this.#windowKeys.add(key);
    this.#releasedWindowKeys.delete(key);
    this.#pressOrder.set(key, this.#nextOrder);
    this.#nextOrder += 1;

    const match = this.#bestMatch();
    if (match !== undefined) {
      if (this.#hasPotentialExtension(match)) this.#pending = match;
      else recognized.push(...this.#commitStep(match));
    }

    return this.#result(recognized);
  }

  flush(): TypingInputResult {
    const recognized = this.#pending === undefined
      ? []
      : this.#commitStep(this.#pending);
    this.#segments.length = 0;
    return this.#result(recognized);
  }

  reset(): void {
    this.#pressed.clear();
    this.#windowKeys.clear();
    this.#releasedWindowKeys.clear();
    this.#pressOrder.clear();
    this.#seededHoldKeys.clear();
    this.#segments.length = 0;
    this.#nextOrder = 1;
    this.#pending = undefined;
    this.#holdState = undefined;
  }

  #result(recognized: readonly RecognizedTypingInput[]): TypingInputResult {
    return {
      recognized,
      pressedKeys: [...this.#pressed],
      recognitionKeys: [...this.#windowKeys],
    };
  }

  #eligible(candidate: Candidate): boolean {
    return this.#contextSatisfied(candidate.alternative.contextRequirements);
  }

  #segmentsMatchingSignatures(
    signatures: readonly string[],
  ): readonly RecognitionSegment[] | undefined {
    if (signatures.length === 0) return [];

    const selected: RecognitionSegment[] = [];
    let remaining = signatures.length;
    for (let index = this.#segments.length - 1; index >= 0 && remaining > 0; index -= 1) {
      const segment = this.#segments[index];
      if (segment.operationSignatures.length > remaining) return undefined;
      selected.unshift(segment);
      remaining -= segment.operationSignatures.length;
    }
    if (remaining !== 0) return undefined;

    const flattened = selected.flatMap((segment) => segment.operationSignatures);
    return sameStrings(flattened, signatures) ? selected : undefined;
  }

  #continuationIndex(candidate: Candidate): number | undefined {
    for (
      let length = candidate.operationSignatures.length - 1;
      length >= 1;
      length -= 1
    ) {
      const prefix = candidate.operationSignatures.slice(0, length);
      if (this.#segmentsMatchingSignatures(prefix) !== undefined) return length;
    }
    return undefined;
  }

  #activeStepCandidates(): StepCandidate[] {
    const steps: StepCandidate[] = [];

    for (const candidate of this.#candidates) {
      if (!this.#eligible(candidate)) continue;

      const continuationIndex = this.#continuationIndex(candidate);
      if (continuationIndex !== undefined) {
        steps.push({
          candidate,
          stepIndex: continuationIndex,
          input: candidate.alternative.semanticInputs[continuationIndex],
          realization: candidate.alternative.baseRealizations[continuationIndex],
          signature: candidate.operationSignatures[continuationIndex],
          continuation: true,
        });
      }

      steps.push({
        candidate,
        stepIndex: 0,
        input: candidate.alternative.semanticInputs[0],
        realization: candidate.alternative.baseRealizations[0],
        signature: candidate.operationSignatures[0],
        continuation: false,
      });
    }

    return steps;
  }

  #activeWindowPressed(): ReadonlySet<PhysicalKeyId> {
    return new Set(
      [...this.#pressed].filter((key) => this.#windowKeys.has(key)),
    );
  }

  #stepMatches(step: StepCandidate): boolean {
    const physical = keySet(step.input.physicalKeys);
    if (!isSubset(physical, this.#windowKeys)) return false;
    if (!isSubset(this.#activeWindowPressed(), physical)) return false;

    return step.input.requirements.every((requirement) => {
      if (requirement.kind === 'overlap') {
        return canonicalKeys(requirement.keys).every((key) => this.#pressed.has(key));
      }

      const before = canonicalKeys(requirement.before)
        .map((key) => this.#pressOrder.get(key));
      const after = canonicalKeys(requirement.after)
        .map((key) => this.#pressOrder.get(key));
      if (
        before.some((value) => value === undefined)
        || after.some((value) => value === undefined)
      ) {
        return false;
      }

      return Math.max(...before as number[]) < Math.min(...after as number[]);
    });
  }

  #bestMatch(): StepCandidate | undefined {
    return this.#activeStepCandidates()
      .filter((step) => this.#stepMatches(step))
      .sort((left, right) =>
        right.input.physicalKeys.length - left.input.physicalKeys.length
        || Number(right.continuation) - Number(left.continuation)
        || left.candidate.order - right.candidate.order)[0];
  }

  #stepCanStillMatch(
    step: StepCandidate,
    nextKey?: PhysicalKeyId,
  ): boolean {
    const physical = keySet(step.input.physicalKeys);
    if (!isSubset(this.#windowKeys, physical)) return false;
    if (nextKey !== undefined && !physical.has(nextKey)) return false;

    const active = new Set(this.#activeWindowPressed());
    const order = new Map(this.#pressOrder);
    if (nextKey !== undefined) {
      active.add(nextKey);
      order.set(nextKey, this.#nextOrder);
    }
    if (!isSubset(active, physical)) return false;

    return step.input.requirements.every((requirement) => {
      if (requirement.kind === 'overlap') {
        return canonicalKeys(requirement.keys)
          .every((key) => !this.#releasedWindowKeys.has(key));
      }

      const before = canonicalKeys(requirement.before).map((key) => order.get(key));
      const after = canonicalKeys(requirement.after).map((key) => order.get(key));
      const knownBefore = before.filter((value): value is number => value !== undefined);
      const knownAfter = after.filter((value): value is number => value !== undefined);

      if (knownAfter.length > 0 && knownBefore.length !== before.length) return false;
      if (knownBefore.length === 0 || knownAfter.length === 0) return true;
      return Math.max(...knownBefore) < Math.min(...knownAfter);
    });
  }

  #hasPotentialExtension(step: StepCandidate): boolean {
    const current = keySet(step.input.physicalKeys);
    return this.#activeStepCandidates().some((other) => {
      if (other === step) return false;
      return isStrictSubset(current, keySet(other.input.physicalKeys))
        && this.#stepCanStillMatch(other);
    });
  }

  #canExtendPendingWith(key: PhysicalKeyId): boolean {
    if (this.#pending === undefined) return false;
    const pendingKeys = keySet(this.#pending.input.physicalKeys);
    return this.#activeStepCandidates().some((step) => {
      const candidateKeys = keySet(step.input.physicalKeys);
      return isStrictSubset(pendingKeys, candidateKeys)
        && candidateKeys.has(key)
        && this.#stepCanStillMatch(step, key);
    });
  }

  #singleStepCandidate(signature: string): Candidate | undefined {
    return this.#candidates
      .filter((candidate) =>
        this.#eligible(candidate)
        && candidate.operationSignatures.length === 1
        && candidate.operationSignatures[0] === signature)
      .sort((left, right) => left.order - right.order)[0];
  }

  #completedMultiStepMatch(signature: string): MultiStepMatch | undefined {
    const matches: MultiStepMatch[] = [];

    for (const candidate of this.#candidates) {
      if (!this.#eligible(candidate)) continue;
      if (candidate.operationSignatures.length <= 1) continue;
      if (candidate.operationSignatures.at(-1) !== signature) continue;

      const previousSignatures = candidate.operationSignatures.slice(0, -1);
      const previousSegments = this.#segmentsMatchingSignatures(previousSignatures);
      if (previousSegments === undefined) continue;
      matches.push({ candidate, previousSegments });
    }

    return matches.sort((left, right) =>
      right.candidate.operationSignatures.length
        - left.candidate.operationSignatures.length
      || left.candidate.order - right.candidate.order)[0];
  }

  #hasStandaloneInput(key: PhysicalKeyId): boolean {
    return this.#candidates.some((candidate) => {
      if (!this.#eligible(candidate)) return false;
      if (
        candidate.operationSignatures.length !== 1
        || candidate.alternative.semanticInputs.length !== 1
      ) return false;
      const keys = canonicalKeys(candidate.alternative.semanticInputs[0].physicalKeys);
      return keys.length === 1 && keys[0] === key;
    });
  }

  #unconsumedWindowKeys(
    consumedKeys: readonly PhysicalKeyId[],
  ): ReplayWindowKey[] {
    const consumed = keySet(consumedKeys);
    return [...this.#windowKeys]
      .filter((key) => {
        if (consumed.has(key) || this.#seededHoldKeys.has(key)) return false;
        return !this.#releasedWindowKeys.has(key) || this.#hasStandaloneInput(key);
      })
      .map((key) => ({
        key,
        released: this.#releasedWindowKeys.has(key),
        order: this.#pressOrder.get(key) ?? Number.MAX_SAFE_INTEGER,
      }))
      .sort((left, right) => left.order - right.order);
  }

  /**
   * longest-match待ちのcandidate確定時に同じwindowへ入っていた未消費keyを、
   * 元のpress順で新しいrecognition windowへ戻す。
   *
   * overlap量そのものは推定し直さない。release済みkeyはdown相当の評価後に
   * released状態へ戻すことで、未定義の重なりを単打として失わず、
   * prefix等のrelease後も有効なorder semanticはそのまま延長できる。
   */
  #replayUnconsumedWindowKeys(
    keys: readonly ReplayWindowKey[],
  ): RecognizedTypingInput[] {
    const recognized: RecognizedTypingInput[] = [];

    for (const replay of keys) {
      if (this.#pending !== undefined && !this.#canExtendPendingWith(replay.key)) {
        recognized.push(...this.#commitStep(this.#pending));
      }

      this.#windowKeys.add(replay.key);
      this.#releasedWindowKeys.delete(replay.key);
      this.#pressOrder.set(replay.key, this.#nextOrder);
      this.#nextOrder += 1;

      const match = this.#bestMatch();
      if (match !== undefined) {
        if (this.#hasPotentialExtension(match)) this.#pending = match;
        else recognized.push(...this.#commitStep(match));
      }

      if (!replay.released || !this.#windowKeys.has(replay.key)) continue;

      this.#releasedWindowKeys.add(replay.key);
      if (
        this.#pending?.input.physicalKeys.map(resolveKeyId).includes(replay.key)
        && !this.#hasPotentialExtension(this.#pending)
      ) {
        recognized.push(...this.#commitStep(this.#pending));
      }
    }

    return recognized;
  }

  #realize(
    realizations: readonly BaseActionRealization[],
    previous: TriggerHoldState | undefined,
  ): {
    readonly actions: readonly RealizedSemanticAction[];
    readonly holdState?: TriggerHoldState;
  } {
    const realized = realizeTriggerActions(
      realizations,
      this.#triggerPolicy,
      previous,
    );
    return {
      actions: applyActionRealizationPolicy(realized.actions, this.#actionPolicy),
      ...(realized.holdState === undefined ? {} : { holdState: realized.holdState }),
    };
  }

  #commitStep(step: StepCandidate): RecognizedTypingInput[] {
    const unconsumedWindowKeys = this.#unconsumedWindowKeys(step.input.physicalKeys);
    const holdStateBefore = this.#holdState;
    const provisional = this.#realize([step.realization], holdStateBefore);
    this.#holdState = provisional.holdState;
    this.#pending = undefined;

    const multiStep = this.#completedMultiStepMatch(step.signature);
    if (multiStep !== undefined) {
      const previousSegments = [...multiStep.previousSegments];
      const sequenceHoldStateBefore = previousSegments.length > 0
        ? previousSegments[0].holdStateBefore
        : holdStateBefore;
      const actions = [
        ...previousSegments.flatMap((segment) => segment.actions),
        ...provisional.actions,
      ];

      if (previousSegments.length > 0) {
        this.#segments.splice(
          this.#segments.length - previousSegments.length,
          previousSegments.length,
        );
      }

      const replacePreviousText = previousSegments
        .map((segment) => segment.visibleOutput)
        .join('');
      this.#segments.push({
        operationSignatures: multiStep.candidate.operationSignatures,
        visibleOutput: multiStep.candidate.output,
        actions,
        ...(sequenceHoldStateBefore === undefined
          ? {}
          : { holdStateBefore: sequenceHoldStateBefore }),
        ...(provisional.holdState === undefined
          ? {}
          : { holdStateAfter: provisional.holdState }),
      });
      this.#trimSegments();
      this.#resetRecognitionWindow();

      return [{
        output: multiStep.candidate.output,
        alternative: multiStep.candidate.alternative,
        actions,
        ...(replacePreviousText.length === 0
          ? {}
          : { replacePreviousText }),
      }, ...this.#replayUnconsumedWindowKeys(unconsumedWindowKeys)];
    }

    const direct = this.#singleStepCandidate(step.signature);
    if (direct !== undefined) {
      const realized = this.#realize(
        direct.alternative.baseRealizations,
        holdStateBefore,
      );
      this.#holdState = realized.holdState;
      this.#segments.push({
        operationSignatures: direct.operationSignatures,
        visibleOutput: direct.output,
        actions: realized.actions,
        ...(holdStateBefore === undefined
          ? {}
          : { holdStateBefore }),
        ...(realized.holdState === undefined
          ? {}
          : { holdStateAfter: realized.holdState }),
      });
      this.#trimSegments();
      this.#resetRecognitionWindow();

      return [{
        output: direct.output,
        alternative: direct.alternative,
        actions: realized.actions,
      }, ...this.#replayUnconsumedWindowKeys(unconsumedWindowKeys)];
    }

    this.#segments.push({
      operationSignatures: [step.signature],
      visibleOutput: '',
      actions: provisional.actions,
      ...(holdStateBefore === undefined
        ? {}
        : { holdStateBefore }),
      ...(provisional.holdState === undefined
        ? {}
        : { holdStateAfter: provisional.holdState }),
    });
    this.#trimSegments();
    this.#resetRecognitionWindow();
    return this.#replayUnconsumedWindowKeys(unconsumedWindowKeys);
  }

  #trimSegments(): void {
    const maxHistoryOperations = this.#maxSequenceLength - 1;
    if (maxHistoryOperations <= 0) {
      this.#segments.length = 0;
      return;
    }

    const operationCount = () => this.#segments.reduce(
      (total, segment) => total + segment.operationSignatures.length,
      0,
    );
    while (this.#segments.length > 0 && operationCount() > maxHistoryOperations) {
      this.#segments.shift();
    }
  }

  #resetRecognitionWindow(): void {
    this.#windowKeys.clear();
    this.#releasedWindowKeys.clear();
    this.#pressOrder.clear();
    this.#seededHoldKeys.clear();
    this.#nextOrder = 1;

    const holdKeys = this.#holdState?.keys.map(resolveKeyId) ?? [];
    if (holdKeys.length === 0 || holdKeys.some((key) => !this.#pressed.has(key))) {
      this.#holdState = undefined;
      return;
    }

    for (const key of holdKeys) {
      this.#windowKeys.add(key);
      this.#pressOrder.set(key, 0);
      this.#seededHoldKeys.add(key);
    }
  }
}
