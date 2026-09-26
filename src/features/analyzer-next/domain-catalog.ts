import {
  isCustomGeometryKind,
  isPresetGeometryKind,
  type GeometryKind,
  type PhysicalShape,
} from '../../geometry.ts';
import {
  clonePhysicalShape,
  geometrySettingsForPreset,
  type GeometrySettings,
} from '../../geometry-settings.ts';
import type { ModeId } from '../../layout-selection.ts';
import { LAYOUTS, LAYOUTS_JA, withRomaji, type Layout } from '../../layouts/index.ts';
import {
  defaultRomajiRuleId,
  tableForRule,
  type RomajiRuleId,
  type RomajiSettings,
  type UserRomajiRule,
} from '../../romaji/rules.ts';
import {
  toLayout,
  type UserLayout,
} from '../../user-layouts.ts';
import type {
  AnalysisGeometryResolution,
  AnalysisLayoutCatalogEntry,
} from './resolved-input.ts';

export interface AnalysisDomainCatalogSource {
  userLayouts: readonly UserLayout[];
  userGeometryShapes: readonly PhysicalShape[];
  romajiSettings: RomajiSettings;
  geometrySettings: GeometrySettings;
}

export interface AnalysisDomainCatalog {
  layoutsForMode(mode: ModeId): readonly AnalysisLayoutCatalogEntry[];
  geometryForKind(kind: GeometryKind): AnalysisGeometryResolution;
  availableLayoutIdsByMode(): Readonly<Record<ModeId, readonly string[]>>;
}

function ruleRevision(
  id: RomajiRuleId,
  customRules: readonly UserRomajiRule[],
): unknown {
  return customRules.find((rule) => rule.id === id) ?? { builtin: id };
}

function romajiEntry(
  layout: Layout,
  revisionSource: unknown,
  ruleId: RomajiRuleId,
  customRules: readonly UserRomajiRule[],
): AnalysisLayoutCatalogEntry {
  const resolve = (nextRuleId: string): AnalysisLayoutCatalogEntry => ({
    layout: withRomaji(layout, tableForRule(nextRuleId, [...customRules])),
    revisionKey: JSON.stringify({
      source: revisionSource,
      romajiRuleId: nextRuleId,
      rule: ruleRevision(nextRuleId, customRules),
    }),
    romajiRuleId: nextRuleId,
    romajiCapable: true,
    resolveRomajiRule: resolve,
  });

  return resolve(ruleId);
}

function directEntry(
  layout: Layout,
  revisionSource: unknown,
): AnalysisLayoutCatalogEntry {
  return {
    layout,
    revisionKey: JSON.stringify(revisionSource),
    romajiRuleId: null,
    romajiCapable: false,
  };
}

function userLayoutEntry(
  definition: UserLayout,
  mode: ModeId,
  settings: RomajiSettings,
): AnalysisLayoutCatalogEntry {
  const base = toLayout(definition);
  const revisionSource = { kind: 'user-layout', mode, definition };

  if (mode === 'en' || definition.direct) {
    return directEntry(base, revisionSource);
  }

  const ruleId = settings.assignments[definition.id] ?? definition.romaji;
  return romajiEntry(base, revisionSource, ruleId, settings.rules);
}

function builtInJapaneseEntry(
  layout: Layout,
  settings: RomajiSettings,
): AnalysisLayoutCatalogEntry {
  if (!layout.romajiTable) {
    return directEntry(layout, { kind: 'builtin-layout', mode: 'ja', id: layout.id });
  }

  const ruleId = settings.assignments[layout.id] ?? defaultRomajiRuleId(layout.id);
  return romajiEntry(
    layout,
    { kind: 'builtin-layout', mode: 'ja', id: layout.id },
    ruleId,
    settings.rules,
  );
}

function customShapeId(kind: GeometryKind): string | undefined {
  return isCustomGeometryKind(kind) && kind !== 'custom'
    ? kind.slice('custom:'.length)
    : undefined;
}

/**
 * Catalog adapter for the Analyzer application layer.
 *
 * All mutable domain sources are explicit constructor inputs. Revision keys include user-authored
 * layout/rule/geometry data so Snapshot keys change when those catalogs change without relying on
 * an AppState revision counter.
 */
export function createAnalysisDomainCatalog(
  source: AnalysisDomainCatalogSource,
): AnalysisDomainCatalog {
  const en = [
    ...LAYOUTS.map((layout) =>
      directEntry(layout, { kind: 'builtin-layout', mode: 'en', id: layout.id })),
    ...source.userLayouts.map((definition) =>
      userLayoutEntry(definition, 'en', source.romajiSettings)),
  ];
  const ja = [
    ...LAYOUTS_JA.map((layout) => builtInJapaneseEntry(layout, source.romajiSettings)),
    ...source.userLayouts.map((definition) =>
      userLayoutEntry(definition, 'ja', source.romajiSettings)),
  ];

  const byMode: Record<ModeId, readonly AnalysisLayoutCatalogEntry[]> = { en, ja };

  return {
    layoutsForMode: (mode) => byMode[mode],
    geometryForKind(kind) {
      const current = source.geometrySettings;
      const shape = isPresetGeometryKind(kind)
        ? geometrySettingsForPreset(kind).shape
        : source.userGeometryShapes.find((candidate) => candidate.id === customShapeId(kind))
          ?? current.shape;
      const settings: GeometrySettings = {
        assignment: structuredClone(current.assignment),
        shape: clonePhysicalShape(shape),
      };
      return {
        settings,
        revisionKey: JSON.stringify({
          kind,
          assignment: settings.assignment,
          shape: settings.shape,
        }),
      };
    },
    availableLayoutIdsByMode: () => ({
      en: en.map((entry) => entry.layout.id),
      ja: ja.map((entry) => entry.layout.id),
    }),
  };
}
