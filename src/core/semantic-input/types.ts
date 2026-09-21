export type PhysicalKeyId = string;

export type Requirement =
  | {
      kind: 'overlap';
      keys: readonly PhysicalKeyId[];
    }
  | {
      kind: 'order';
      before: readonly PhysicalKeyId[];
      after: readonly PhysicalKeyId[];
    };

export type InputCapability = {
  kind: 'while-held';
  keys: readonly PhysicalKeyId[];
};

export type SemanticRole = 'modifier';

export type InputContextRequirement =
  | { kind: 'youon-only' };

export type InputAlternativeOrigin =
  | 'sequence'
  | 'face'
  | 'combo'
  | 'composed';

export type InputClassification =
  | 'composition'
  | 'vocabulary-extension'
  | 'youon-extension'
  | 'hatsuon-extension'
  | 'checked-syllable-extension'
  | 'diphthong-extension';

export interface KeyRole {
  key: PhysicalKeyId;
  role: SemanticRole;
}

export interface FaceMembership {
  faceIndex: number;
  cellKey: PhysicalKeyId;
}

export interface SemanticInput {
  output: string;
  physicalKeys: readonly PhysicalKeyId[];
  requirements: readonly Requirement[];
  capabilities: readonly InputCapability[];
  layerId: string;
  /** authoring intent / analysis classification。activation identityには含めない。 */
  classifications: readonly InputClassification[];
  roles: readonly KeyRole[];
  faceMemberships: readonly FaceMembership[];
}

/**
 * 1つのlogical outputを成立させるcanonical入力列。
 * 配列順自体がSemanticInput間の順序を表す。
 */
export type SemanticInputSequence = readonly SemanticInput[];

export interface BaseParticipationView {
  /** このauthoring viewでoutput側として扱うphysical key。 */
  readonly outputKeys: readonly PhysicalKeyId[];
  /** このauthoring viewでtrigger側として扱うphysical key。 */
  readonly triggerKeys: readonly PhysicalKeyId[];
  /** このviewをwhile-held continuationで選ぶhold group。 */
  readonly holdKeys?: readonly PhysicalKeyId[];
}

/**
 * authoring sourceが定めるdefault/base action grouping。
 * Requirementから推測せず、SemanticInput semanticとは独立に保持する。
 */
export interface BaseActionRealization {
  readonly input: SemanticInput;
  readonly actions: readonly (readonly PhysicalKeyId[])[];
  /**
   * authoring source上でoutput側として扱うphysical key。
   * semantic target roleではなく、Stroke participationを作るdefault realization metadata。
   */
  readonly defaultOutputKeys: readonly PhysicalKeyId[];
  /**
   * authoring source上でtrigger側として扱うphysical key。
   * canonical SemanticInput identityには含めない。outputKeysとの重複を許す。
   */
  readonly defaultTriggerKeys?: readonly PhysicalKeyId[];
  /**
   * authoring source由来のdefault hold group。
   * semantic capabilityそのものではなく、既定realizationでどのwhile-held groupを選ぶかを表す。
   */
  readonly defaultHoldKeys?: readonly PhysicalKeyId[];
  /**
   * reciprocal authoring等で同一SemanticInputに複数のtrigger/output viewがある場合の代替view。
   * default action grouping自体は共有し、participationだけをactive hold groupに応じて切り替える。
   */
  readonly alternateParticipations?: readonly BaseParticipationView[];
}

export type BaseActionRealizationSequence = readonly BaseActionRealization[];


/**
 * 1 logical outputを成立させる具体的なcanonical input path。
 * OR activationをSemanticInput内部へ持ち込まず、path自体を複数保持する。
 */
export interface InputAlternative {
  readonly semanticInputs: SemanticInputSequence;
  readonly baseRealizations: BaseActionRealizationSequence;
  /**
   * physical activation以外のruntime contextに対するpath成立条件。
   * alternative selectionより前にfilterし、条件を満たさないpathはeligibleにしない。
   */
  readonly contextRequirements: readonly InputContextRequirement[];
  /** このpathを生成したtop-level authoring provenance。導出で再構成しない。 */
  readonly origin: InputAlternativeOrigin;
}

/**
 * public shapeはreadonly array。non-empty invariantはCanonicalInputMap validation境界で保証する。
 * builder途中ではmutable empty arrayを許すためtuple型へはしない。
 */
export type InputAlternativeSet = readonly InputAlternative[];
export type CanonicalInputMap = ReadonlyMap<string, InputAlternativeSet>;
