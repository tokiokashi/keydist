import type { AnalysisSessionState } from './session-store.ts';
import type {
  AnalysisSnapshotReader,
  AnalysisViewTarget,
} from './views/view-contract.ts';

export interface AnalysisChromeItem {
  label: string;
  value: string;
  overridden?: boolean;
}

export interface AnalysisConditionChromeRow {
  layoutId: string;
  effective: readonly AnalysisChromeItem[];
  overrides: readonly AnalysisChromeItem[];
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

function overrideItems(
  session: AnalysisSessionState,
  layoutId: string,
): readonly AnalysisChromeItem[] {
  const override = session.distance.perLayout[layoutId] ?? {};
  return Object.entries(override).flatMap(([key, value]) => {
    if (value === undefined) return [];
    if (key !== 'romajiRule') {
      const defaultValue = session.distance.defaults[
        key as keyof AnalysisSessionState['distance']['defaults']
      ];
      if (sameValue(value, defaultValue)) return [];
    }
    return [{
      label: key,
      value: formatValue(value),
      overridden: true,
    }];
  });
}

/**
 * Project the model conditions that produced the current Snapshot into host-owned pane chrome.
 * The View itself stays unaware of Session defaults/overrides.
 */
export function projectAnalysisConditionChrome(
  session: AnalysisSessionState,
  target: AnalysisViewTarget,
  reader: AnalysisSnapshotReader,
): readonly AnalysisConditionChromeRow[] {
  const layoutIds = target.kind === 'single' ? [target.layoutId] : target.layoutIds;

  return layoutIds.flatMap((layoutId) => {
    const read = reader.get(layoutId);
    if (!read) return [];

    const conditions = read.snapshot.conditions;
    const effective: AnalysisChromeItem[] = [
      { label: 'geometry', value: conditions.geometry },
      { label: 'N', value: String(conditions.options.windowSize) },
      {
        label: 'SFB-home',
        value: conditions.options.sfbHomeCost ? 'on' : 'off',
      },
      {
        label: 'opposite-thumb',
        value: conditions.options.preferOppositeThumb ? 'on' : 'off',
      },
      {
        label: 'chain',
        value: formatValue(conditions.chainPolicy),
      },
      {
        label: 'arpeggio',
        value: formatValue(conditions.arpeggioPolicy),
      },
      {
        label: 'trigger',
        value: formatValue(conditions.triggerRealizationPolicy),
      },
      {
        label: 'action',
        value: formatValue(conditions.actionRealizationPolicy),
      },
    ];
    if (read.snapshot.romajiRuleId !== null) {
      effective.push({ label: 'romaji', value: read.snapshot.romajiRuleId });
    }

    return [{
      layoutId,
      effective,
      overrides: overrideItems(session, layoutId),
    }];
  });
}
