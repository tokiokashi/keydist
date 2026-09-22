import { keyId, resolveKeyId } from '../../geometry.ts';
import { validateBaseActionRealizations } from './realization.ts';
import type { Face } from '../../layouts/types.ts';
import type {
  BaseActionRealizationSequence,
  CanonicalInputMap,
  FaceMembership,
  InputAlternative,
  InputCapability,
  InputAlternativeOrigin,
  InputClassification,
  InputContextRequirement,
  KeyRole,
  PhysicalKeyId,
  Requirement,
  SemanticInput,
  SemanticInputSequence,
} from './types.ts';

interface MutableSemanticInput {
  output: string;
  physicalKeys: PhysicalKeyId[];
  requirements: Requirement[];
  capabilities: InputCapability[];
  aggregationGroupId: string;
    classifications: InputClassification[];
  roles: KeyRole[];
  faceMemberships: FaceMembership[];
}

const compareString = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const sortedUniqueKeys = (keys: readonly string[]): PhysicalKeyId[] =>
  [...new Set(keys.map(resolveKeyId))].sort(compareString);

const requirementSignature = (requirement: Requirement): string => {
  if (requirement.kind === 'overlap') return `overlap:${requirement.keys.join('\u0000')}`;
  return `order:${requirement.before.join('\u0000')}>${requirement.after.join('\u0000')}`;
};

const capabilitySignature = (capability: InputCapability): string =>
  `while-held:${capability.keys.join('\u0000')}`;

const normalizeRequirements = (requirements: readonly Requirement[]): Requirement[] => {
  const unique = new Map<string, Requirement>();
  for (const requirement of requirements) {
    const normalized = requirement.kind === 'overlap'
      ? {
          kind: 'overlap' as const,
          keys: sortedUniqueKeys(requirement.keys),
        }
      : {
          kind: 'order' as const,
          before: sortedUniqueKeys(requirement.before),
          after: sortedUniqueKeys(requirement.after),
        };
    unique.set(requirementSignature(normalized), normalized);
  }
  return [...unique.values()].sort((left, right) => {
    const leftRank = left.kind === 'overlap' ? 0 : 1;
    const rightRank = right.kind === 'overlap' ? 0 : 1;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return compareString(requirementSignature(left), requirementSignature(right));
  });
};

const normalizeCapabilities = (capabilities: readonly InputCapability[]): InputCapability[] => {
  const unique = new Map<string, InputCapability>();
  for (const capability of capabilities) {
    const normalized: InputCapability = {
      kind: 'while-held',
      keys: sortedUniqueKeys(capability.keys),
    };
    unique.set(capabilitySignature(normalized), normalized);
  }
  return [...unique.values()].sort((left, right) =>
    compareString(capabilitySignature(left), capabilitySignature(right)));
};

const normalizeClassifications = (
  classifications: readonly InputClassification[],
): InputClassification[] =>
  [...new Set(classifications)].sort(compareString);

const normalizeContextRequirements = (
  requirements: readonly InputContextRequirement[],
): InputContextRequirement[] => {
  const byKind = new Map(requirements.map((requirement) => [requirement.kind, requirement]));
  return [...byKind.values()].sort((left, right) => compareString(left.kind, right.kind));
};

const normalizeRoles = (roles: readonly KeyRole[]): KeyRole[] => {
  const unique = new Map<string, KeyRole>();
  for (const role of roles) {
    const normalized: KeyRole = {
      key: resolveKeyId(role.key),
      role: role.role,
      ...(role.modifierGroupId === undefined ? {} : { modifierGroupId: role.modifierGroupId }),
    };
    unique.set(
      `${normalized.key}\u0000${normalized.role}\u0000${normalized.modifierGroupId ?? ''}`,
      normalized,
    );
  }
  return [...unique.values()].sort((left, right) =>
    compareString(left.key, right.key)
    || compareString(left.role, right.role)
    || compareString(left.modifierGroupId ?? '', right.modifierGroupId ?? ''));
};

