export {
  compileFaceSemanticInputs,
  canonicalInputAlternativeIdentity,
  inputAlternativeSelectionIdentity,
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
  classifyTriggerActivation,
  DEFAULT_ACTION_REALIZATION_POLICY,
  DEFAULT_TRIGGER_ACTIVATION_GROUPINGS,
  sameActionRealizationPolicy,
  type ActionRealizationPolicy,
  type TriggerActivationClass,
  type TriggerActivationGrouping,
  type TriggerActivationMode,
  type TriggerActivationOverride,
  type TriggerActivationSelector,
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
