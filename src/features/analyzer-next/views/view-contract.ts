import type { ModeId } from '../../../layout-selection.ts';
import type { AnalysisSnapshot } from '../snapshot-computation.ts';
import type {
  AnalysisDistanceConditions,
  AnalysisDistanceOverrideConditions,
  AnalysisTimingConditions,
  AnalysisTimingOverrideConditions,
} from '../session-store.ts';

export type AnalysisViewTarget =
  | { kind: 'single'; mode: ModeId; layoutId: string }
  | { kind: 'set'; mode: ModeId; layoutIds: readonly string[] };

export interface AnalysisSnapshotRevision {
  target: number;
  distance: number;
}

export interface AnalysisSnapshotRead {
  layoutId: string;
  calculationKey: string;
  revision: AnalysisSnapshotRevision;
  snapshot: AnalysisSnapshot;
}

/**
 * A reader is created by the host for one coherent Session revision. A View never asks the
 * Session/store to resolve layouts itself and therefore cannot mix panes from different revisions.
 */
export interface AnalysisSnapshotReader {
  readonly revision: AnalysisSnapshotRevision;
  get(layoutId: string): AnalysisSnapshotRead | undefined;
  getMany(layoutIds: readonly string[]): readonly AnalysisSnapshotRead[];
}

export type AnalysisConditionScope =
  | { kind: 'default' }
  | { kind: 'layout'; layoutId: string };

export type AnalysisDistanceCommand =
  | {
      scope: { kind: 'default' };
      key: keyof AnalysisDistanceConditions;
      value: AnalysisDistanceConditions[keyof AnalysisDistanceConditions];
    }
  | {
      scope: { kind: 'layout'; layoutId: string };
      key: keyof AnalysisDistanceOverrideConditions;
      value:
        | AnalysisDistanceOverrideConditions[keyof AnalysisDistanceOverrideConditions]
        | undefined;
    };

export type AnalysisTimingCommand =
  | {
      scope: { kind: 'default' };
      key: keyof AnalysisTimingConditions;
      value: AnalysisTimingConditions[keyof AnalysisTimingConditions];
    }
  | {
      scope: { kind: 'layout'; layoutId: string };
      key: keyof AnalysisTimingOverrideConditions;
      value:
        | AnalysisTimingOverrideConditions[keyof AnalysisTimingOverrideConditions]
        | undefined;
    };

export interface AnalysisSessionCommands {
  setFocus(layoutId: string | undefined): void;
  addSelectedLayout(mode: ModeId, layoutId: string): void;
  setDistanceCondition(command: AnalysisDistanceCommand): void;
  setTimingCondition(command: AnalysisTimingCommand): void;
}

export interface AnalysisViewProps<Config> {
  /** Host-resolved target. Unavailable bindings are rendered by host chrome, not the View. */
  target: AnalysisViewTarget;
  /** Revision/key-aware read-only access to calculation snapshots. */
  snapshot: AnalysisSnapshotReader;
  /** Decoded, instance-owned ViewConfig. */
  config: Config;
  /** Host decides persistence destination (route or Workspace instance). */
  onConfigChange(next: Config): void;
  /** Session writes always carry an explicit default/layout scope. */
  commands: AnalysisSessionCommands;
}

/**
 * View modules below this directory receive resolved analysis data from their host.
 * Storage, Router, Dockview and evaluate/condition resolution stay outside this boundary.
 */
export type AnalysisViewComponentContract<Config> = (
  props: AnalysisViewProps<Config>,
) => unknown;
