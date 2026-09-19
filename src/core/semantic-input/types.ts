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
  roles: readonly KeyRole[];
  faceMemberships: readonly FaceMembership[];
}

/**
 * 1つのlogical outputを成立させるcanonical入力列。
 * 配列順自体がSemanticInput間の順序を表す。
 */
export type SemanticInputSequence = readonly SemanticInput[];
