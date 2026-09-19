import { keyId, resolveKeyId } from '../../geometry.ts';
import type { Face } from '../../layouts/types.ts';
import type {
  FaceMembership,
  InputCapability,
  KeyRole,
  PhysicalKeyId,
  Requirement,
  SemanticInput,
} from './types.ts';

interface MutableSemanticInput {
  output: string;
  physicalKeys: PhysicalKeyId[];
  requirements: Requirement[];
  capabilities: InputCapability[];
  layerId: string;
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

const normalizeRoles = (roles: readonly KeyRole[]): KeyRole[] => {
  const unique = new Map<string, KeyRole>();
  for (const role of roles) {
    const normalized: KeyRole = {
      key: resolveKeyId(role.key),
      role: role.role,
    };
    unique.set(`${normalized.key}\u0000${normalized.role}`, normalized);
  }
  return [...unique.values()].sort((left, right) =>
    compareString(left.key, right.key) || compareString(left.role, right.role));
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

const normalizedLayerId = (
  face: Face,
  faceIndex: number,
  triggerKeys: readonly PhysicalKeyId[],
): string => {
  if (triggerKeys.length === 0) return 'single';
  if (face.inputRole === 'composition') return 'combo';
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

const faceRoles = (
  face: Face,
  triggerKeys: readonly PhysicalKeyId[],
): KeyRole[] => {
  if (face.inputRole === undefined) {
    throw new Error('FaceはinputRoleを明示する必要がある');
  }
  if (face.inputRole !== 'modifier') return [];
  return normalizeRoles(triggerKeys.map((key) => ({ key, role: 'modifier' as const })));
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

export function compileFaceSemanticInputs(faces: readonly Face[]): readonly SemanticInput[] {
  const byIdentity = new Map<string, MutableSemanticInput>();
  const inputsByPhysicalKeys = new Map<string, MutableSemanticInput[]>();

  faces.forEach((face, faceIndex) => {
    if (face.inputRole === undefined) {
      throw new Error(`Face ${faceIndex} はinputRoleを明示する必要がある`);
    }

    const triggerKeys = sortedUniqueKeys(face.trigger);
    if (triggerKeys.length === 0 && face.triggerPersistence !== undefined) {
      throw new Error(`Face ${faceIndex} はtriggerなしでtriggerPersistenceを指定できない`);
    }

    for (const cell of faceCells(face)) {
      const physicalKeys = sortedUniqueKeys([...triggerKeys, cell.key]);
      const requirements = faceRequirements(face, triggerKeys, cell.key);
      const capabilities = faceCapabilities(face, triggerKeys);
      const roles = faceRoles(face, triggerKeys);
      const layerId = normalizedLayerId(face, faceIndex, triggerKeys);
      const physicalSignature = physicalKeys.join('\u0000');

      const candidate: MutableSemanticInput = {
        output: cell.output,
        physicalKeys,
        requirements,
        capabilities,
        layerId,
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
          throw new Error(
            `同一outputに複数のRequirement setがある: ${candidate.output}`,
          );
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
      if (existing.layerId !== layerId) {
        throw new Error(
          `同一SemanticInputが異なるlayerIdへ属している: ${existing.layerId} / ${layerId}`,
        );
      }
      existing.capabilities = normalizeCapabilities([
        ...existing.capabilities,
        ...capabilities,
      ]);
      existing.roles = normalizeRoles([...existing.roles, ...roles]);
      existing.faceMemberships = normalizeMemberships([
        ...existing.faceMemberships,
        ...candidate.faceMemberships,
      ]);
    }
  });

  return [...byIdentity.values()]
    .map((input): SemanticInput => ({
      output: input.output,
      physicalKeys: [...input.physicalKeys],
      requirements: normalizeRequirements(input.requirements),
      capabilities: normalizeCapabilities(input.capabilities),
      layerId: input.layerId,
      roles: normalizeRoles(input.roles),
      faceMemberships: normalizeMemberships(input.faceMemberships),
    }))
    .sort((left, right) => compareString(semanticIdentity(left), semanticIdentity(right)));
}