const normalizeMemberships = (memberships: readonly FaceMembership[]): FaceMembership[] => {
  const unique = new Map<string, FaceMembership>();
  for (const membership of memberships) {
    const normalized: FaceMembership = {
      faceIndex: membership.faceIndex,
      cellKey: resolveKeyId(membership.cellKey),
    };
    unique.set(`${normalized.faceIndex}\u0000${normalized.cellKey}`, normalized);
  }
  return [...unique.values()].sort((left, right) =>
    left.faceIndex - right.faceIndex || compareString(left.cellKey, right.cellKey));
};

const requirementSetSignature = (requirements: readonly Requirement[]): string =>
  requirements.map(requirementSignature).join('\u0001');

const activationSignature = (
  requirements: readonly Requirement[],
  capabilities: readonly InputCapability[],
): string => [
  requirementSetSignature(requirements),
  capabilities.map(capabilitySignature).join('\u0001'),
].join('\u0002');

const operationIdentity = (input: Pick<
  SemanticInput,
  'output' | 'physicalKeys' | 'requirements'
>): string => [
  input.physicalKeys.join('\u0000'),
  requirementSetSignature(input.requirements),
  input.output,
].join('\u0003');

const semanticIdentity = (input: Pick<
  SemanticInput,
  'output' | 'physicalKeys' | 'requirements' | 'capabilities'
>): string => [
  input.physicalKeys.join('\u0000'),
  activationSignature(input.requirements, input.capabilities),
  input.output,
].join('\u0003');

const hasOrderCycle = (requirements: readonly Requirement[]): boolean => {
  const edges = new Map<PhysicalKeyId, Set<PhysicalKeyId>>();
  const nodes = new Set<PhysicalKeyId>();

  for (const requirement of requirements) {
    if (requirement.kind !== 'order') continue;
    for (const before of requirement.before) {
      nodes.add(before);
      const outgoing = edges.get(before) ?? new Set<PhysicalKeyId>();
      for (const after of requirement.after) {
        nodes.add(after);
        outgoing.add(after);
      }
      edges.set(before, outgoing);
    }
  }

  const visiting = new Set<PhysicalKeyId>();
  const visited = new Set<PhysicalKeyId>();
  const visit = (key: PhysicalKeyId): boolean => {
    if (visiting.has(key)) return true;
    if (visited.has(key)) return false;
    visiting.add(key);
    for (const next of edges.get(key) ?? []) {
      if (visit(next)) return true;
    }
    visiting.delete(key);
    visited.add(key);
    return false;
  };

  return [...nodes].some(visit);
};

const requirementsMutuallyExclusive = (
  left: readonly Requirement[],
  right: readonly Requirement[],
): boolean => hasOrderCycle([...left, ...right]);

const isSubset = (
  subset: readonly PhysicalKeyId[],
  superset: ReadonlySet<PhysicalKeyId>,
): boolean => subset.every((key) => superset.has(key));

const assertCanonicalInput = (input: Pick<
  SemanticInput,
  'physicalKeys' | 'requirements' | 'capabilities' | 'roles'
>): void => {
  const physicalKeys = new Set(input.physicalKeys);

  for (const requirement of input.requirements) {
    if (requirement.kind === 'overlap') {
      if (requirement.keys.length === 0) {
        throw new Error('overlap Requirementのkeysは非空である必要がある');
      }
      if (!isSubset(requirement.keys, physicalKeys)) {
        throw new Error('RequirementがphysicalKeys外のkeyを参照している');
      }
      continue;
    }

    if (requirement.before.length === 0 || requirement.after.length === 0) {
      throw new Error('order Requirementのbefore / afterは非空である必要がある');
    }
    const before = new Set(requirement.before);
    if (requirement.after.some((key) => before.has(key))) {
      throw new Error('order Requirementのbefore / afterは互いに素である必要がある');
    }
    if (!isSubset(requirement.before, physicalKeys) || !isSubset(requirement.after, physicalKeys)) {
      throw new Error('RequirementがphysicalKeys外のkeyを参照している');
    }
  }

  if (hasOrderCycle(input.requirements)) {
    throw new Error('order Requirement setが循環しており成立不能');
  }

  for (const capability of input.capabilities) {
    if (capability.keys.length === 0) {
      throw new Error('Capabilityのkeysは非空である必要がある');
    }
    if (!isSubset(capability.keys, physicalKeys)) {
      throw new Error('CapabilityがphysicalKeys外のkeyを参照している');
    }
  }

  for (const role of input.roles) {
    if (!physicalKeys.has(role.key)) {
      throw new Error('roleがphysicalKeys外のkeyを参照している');
    }
  }
};

