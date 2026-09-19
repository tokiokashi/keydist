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

const sortedUniqueKeys = (keys: readonly string[]): PhysicalKeyId[] =>
  [...new Set(keys.map(resolveKeyId))].sort();

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
    return requirementSignature(left).localeCompare(requirementSignature(right));
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
    capabilitySignature(left).localeCompare(capabilitySignature(right)));
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
    left.key.localeCompare(right.key) || left.role.localeCompare(right.role));
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
    left.faceIndex - right.faceIndex || left.cellKey.localeCompare(right.cellKey));
};

const activationSignature = (
  requirements: readonly Requirement[],
  capabilities: readonly InputCapability[],
): string => [
  requirements.map(requirementSignature).join('\u0001'),
  capabilities.map(capabilitySignature).join('\u0001'),
].join('\u0002');

const semanticIdentity = (input: Pick<
  SemanticInput,
  'output' | 'physicalKeys' | 'requirements' | 'capabilities'
>): string => [
  input.physicalKeys.join('\u0000'),
  activationSignature(input.requirements, input.capabilities),
  input.output,
].join('\u0003');

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
  const activationByPhysicalKeys = new Map<string, string>();
  const outputByOperation = new Map<string, string>();

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
      const activation = activationSignature(requirements, capabilities);

      const previousActivation = activationByPhysicalKeys.get(physicalSignature);
      if (previousActivation !== undefined && previousActivation !== activation) {
        throw new Error(
          `同一physicalKeysに異なるRequirement/Capability setがある: ${physicalKeys.join(', ')}`,
        );
      }
      activationByPhysicalKeys.set(physicalSignature, activation);

      const operationSignature = `${physicalSignature}\u0003${activation}`;
      const previousOutput = outputByOperation.get(operationSignature);
      if (previousOutput !== undefined && previousOutput !== cell.output) {
        throw new Error(
          `同一physical operationに異なるoutputがある: ${previousOutput} / ${cell.output}`,
        );
      }
      outputByOperation.set(operationSignature, cell.output);

      const candidate: MutableSemanticInput = {
        output: cell.output,
        physicalKeys,
        requirements,
        capabilities,
        layerId,
        roles,
        faceMemberships: [{ faceIndex, cellKey: cell.key }],
      };
      const identity = semanticIdentity(candidate);
      const existing = byIdentity.get(identity);
      if (existing === undefined) {
        byIdentity.set(identity, candidate);
        continue;
      }
      if (existing.layerId !== layerId) {
        throw new Error(
          `同一SemanticInputが異なるlayerIdへ属している: ${existing.layerId} / ${layerId}`,
        );
      }
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
    .sort((left, right) => semanticIdentity(left).localeCompare(semanticIdentity(right)));
}
