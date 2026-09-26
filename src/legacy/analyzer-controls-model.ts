import type { ModeId } from './layout-selection.ts';
import type { GeometryKind } from '../geometry.ts';

export interface AnalyzerLayoutControlOption {
  id: string;
  name: string;
  isRomaji: boolean;
  isUser: boolean;
  slot: number;
}

export interface AnalyzerGeometryControlOption {
  value: GeometryKind;
  label: string;
}

export interface AnalyzerControlsSnapshot {
  layoutsByMode: Record<ModeId, readonly AnalyzerLayoutControlOption[]>;
  geometryOptions: readonly AnalyzerGeometryControlOption[];
  geometrySummary: string;
  geometryStatus: string;
  revision: number;
}

export interface AnalyzerControlsModel {
  getSnapshot(): AnalyzerControlsSnapshot;
  subscribe(listener: () => void): () => void;
  setGeometryStatus(status: string): void;
  setCatalog(
    layoutsByMode: Record<ModeId, readonly AnalyzerLayoutControlOption[]>,
    geometryOptions: readonly AnalyzerGeometryControlOption[],
    geometrySummary: string,
  ): void;
}

function sameLayouts(
  left: readonly AnalyzerLayoutControlOption[],
  right: readonly AnalyzerLayoutControlOption[],
): boolean {
  return left.length === right.length && left.every((item, index) => {
    const other = right[index];
    return other !== undefined
      && item.id === other.id
      && item.name === other.name
      && item.isRomaji === other.isRomaji
      && item.isUser === other.isUser
      && item.slot === other.slot;
  });
}

function sameGeometries(
  left: readonly AnalyzerGeometryControlOption[],
  right: readonly AnalyzerGeometryControlOption[],
): boolean {
  return left.length === right.length && left.every((item, index) => {
    const other = right[index];
    return other !== undefined && item.value === other.value && item.label === other.label;
  });
}

export function createAnalyzerControlsModel(): AnalyzerControlsModel {
  let snapshot: AnalyzerControlsSnapshot = {
    layoutsByMode: { en: [], ja: [] },
    geometryOptions: [],
    geometrySummary: '',
    geometryStatus: '',
    revision: 0,
  };
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setGeometryStatus(geometryStatus) {
      if (snapshot.geometryStatus === geometryStatus) return;
      snapshot = {
        ...snapshot,
        geometryStatus,
        revision: snapshot.revision + 1,
      };
      for (const listener of listeners) listener();
    },
    setCatalog(layoutsByMode, geometryOptions, geometrySummary) {
      if (
        sameLayouts(snapshot.layoutsByMode.en, layoutsByMode.en)
        && sameLayouts(snapshot.layoutsByMode.ja, layoutsByMode.ja)
        && sameGeometries(snapshot.geometryOptions, geometryOptions)
        && snapshot.geometrySummary === geometrySummary
      ) return;
      snapshot = {
        layoutsByMode: {
          en: [...layoutsByMode.en],
          ja: [...layoutsByMode.ja],
        },
        geometryOptions: [...geometryOptions],
        geometrySummary,
        geometryStatus: snapshot.geometryStatus,
        revision: snapshot.revision + 1,
      };
      for (const listener of listeners) listener();
    },
  };
}
