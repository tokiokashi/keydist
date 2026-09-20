import {
  PHYSICAL_SHAPES,
  type PhysicalShape,
} from './geometry.ts';
import {
  sanitizeGeometrySettings,
  sanitizePhysicalShape,
} from './geometry-settings.ts';
import {
  sanitizeConditionDefaults,
  sanitizeConditionOverrides,
  sanitizeUiState,
  type UiStateChoices,
  type UiStateV1,
} from './ui-state.ts';
import {
  sanitizeUserLayouts,
  type UserLayout,
} from './user-layouts.ts';
import {
  sanitizeRomajiSettings,
  type RomajiSettings,
} from './romaji/rules.ts';
import {
  sanitizeConditionPresets,
  type ConditionPreset,
} from './condition-presets.ts';

export const CONDITION_BUNDLE_VERSION = 2;

export interface ConditionBundle {
  version: typeof CONDITION_BUNDLE_VERSION;
  conditions: UiStateV1['conditions'];
  layouts: UserLayout[];
  geometryShapes: PhysicalShape[];
  romajiSettings: RomajiSettings;
  presets: ConditionPreset[];
}

export type ConditionBundleData = Omit<ConditionBundle, 'version'>;

export function serializeConditionBundle(bundle: ConditionBundleData): string {
  return JSON.stringify({
    version: CONDITION_BUNDLE_VERSION,
    ...structuredClone(bundle),
  }, null, 2);
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function uniqueShapes(value: unknown, fallback: PhysicalShape): PhysicalShape[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((candidate) => {
    const source = record(candidate);
    if (typeof source.id !== 'string' || !source.id.startsWith('shape-') || seen.has(source.id)) return [];
    const shape = sanitizePhysicalShape(source, fallback);
    seen.add(shape.id);
    return [shape];
  });
}

function choicesWithLayouts(choices: UiStateChoices, layouts: readonly UserLayout[]): UiStateChoices {
  const importedIds = layouts.map((layout) => layout.id);
  return {
    ...choices,
    layouts: {
      en: [...new Set([...choices.layouts.en, ...importedIds])],
      ja: [...new Set([...choices.layouts.ja, ...importedIds])],
    },
  };
}

export function parseConditionBundle(
  source: string,
  fallback: ConditionBundleData,
  defaults: UiStateV1,
  choices: UiStateChoices,
): ConditionBundle {
  const parsed = record(JSON.parse(source));
  if (parsed.version !== CONDITION_BUNDLE_VERSION) throw new Error('条件ファイルのバージョンが違う');

  const layouts = sanitizeUserLayouts(parsed.layouts);
  const expandedChoices = choicesWithLayouts(choices, layouts);
  const candidateState = {
    ...defaults,
    conditions: parsed.conditions,
  };
  const sanitizedState = sanitizeUiState(candidateState, defaults, expandedChoices);
  const geometryShapes = uniqueShapes(parsed.geometryShapes, PHYSICAL_SHAPES['row-staggered']);
  const geometrySettings = sanitizeGeometrySettings(
    sanitizedState.conditions.geometrySettings,
    fallback.conditions.geometrySettings,
  );
  const conditionDefaults = sanitizeConditionDefaults(
    sanitizedState.conditions.defaults,
    fallback.conditions.defaults,
  );
  const conditions = {
    defaults: conditionDefaults,
    geometrySettings,
    perLayout: Object.fromEntries(
      Object.entries(sanitizedState.conditions.perLayout).map(([id, values]) => [
        id,
        sanitizeConditionOverrides(values, defaults.ui.playback, conditionDefaults.chain),
      ]),
    ),
  };
  return {
    version: CONDITION_BUNDLE_VERSION,
    conditions,
    layouts,
    geometryShapes,
    romajiSettings: sanitizeRomajiSettings(parsed.romajiSettings),
    presets: sanitizeConditionPresets(parsed.presets),
  };
}

export function conditionBundleFromState(
  state: UiStateV1,
  layouts: readonly UserLayout[],
  geometryShapes: readonly PhysicalShape[],
  romajiSettings: RomajiSettings,
  presets: readonly ConditionPreset[],
): ConditionBundleData {
  return {
    conditions: structuredClone(state.conditions),
    layouts: structuredClone([...layouts]),
    geometryShapes: structuredClone([...geometryShapes]),
    romajiSettings: structuredClone(romajiSettings),
    presets: structuredClone([...presets]),
  };
}
