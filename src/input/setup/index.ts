export type { Setup, SetupIdGenerator } from './types.ts';
export {
  analysisTargetKey,
  sameAnalysisTarget,
  DEFAULT_ANALYSIS_TARGET,
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
  type SetupLibrary,
} from './collection.ts';
export { setupLibraryCodec } from './codec.ts';