const normalizedAggregationGroupId = (
  face: Face,
  faceIndex: number,
  triggerKeys: readonly PhysicalKeyId[],
): string => {
  if (face.inputRole === 'composition') return 'combo';
  if (triggerKeys.length === 0) return 'single';
  if (face.layer !== undefined) return `layer:${face.layer}`;
  return `face:${faceIndex}`;
};

const faceRequirements = (
  face: Face,
  triggerKeys: readonly PhysicalKeyId[],
  cellKey: PhysicalKeyId,
): Requirement[] => {
  if (triggerKeys.length === 0) return [];

  const physicalKeys = sortedUniqueKeys([...triggerKeys, cellKey]);
  const requirements: Requirement[] = [];

  if (face.mode === 'simultaneous') {
    requirements.push({ kind: 'overlap', keys: physicalKeys });
  }

  const implicitOrder = face.mode === 'prefix' || face.mode === 'suffix'
    ? face.mode
    : undefined;
  if (
    implicitOrder !== undefined
    && face.triggerOrder !== undefined
    && face.triggerOrder !== implicitOrder
  ) {
    throw new Error(
      `Faceのmode=${face.mode}とtriggerOrder=${face.triggerOrder}が矛盾している`,
    );
  }
  const order = face.triggerOrder ?? implicitOrder;
  if (order === 'prefix') {
    requirements.push({
      kind: 'order',
      before: [...triggerKeys],
      after: [cellKey],
    });
  } else if (order === 'suffix') {
    requirements.push({
      kind: 'order',
      before: [cellKey],
      after: [...triggerKeys],
    });
  }

  return normalizeRequirements(requirements);
};

const faceCapabilities = (
  face: Face,
  triggerKeys: readonly PhysicalKeyId[],
): InputCapability[] => {
  if (triggerKeys.length === 0) return [];
  if (face.triggerPersistence === undefined) {
    throw new Error('triggerを持つFaceはtriggerPersistenceを明示する必要がある');
  }
  if (face.triggerPersistence === 'single') return [];
  return normalizeCapabilities([{ kind: 'while-held', keys: [...triggerKeys] }]);
};

const faceClassifications = (face: Face): InputClassification[] =>
  face.inputRole === 'composition' ? ['composition'] : [];

const faceRoles = (
  face: Face,
  triggerKeys: readonly PhysicalKeyId[],
): KeyRole[] => {
  if (face.inputRole === undefined) {
    throw new Error('FaceはinputRoleを明示する必要がある');
  }
  if (face.inputRole !== 'modifier') return [];

  const authoredGroups = face.modifierGroups ?? {};
  const normalizedGroups = new Map<string, string>();
  for (const [rawKey, groupId] of Object.entries(authoredGroups)) {
    if (groupId.length === 0) throw new Error('modifier group idは空にできない');
    const key = resolveKeyId(rawKey);
    if (!triggerKeys.includes(key)) {
      throw new Error(`modifierGroupsがFace.trigger外のkeyを参照している: ${rawKey}`);
    }
    const existing = normalizedGroups.get(key);
    if (existing !== undefined && existing !== groupId) {
      throw new Error(`同一trigger keyに複数modifier groupを指定できない: ${rawKey}`);
    }
    normalizedGroups.set(key, groupId);
  }

  return normalizeRoles(triggerKeys.map((key) => ({
    key,
    role: 'modifier' as const,
    ...(normalizedGroups.get(key) === undefined
      ? {}
      : { modifierGroupId: normalizedGroups.get(key) }),
  })));
};

