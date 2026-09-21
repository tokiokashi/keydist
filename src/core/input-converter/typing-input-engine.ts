import { resolveKeyId } from '../../geometry.ts';
import {
  applyActionRealizationPolicy,
  DEFAULT_ACTION_REALIZATION_POLICY,
  DEFAULT_TRIGGER_REALIZATION_POLICY,
  realizeTriggerActions,
  type ActionRealizationPolicy,
  type CanonicalInputMap,
  type InputAlternative,
  type InputContextRequirement,
  type PhysicalKeyId,
  type RealizedSemanticAction,
  type SemanticInput,
  type TriggerHoldState,
  type TriggerRealizationPolicy,
} from '../semantic-input/index.ts';

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
}

export interface TypingInputResult {
  readonly recognized: readonly RecognizedTypingInput[];
  readonly pressedKeys: readonly PhysicalKeyId[];
}

interface Candidate {
  readonly output: string;
  readonly alternative: InputAlternative;
  readonly input: SemanticInput;
  readonly order: number;
}

const canonicalKeys = (keys: readonly PhysicalKeyId[]): PhysicalKeyId[] =>
  [...new Set(keys.map(resolveKeyId))];

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

/**
 * #270 Input Converter向けのframework-independent最小入力engine。
 *
 * 現段階では1 InputAlternative = 1 SemanticInputのpathを対象にする。
 * browser固有のevent objectやlayout authoring Faceを参照せず、CanonicalInputMapだけを読む。
 *
 * chord候補を持つ単打はkeyupまで保留し、より長いphysical pathが成立すれば
 * そちらを優先する。prefixは同一recognition window内のpress順を保持するため、
 * triggerをreleaseしてからoutput keyを押す入力も成立する。
 */
export class TypingInputEngine {
  readonly #candidates: readonly Candidate[];
  readonly #triggerPolicy: TriggerRealizationPolicy;
  readonly #actionPolicy: ActionRealizationPolicy;
  readonly #contextSatisfied: (
    requirements: readonly InputContextRequirement[],
  ) => boolean;

  readonly #pressed = new Set<PhysicalKeyId>();
  readonly #windowKeys = new Set<PhysicalKeyId>();
  readonly #pressOrder = new Map<PhysicalKeyId, number>();
  readonly #seededHoldKeys = new Set<PhysicalKeyId>();

  #nextOrder = 1;
  #pending: Candidate | undefined;
  #holdState: TriggerHoldState | undefined;

  constructor(
    canonicalInputs: CanonicalInputMap,
    options: TypingInputEngineOptions = {},
  ) {
    const candidates: Candidate[] = [];
    let order = 0;
    for (const [output, alternatives] of canonicalInputs) {
      for (const alternative of alternatives) {
        if (alternative.semanticInputs.length !== 1) continue;
        if (alternative.baseRealizations.length !== 1) continue;
        candidates.push({
          output,
          alternative,
          input: alternative.semanticInputs[0],
          order,
        });
        order += 1;
      }
    }
    this.#candidates = candidates;
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
      if (this.#seededHoldKeys.has(key)) {
        this.#seededHoldKeys.delete(key);
        this.#windowKeys.delete(key);
        this.#pressOrder.delete(key);
        this.#holdState = undefined;
      }

      if (this.#pending?.input.physicalKeys.map(resolveKeyId).includes(key)) {
        recognized.push(this.#commit(this.#pending));
      }

      return this.#result(recognized);
    }

    if (this.#pressed.has(key)) return this.#result(recognized);

    if (this.#pending !== undefined && !this.#canExtendPendingWith(key)) {
      recognized.push(this.#commit(this.#pending));
    }

    this.#pressed.add(key);
    this.#windowKeys.add(key);
    this.#pressOrder.set(key, this.#nextOrder);
    this.#nextOrder += 1;

    const match = this.#bestMatch();
    if (match !== undefined) {
      if (this.#hasPotentialExtension(match)) this.#pending = match;
      else recognized.push(this.#commit(match));
    }

    return this.#result(recognized);
  }

  flush(): TypingInputResult {
    const recognized = this.#pending === undefined
      ? []
      : [this.#commit(this.#pending)];
    return this.#result(recognized);
  }

  reset(): void {
    this.#pressed.clear();
    this.#windowKeys.clear();
    this.#pressOrder.clear();
    this.#seededHoldKeys.clear();
    this.#nextOrder = 1;
    this.#pending = undefined;
    this.#holdState = undefined;
  }

  #result(recognized: readonly RecognizedTypingInput[]): TypingInputResult {
    return {
      recognized,
      pressedKeys: [...this.#pressed],
    };
  }

  #candidateMatches(candidate: Candidate): boolean {
    if (!this.#contextSatisfied(candidate.alternative.contextRequirements)) return false;

    const physical = keySet(candidate.input.physicalKeys);
    if (!isSubset(physical, this.#windowKeys)) return false;
    if (!isSubset(this.#pressed, physical)) return false;

    return candidate.input.requirements.every((requirement) => {
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

  #bestMatch(): Candidate | undefined {
    return this.#candidates
      .filter((candidate) => this.#candidateMatches(candidate))
      .sort((left, right) =>
        right.input.physicalKeys.length - left.input.physicalKeys.length
        || left.order - right.order)[0];
  }

  #hasPotentialExtension(candidate: Candidate): boolean {
    const current = keySet(candidate.input.physicalKeys);
    return this.#candidates.some((other) => {
      if (other === candidate) return false;
      if (!this.#contextSatisfied(other.alternative.contextRequirements)) return false;
      return isStrictSubset(current, keySet(other.input.physicalKeys));
    });
  }

  #canExtendPendingWith(key: PhysicalKeyId): boolean {
    if (this.#pending === undefined) return false;
    const pendingKeys = keySet(this.#pending.input.physicalKeys);
    return this.#candidates.some((candidate) => {
      const candidateKeys = keySet(candidate.input.physicalKeys);
      return isStrictSubset(pendingKeys, candidateKeys)
        && candidateKeys.has(key)
        && this.#contextSatisfied(candidate.alternative.contextRequirements);
    });
  }

  #commit(candidate: Candidate): RecognizedTypingInput {
    const realized = realizeTriggerActions(
      candidate.alternative.baseRealizations,
      this.#triggerPolicy,
      this.#holdState,
    );
    const actions = applyActionRealizationPolicy(realized.actions, this.#actionPolicy);
    this.#holdState = realized.holdState;
    this.#pending = undefined;
    this.#resetRecognitionWindow();

    return {
      output: candidate.output,
      alternative: candidate.alternative,
      actions,
    };
  }

  #resetRecognitionWindow(): void {
    this.#windowKeys.clear();
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
