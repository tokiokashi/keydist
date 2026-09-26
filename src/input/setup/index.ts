export type { Setup, SetupIdGenerator } from './types.ts';
export {
  deriveSetupName,
  nameSetups,
  type NamedSetup,
  type SetupNameSource,
} from './naming.ts';
export { setupColor, leastUsedColorIndex, SETUP_COLOR_PALETTE_SIZE } from './color.ts';
export { copySetupOverrides, dropSetupOverrides } from './overrides.ts';
export {
  resolveSetup,
  type SetupCatalog,
  type SetupReferenceError,
  type SetupResolution,
} from './resolve.ts';
export {
  createSetup,
  duplicateSetup,
  deleteSetup,
  relabelSetup,
  type SetupLibrary,
} from './collection.ts';
export { initialSetups } from './initial.ts';
export { setupLibraryCodec } from './codec.ts';