const faceCells = (face: Face): readonly { key: PhysicalKeyId; output: string }[] => {
  const cells: { key: PhysicalKeyId; output: string }[] = [];
  face.rows.forEach((row, rowIndex) => {
    const outputs = typeof row === 'string' ? [...row] : [...row];
    outputs.forEach((output, columnIndex) => {
      if (output === '' || output === ' ') return;
      cells.push({
        key: resolveKeyId(keyId(rowIndex, columnIndex)),
        output,
      });
    });
  });
  return cells;
};


/**
 * richerなauthoring semanticを持たないlegacy Step列をcanonical入力列へ変換する。
 * Step間の順序は返却配列の順序で表し、Requirement.orderへ重複させない。
 */
export function compileSequenceSemanticInputs(
  output: string,
  sequence: readonly (readonly string[])[],
  aggregationGroupId: string,
  classifications: readonly InputClassification[] = [],
): readonly SemanticInput[] {
  if (sequence.length === 0) {
    throw new Error(`SemanticInput sequence「${output}」は1 step以上必要`);
  }

  return sequence.map((step, stepIndex): SemanticInput => {
    const physicalKeys = sortedUniqueKeys(step);
    if (physicalKeys.length === 0) {
      throw new Error(
        `SemanticInput sequence「${output}」のstep ${stepIndex} は1 key以上必要`,
      );
    }

    const requirements = physicalKeys.length > 1
      ? normalizeRequirements([{ kind: 'overlap', keys: physicalKeys }])
      : [];
    const input: SemanticInput = {
      output: stepIndex === sequence.length - 1 ? output : '',
      physicalKeys,
      requirements,
      capabilities: [],
      aggregationGroupId,
      classifications: normalizeClassifications(classifications),
      roles: [],
      faceMemberships: [],
    };
    assertCanonicalInput(input);
    return input;
  });
}

export interface CompiledSequenceArtifacts {
  readonly semanticInputs: SemanticInputSequence;
  readonly baseActionRealizations: BaseActionRealizationSequence;
}

/**
 * legacy Step authoringをsemanticとdefault/base realizationへ同時にcompileする。
 * action groupingはRequirementから推測せず、source Step境界をそのまま保持する。
 */
export function compileSequenceInputArtifacts(
  output: string,
  sequence: readonly (readonly string[])[],
  aggregationGroupId: string,
  classifications: readonly InputClassification[] = [],
): CompiledSequenceArtifacts {
  const semanticInputs = compileSequenceSemanticInputs(output, sequence, aggregationGroupId, classifications);
  const baseActionRealizations: BaseActionRealizationSequence =
    semanticInputs.map((input, index) => ({
      input,
      actions: [sequence[index].map(resolveKeyId)],
      defaultOutputKeys: [...input.physicalKeys],
    }));
  validateBaseActionRealizations(baseActionRealizations);
  return {
    semanticInputs,
    baseActionRealizations,
  };
}

