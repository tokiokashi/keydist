import type { GeometryKind } from './geometry.ts';
import type { Layout } from './layouts/index.ts';
import type { UiPlaybackState } from './ui-state.ts';
import type { ConditionPreset } from './condition-presets.ts';

export interface AnalyzerConditionsOption {
  value: string;
  label: string;
}

export interface AnalyzerConditionsCatalog {
  layouts: readonly Layout[];
  allLayouts: readonly Layout[];
  geometryOptions: readonly AnalyzerConditionsOption[];
  romajiRules: readonly AnalyzerConditionsOption[];
  presets: readonly ConditionPreset[];
  playbackDefaults: UiPlaybackState;
  calibrationAvailable: boolean;
}

export interface AnalyzerConditionsSnapshot extends AnalyzerConditionsCatalog {
  revision: number;
}

export interface AnalyzerConditionsModel {
  getSnapshot(): AnalyzerConditionsSnapshot;
  subscribe(listener: () => void): () => void;
  setCatalog(catalog: AnalyzerConditionsCatalog): void;
}

export interface AnalyzerConditionsActions {
  commitCondition(layoutId: string | undefined, key: string, value: unknown): void;
  toggleOverride(layoutId: string, enabled: boolean): void;
  applyPreset(id: string): void;
  savePreset(name: string): void;
  deletePreset(id: string): void;
  exportBundle(): void;
  importBundle(file: File): Promise<string>;
  setPlaybackUi(key: keyof UiPlaybackState, value: UiPlaybackState[keyof UiPlaybackState]): void;
  setPlaybackCondition(key: string, value: unknown): void;
}

function sameOptions(
  left: readonly AnalyzerConditionsOption[],
  right: readonly AnalyzerConditionsOption[],
): boolean {
  return left.length === right.length
    && left.every((item, index) =>
      item.value === right[index]?.value && item.label === right[index]?.label);
}

function sameLayouts(left: readonly Layout[], right: readonly Layout[]): boolean {
  return left.length === right.length
    && left.every((layout, index) => {
      const other = right[index];
      return other !== undefined
        && layout.id === other.id
        && layout.name === other.name
        && layout === other;
    });
}

function samePresets(
  left: readonly ConditionPreset[],
  right: readonly ConditionPreset[],
): boolean {
  return left.length === right.length
    && left.every((preset, index) => {
      const other = right[index];
      return other !== undefined
        && preset.id === other.id
        && preset.name === other.name
        && preset === other;
    });
}

export function createAnalyzerConditionsModel(
  initial: AnalyzerConditionsCatalog,
): AnalyzerConditionsModel {
  let snapshot: AnalyzerConditionsSnapshot = {
    ...initial,
    layouts: [...initial.layouts],
    allLayouts: [...initial.allLayouts],
    geometryOptions: [...initial.geometryOptions],
    romajiRules: [...initial.romajiRules],
    presets: [...initial.presets],
    playbackDefaults: structuredClone(initial.playbackDefaults),
    revision: 0,
  };
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setCatalog(catalog) {
      if (
        sameLayouts(snapshot.layouts, catalog.layouts)
        && sameLayouts(snapshot.allLayouts, catalog.allLayouts)
        && sameOptions(snapshot.geometryOptions, catalog.geometryOptions)
        && sameOptions(snapshot.romajiRules, catalog.romajiRules)
        && samePresets(snapshot.presets, catalog.presets)
        && snapshot.calibrationAvailable === catalog.calibrationAvailable
        && JSON.stringify(snapshot.playbackDefaults) === JSON.stringify(catalog.playbackDefaults)
      ) return;

      snapshot = {
        ...catalog,
        layouts: [...catalog.layouts],
        allLayouts: [...catalog.allLayouts],
        geometryOptions: [...catalog.geometryOptions],
        romajiRules: [...catalog.romajiRules],
        presets: [...catalog.presets],
        playbackDefaults: structuredClone(catalog.playbackDefaults),
        revision: snapshot.revision + 1,
      };
      for (const listener of listeners) listener();
    },
  };
}

export function geometryConditionOption(
  value: GeometryKind,
  label: string,
): AnalyzerConditionsOption {
  return { value, label };
}
