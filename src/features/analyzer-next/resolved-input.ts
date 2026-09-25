import {
  assignmentWithHomeKeys,
  buildGeometry,
  type GeometryKind,
} from '../../geometry.ts';
import type { GeometrySettings } from '../../geometry-settings.ts';
import type { ModeId } from '../../layout-selection.ts';
import type { Layout } from '../../layouts/types.ts';
import { resolveConditions } from '../../condition-resolution.ts';
import type { UiStateConditionsDefaults } from '../../ui-state.ts';
import type {
  AnalysisDistanceConditions,
  AnalysisSessionState,
} from './session-store.ts';
import type { SnapshotResolution } from './snapshot-service.ts';
import type { ResolvedAnalysisInput } from './snapshot-computation.ts';

export interface AnalysisLayoutCatalogEntry {
  layout: Layout;
  revisionKey: string;
  romajiRuleId: string | null;
}

export interface AnalysisGeometryResolution {
  settings: GeometrySettings;
  revisionKey: string;
}

export interface ResolvedAnalysisInputResolverOptions {
  getSession(): AnalysisSessionState;
  layoutsForMode(mode: ModeId): readonly AnalysisLayoutCatalogEntry[];
  geometryForKind(kind: GeometryKind): AnalysisGeometryResolution;
}

function legacyCompatibleConditionDefaults(
  distance: AnalysisDistanceConditions,
  session: AnalysisSessionState,
): UiStateConditionsDefaults {
  return {
    ...distance,
    playbackRateAverage: session.timing.defaults.playbackRateAverage,
    playbackRateWindow: session.timing.defaults.playbackRateWindow,
    playbackRateHalfLifeSeconds: session.timing.defaults.playbackRateHalfLifeSeconds,
  };
}

function calculationKey(input: {
  mode: ModeId;
  text: string;
  layoutId: string;
  layoutRevision: string;
  geometryRevision: string;
  homeKeys: Layout['homeKeys'];
  resolvedConditions: ReturnType<typeof resolveConditions>;
  romajiRuleId: string | null;
}): string {
  return JSON.stringify(input);
}

/**
 * Resolve (mode, layoutId) into the complete, immutable input consumed by evaluate().
 * Domain-catalog revisions are explicit inputs so editing a user layout, romaji rule or
 * geometry shape changes the calculation key without depending on AppState revision.
 */
export function createResolvedAnalysisInputResolver(
  options: ResolvedAnalysisInputResolverOptions,
) {
  return (layoutId: string): SnapshotResolution<ResolvedAnalysisInput> | undefined => {
    const session = options.getSession();
    if (!session.selectedLayoutIds.includes(layoutId)) return undefined;

    const catalogEntry = options.layoutsForMode(session.mode)
      .find((entry) => entry.layout.id === layoutId);
    if (!catalogEntry) return undefined;

    const distanceOverride = session.distance.perLayout[layoutId] ?? {};
    const { romajiRule: _romajiRule, ...distanceOnlyOverride } = distanceOverride;
    const resolvedConditions = resolveConditions(
      legacyCompatibleConditionDefaults(session.distance.defaults, session),
      distanceOnlyOverride,
    );
    const geometryResolution = options.geometryForKind(resolvedConditions.geometry);
    const assignment = assignmentWithHomeKeys(
      geometryResolution.settings.assignment,
      catalogEntry.layout.homeKeys,
    );
    const geometry = buildGeometry(geometryResolution.settings.shape, assignment);

    const key = calculationKey({
      mode: session.mode,
      text: session.text,
      layoutId,
      layoutRevision: catalogEntry.revisionKey,
      geometryRevision: geometryResolution.revisionKey,
      homeKeys: catalogEntry.layout.homeKeys,
      resolvedConditions,
      romajiRuleId: catalogEntry.romajiRuleId,
    });

    return {
      key,
      input: {
        mode: session.mode,
        text: session.text,
        layout: catalogEntry.layout,
        geometry,
        conditions: resolvedConditions,
        romajiRuleId: catalogEntry.romajiRuleId,
      },
    };
  };
}