export function compileFaceSemanticInputs(faces: readonly Face[]): readonly SemanticInput[] {
  const byIdentity = new Map<string, MutableSemanticInput>();
  const inputsByPhysicalKeys = new Map<string, MutableSemanticInput[]>();

  faces.forEach((face, faceIndex) => {
    const cells = faceCells(face);
    if (cells.length > 0 && face.inputRole === undefined) {
      throw new Error(`Face ${faceIndex} はinputRoleを明示する必要がある`);
    }

    const triggerKeys = sortedUniqueKeys(face.trigger);
    if (triggerKeys.length === 0 && face.triggerPersistence !== undefined) {
      throw new Error(`Face ${faceIndex} はtriggerなしでtriggerPersistenceを指定できない`);
    }

    for (const cell of cells) {
      const physicalKeys = sortedUniqueKeys([...triggerKeys, cell.key]);
      const requirements = faceRequirements(face, triggerKeys, cell.key);
      const capabilities = faceCapabilities(face, triggerKeys);
      const classifications = faceClassifications(face);
      const roles = faceRoles(face, triggerKeys);
      const aggregationGroupId = normalizedAggregationGroupId(face, faceIndex, triggerKeys);
      const physicalSignature = physicalKeys.join('\u0000');

      const candidate: MutableSemanticInput = {
        output: cell.output,
        physicalKeys,
        requirements,
        capabilities,
        aggregationGroupId,
        classifications,
        roles,
        faceMemberships: [{ faceIndex, cellKey: cell.key }],
      };
      assertCanonicalInput(candidate);

      const siblings = inputsByPhysicalKeys.get(physicalSignature) ?? [];
      const candidateRequirements = requirementSetSignature(requirements);
      for (const sibling of siblings) {
        const siblingRequirements = requirementSetSignature(sibling.requirements);
        if (siblingRequirements === candidateRequirements) {
          if (sibling.output !== candidate.output) {
            throw new Error(
              `同一physical operationに異なるoutputがある: ${sibling.output} / ${candidate.output}`,
            );
          }
          continue;
        }
        if (sibling.output === candidate.output) {
          // 同一logical outputの別activation pathは上位InputAlternativeでORとして保持する。
          continue;
        }
        if (!requirementsMutuallyExclusive(sibling.requirements, candidate.requirements)) {
          throw new Error(
            `同一physicalKeysに同時成立し得るRequirement setがある: ${physicalKeys.join(', ')}`,
          );
        }
      }

      const identity = operationIdentity(candidate);
      const existing = byIdentity.get(identity);
      if (existing === undefined) {
        byIdentity.set(identity, candidate);
        siblings.push(candidate);
        inputsByPhysicalKeys.set(physicalSignature, siblings);
        continue;
      }
      if (existing.aggregationGroupId !== aggregationGroupId) {
        throw new Error(
          `同一SemanticInputが異なるaggregationGroupIdへ属している: ${existing.aggregationGroupId} / ${aggregationGroupId}`,
        );
      }
      existing.capabilities = normalizeCapabilities([
        ...existing.capabilities,
        ...capabilities,
      ]);
      existing.classifications = normalizeClassifications([
        ...existing.classifications,
        ...classifications,
      ]);
      existing.roles = normalizeRoles([...existing.roles, ...roles]);
      existing.faceMemberships = normalizeMemberships([
        ...existing.faceMemberships,
        ...candidate.faceMemberships,
      ]);
    }
  });

  // presentation-only membershipはactivation / layer attributionを増やさない。
  // 同じphysical operation/outputがrows側ですでにsemanticとして定義済みであることを要求し、
  // presentation provenanceだけを既存SemanticInputへ追加する。
  faces.forEach((face, faceIndex) => {
    if (face.presentationCells === undefined) return;
    const triggerKeys = sortedUniqueKeys(face.trigger);
    const semanticCells = new Map(faceCells(face).map((cell) => [cell.key, cell.output] as const));

    for (const [rawKey, output] of Object.entries(face.presentationCells)) {
      if (output === '' || output === ' ') continue;
      const cellKey = resolveKeyId(rawKey);
      const semanticOutput = semanticCells.get(cellKey);
      if (semanticOutput !== undefined && semanticOutput !== output) {
        throw new Error(
          `Face ${faceIndex} のpresentation cell ${cellKey}がsemantic cellと競合している: ${semanticOutput} / ${output}`,
        );
      }
      const physicalKeys = sortedUniqueKeys([...triggerKeys, cellKey]);
      const requirements = faceRequirements(face, triggerKeys, cellKey);
      const identity = operationIdentity({ output, physicalKeys, requirements });
      const existing = byIdentity.get(identity);
      if (existing === undefined) {
        throw new Error(
          `Face ${faceIndex} のpresentation cell ${cellKey}=${output}に対応するSemanticInputがない`,
        );
      }
      existing.faceMemberships = normalizeMemberships([
        ...existing.faceMemberships,
        { faceIndex, cellKey },
      ]);
    }
  });

  return [...byIdentity.values()]
    .map((input): SemanticInput => ({
      output: input.output,
      physicalKeys: [...input.physicalKeys],
      requirements: normalizeRequirements(input.requirements),
      capabilities: normalizeCapabilities(input.capabilities),
      aggregationGroupId: input.aggregationGroupId,
      classifications: normalizeClassifications(input.classifications),
      roles: normalizeRoles(input.roles),
      faceMemberships: normalizeMemberships(input.faceMemberships),
    }))
    .sort((left, right) => compareString(semanticIdentity(left), semanticIdentity(right)));
}


