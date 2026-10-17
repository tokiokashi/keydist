export type { Setup, SetupIdGenerator } from './types.ts';
export {
  analysisTargetKey,
  sameAnalysisTarget,
  DEFAULT_ANALYSIS_TARGET,
  layoutIdsOfTargets,
  type AnalysisTarget,
} from './target.ts';
export {
  analysisTargetSchema,
  decodeAnalysisTarget,
  encodeAnalysisTarget,
} from './target-codec.ts';
export { nameTargets, effectiveLabel, type NamedTarget, type TargetNameSource } from './naming.ts';
export { copySetupOverrides, dropSetupOverrides } from './overrides.ts';
export {
  resolveSetup,
  type SetupCatalog,
  type SetupReferenceError,
  type SetupResolution,
} from './resolve.ts';
export {
  deriveInputMethod,
  resolveSetupForText,
  type InputMethodDerivation,
  type SetupTextResolution,
} from './input-method.ts';
export {
  createSetup,
  nextSetupNumber,
  duplicateSetup,
  deleteSetup,
  relabelSetup,
  setSetupShape,
  type SetupLibrary,
} from './collection.ts';
export { setupLibraryCodec } from './codec.ts';
export { setupLibraryItemScope } from './library-scope.ts';
export {
  LAYOUT_MISSING_REASON,
  SHAPE_MISSING_REASON,
  SETUP_MISSING_REASON,
  MISSING_LAYOUT_NAME,
  MISSING_SHAPE_NAME,
  MISSING_SETUP_NAME,
  MISSING_ROMAJI_RULE_NAME,
  MISSING_FINGER_ASSIGNMENT_NAME,
  describeShapeFallback,
} from './missing-text.ts';
