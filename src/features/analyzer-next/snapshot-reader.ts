import type { ModeId } from '#legacy/layout-selection.ts';
import type {
  AnalysisGeometryResolution,
  AnalysisLayoutCatalogEntry,
} from './resolved-input.ts';
import { createResolvedAnalysisInputResolver } from './resolved-input.ts';
import type { AnalysisSessionState } from './session-store.ts';
import type { AnalysisSnapshot } from './snapshot-computation.ts';
import type { ResolvedAnalysisInput } from './snapshot-computation.ts';
import type { AnalysisSnapshotService } from './snapshot-service.ts';
import type {
  AnalysisSnapshotRead,
  AnalysisSnapshotReader,
} from './views/view-contract.ts';

export interface AnalysisSnapshotReaderOptions {
  session: AnalysisSessionState;
  layoutsForMode(mode: ModeId): readonly AnalysisLayoutCatalogEntry[];
  geometryForKind: (kind: AnalysisSessionState['distance']['defaults']['geometry']) =>
    AnalysisGeometryResolution;
  snapshots: AnalysisSnapshotService<ResolvedAnalysisInput, AnalysisSnapshot>;
}

/**
 * Create a View-facing reader frozen to one Session target/distance revision.
 *
 * The resolver closes over the supplied Session snapshot instead of the live store. Snapshot
 * evaluation still shares the application-level cache through getResolved().
 */
export function createAnalysisSnapshotReader(
  options: AnalysisSnapshotReaderOptions,
): AnalysisSnapshotReader {
  const revision = Object.freeze({
    target: options.session.revisions.target,
    distance: options.session.revisions.distance,
  });
  const resolve = createResolvedAnalysisInputResolver({
    getSession: () => options.session,
    layoutsForMode: options.layoutsForMode,
    geometryForKind: options.geometryForKind,
  });
  const reads = new Map<string, AnalysisSnapshotRead | undefined>();

  const get = (layoutId: string): AnalysisSnapshotRead | undefined => {
    if (reads.has(layoutId)) return reads.get(layoutId);
    const resolved = resolve(layoutId);
    if (!resolved) {
      reads.set(layoutId, undefined);
      return undefined;
    }
    const read: AnalysisSnapshotRead = Object.freeze({
      layoutId,
      calculationKey: resolved.key,
      revision,
      snapshot: options.snapshots.getResolved(layoutId, resolved),
    });
    reads.set(layoutId, read);
    return read;
  };

  return Object.freeze({
    revision,
    get,
    getMany(layoutIds: readonly string[]) {
      return layoutIds.flatMap((layoutId: string) => {
        const read = get(layoutId);
        return read === undefined ? [] : [read];
      });
    },
  });
}