export function compileSequenceInputAlternative(
  output: string,
  sequence: readonly (readonly PhysicalKeyId[])[],
  aggregationGroupId: string,
  classifications: readonly InputClassification[] = [],
  contextRequirements: readonly InputContextRequirement[] = [],
  origin: InputAlternativeOrigin = 'sequence',
): InputAlternative {
  const artifacts = compileSequenceInputArtifacts(output, sequence, aggregationGroupId, classifications);
  return {
    semanticInputs: artifacts.semanticInputs,
    baseRealizations: artifacts.baseActionRealizations,
    contextRequirements: normalizeContextRequirements(contextRequirements),
    origin,
  };
}


const samePhysicalKeySet = (
  left: readonly PhysicalKeyId[],
  right: readonly PhysicalKeyId[],
): boolean => {
  const l = sortedUniqueKeys(left);
  const r = sortedUniqueKeys(right);
  return l.length === r.length && l.every((key, index) => key === r[index]);
};

/**
 * 2つのconcrete input pathが、現在証明できる範囲で同時成立し得るかを判定する。
 *
 * sequence長違い / prefix relation等のprecedenceはここでは証明しない。
 * Capability / classification / action grouping差はactivation排他の根拠にしない。
 */
const activationPathsCanConflict = (
  left: InputAlternative,
  right: InputAlternative,
): boolean => {
  if (left.semanticInputs.length !== right.semanticInputs.length) return false;

  return left.semanticInputs.every((leftInput, index) => {
    const rightInput = right.semanticInputs[index];
    if (!samePhysicalKeySet(leftInput.physicalKeys, rightInput.physicalKeys)) return false;
    return !requirementsMutuallyExclusive(
      leftInput.requirements,
      rightInput.requirements,
    );
  });
};

/**
 * CanonicalInputMapのkeymap境界invariantを検証する。
 *
 * 異なるlogical outputに対して、同じphysical activation pathまたは
 * 同じphysicalKeys + 両立可能Requirement setを持つpathが共存する場合は曖昧なのでrejectする。
 */
export function validateCanonicalInputMap(inputs: CanonicalInputMap): void {
  for (const [output, alternatives] of inputs) {
    if (alternatives.length === 0) {
      throw new Error(`canonical input「${output}」には1つ以上のalternativeが必要`);
    }
  }

  const paths = [...inputs].flatMap(([output, alternatives]) =>
    alternatives.map((alternative) => ({ output, alternative })));

  for (let leftIndex = 0; leftIndex < paths.length; leftIndex++) {
    const left = paths[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < paths.length; rightIndex++) {
      const right = paths[rightIndex];
      if (left.output === right.output) continue;
      if (!activationPathsCanConflict(left.alternative, right.alternative)) continue;

      throw new Error(
        `異なるlogical outputに同時成立し得るcanonical activation pathがある: `
        + `${left.output} / ${right.output}`,
      );
    }
  }
}


