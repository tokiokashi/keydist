import type { AnalysisSnapshot } from '../snapshot-computation.ts';
import type { ResolvedBinding } from '../view-contract.ts';

export interface AnalysisViewProps<Config> {
  binding: ResolvedBinding;
  snapshots: readonly AnalysisSnapshot[];
  config: Config;
  onConfigChange(next: Config): void;
}

/**
 * View modules below this directory receive resolved analysis data from their host.
 * Storage, Router, Dockview and evaluate/condition resolution stay outside this boundary.
 */
export type AnalysisViewComponentContract<Config> = (
  props: AnalysisViewProps<Config>,
) => unknown;
