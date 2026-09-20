export {
  compileFaceSemanticInputs,
  canonicalInputAlternativeIdentity,
  compileSequenceInputAlternative,
  compileSequenceInputArtifacts,
  compileSequenceSemanticInputs,
  validateCanonicalInputMap,
  type CompiledSequenceArtifacts,
} from './compiler.ts';
export type {
  FaceMembership,
  InputCapability,
  InputAlternativeOrigin,
  InputClassification,
  InputContextRequirement,
  KeyRole,
  PhysicalKeyId,
  Requirement,
  SemanticInput,
  SemanticInputSequence,
  SemanticRole,
  BaseActionRealization,
  BaseActionRealizationSequence,
  BaseParticipationView,
  CanonicalInputMap,
  InputAlternative,
  InputAlternativeSet,
} from './types.ts';

export {
  flattenBaseActionRealizations,
  mapInputAlternativePhysicalKeys,
  validateBaseActionRealization,
  validateBaseActionRealizations,
  type SemanticInputAction,
} from './realization.ts';

export {
  applyActionRealizationPolicy,
  DEFAULT_ACTION_REALIZATION_POLICY,
  sameActionRealizationPolicy,
  type ActionRealizationPolicy,
  type HoldStartActionGrouping,
} from './action-realization.ts';

export {
  DEFAULT_TRIGGER_REALIZATION_POLICY,
  realizeTriggerActions,
  sameTriggerRealizationPolicy,
  type RealizedSemanticAction,
  type TriggerHoldPhase,
  type TriggerHoldState,
  type TriggerRealizationPolicy,
  type TriggerRealizationResult,
} from './trigger-realization.ts';