type AlternativeIdentityProjection = {
  mapKey: (key: PhysicalKeyId) => PhysicalKeyId;
  mapKeys: (keys: readonly PhysicalKeyId[]) => readonly PhysicalKeyId[];
  includeFaceMemberships: boolean;
  preserveOptionalParticipationHoldKeys: boolean;
};

function inputAlternativeIdentity(
  alternative: InputAlternative,
  projection: AlternativeIdentityProjection,
): string {
  const {
    mapKey,
    mapKeys,
    includeFaceMemberships,
    preserveOptionalParticipationHoldKeys,
  } = projection;
  return JSON.stringify({
    semanticInputs: alternative.semanticInputs.map((input) => ({
      output: input.output,
      physicalKeys: mapKeys(input.physicalKeys),
      requirements: input.requirements.map((requirement) =>
        requirement.kind === 'overlap'
          ? { kind: 'overlap', keys: mapKeys(requirement.keys) }
          : {
              kind: 'order',
              before: mapKeys(requirement.before),
              after: mapKeys(requirement.after),
            }),
      capabilities: input.capabilities.map((capability) => ({
        kind: capability.kind,
        keys: mapKeys(capability.keys),
      })),
      aggregationGroupId: input.aggregationGroupId,
      classifications: input.classifications,
      roles: input.roles.map((role) => ({
        key: mapKey(role.key),
        role: role.role,
        ...(role.modifierGroupId === undefined ? {} : { modifierGroupId: role.modifierGroupId }),
      })),
      ...(includeFaceMemberships ? { faceMemberships: input.faceMemberships } : {}),
    })),
    baseRealizations: alternative.baseRealizations.map((realization) => ({
      actions: realization.actions.map(mapKeys),
      defaultOutputKeys: mapKeys(realization.defaultOutputKeys),
      defaultTriggerKeys: mapKeys(realization.defaultTriggerKeys ?? []),
      defaultHoldKeys: mapKeys(realization.defaultHoldKeys ?? []),
      alternateParticipations: (realization.alternateParticipations ?? []).map((view) => ({
        outputKeys: mapKeys(view.outputKeys),
        triggerKeys: mapKeys(view.triggerKeys),
        ...(view.holdKeys === undefined && preserveOptionalParticipationHoldKeys
          ? {}
          : { holdKeys: mapKeys(view.holdKeys ?? []) }),
      })),
    })),
    contextRequirements: alternative.contextRequirements,
    origin: alternative.origin,
  });
}

/**
 * InputAlternativeの情報保持identity。
 * activation identityとは別で、thumb派生等のdedupe時にsemantic/provenanceを落とさないために使う。
 */
export function canonicalInputAlternativeIdentity(
  alternative: InputAlternative,
): string {
  return inputAlternativeIdentity(alternative, {
    mapKey: (key) => key,
    mapKeys: (keys) => keys,
    includeFaceMemberships: true,
    preserveOptionalParticipationHoldKeys: true,
  });
}

/**
 * runtime selection policyが同じcanonical path familyか比較するためのidentity。
 * FaceMembershipはpresentation provenanceなので除外し、physical keyだけpolicy指定の写像を許す。
 */
export function inputAlternativeSelectionIdentity(
  alternative: InputAlternative,
  mapPhysicalKey: (key: PhysicalKeyId) => PhysicalKeyId = resolveKeyId,
): string {
  const mapKey = (key: PhysicalKeyId) => mapPhysicalKey(resolveKeyId(key));
  const mapKeys = (keys: readonly PhysicalKeyId[]) =>
    keys.map(mapKey).sort(compareString);
  return inputAlternativeIdentity(alternative, {
    mapKey,
    mapKeys,
    includeFaceMemberships: false,
    preserveOptionalParticipationHoldKeys: false,
  });
}
