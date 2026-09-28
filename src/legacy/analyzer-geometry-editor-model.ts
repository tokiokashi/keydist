import {
  customGeometryKind,
  PHYSICAL_SHAPES,
  type Finger,
  type NonThumb,
  type PhysicalShape,
} from '#input/shapes/geometry.ts';
import {
  DEFAULT_GEOMETRY_SETTINGS,
  cloneGeometrySettings,
  clonePhysicalShape,
  parseGeometrySettings,
  serializeGeometrySettings,
} from '#input/shapes/settings.ts';
import type { AnalyzerUiStateOwner } from './analyzer-ui-state-owner.ts';
import { newId as newGeometryId } from '#input/shapes/user-geometries.ts';

export interface AnalyzerGeometryEditorSnapshot {
  userShapes: readonly PhysicalShape[];
  revision: number;
  refreshRevision: number;
}

export interface AnalyzerGeometryEditorModel {
  getSnapshot(): AnalyzerGeometryEditorSnapshot;
  subscribe(listener: () => void): () => void;
  refresh(): void;
  resetAssignment(): void;
  assignColumn(keyIds: readonly string[], finger: NonThumb): void;
  assignKey(keyId: string, finger: NonThumb): void;
  saveShape(shapeDraft: PhysicalShape, name: string, asNew: boolean): string | null;
  deleteCurrentShape(): boolean;
  exportSettings(): void;
  importSettings(file: File): Promise<void>;
}

export interface AnalyzerGeometryEditorModelContext {
  stateOwner: AnalyzerUiStateOwner;
  getUserGeometryShapes(): PhysicalShape[];
  commitUserGeometryShapes(shapes: PhysicalShape[]): void;
  onGeometryChanged(preservePlaybackCursor: boolean): void;
  setStatus(status: string): void;
  download(filename: string, content: string, type: string): void;
}

const ROW_COUNT = 4;

function cloneUserShapes(shapes: readonly PhysicalShape[]): PhysicalShape[] {
  return shapes.map((shape) => clonePhysicalShape(shape));
}

function ensureRowStagger(shape: PhysicalShape): void {
  if (!shape.rowStagger) shape.rowStagger = Array.from({ length: ROW_COUNT }, () => 0);
}

function markCustomAssignment(
  stateOwner: AnalyzerUiStateOwner,
  change: (keyFinger: Record<string, Finger>) => void,
): void {
  stateOwner.update((draft) => {
    draft.conditions.geometrySettings.assignment.id = 'custom';
    draft.conditions.geometrySettings.assignment.name = 'カスタム運指';
    change(draft.conditions.geometrySettings.assignment.keyFinger);
  });
}

/**
 * Geometry editorのdomain操作を持つheadless model。
 * shape draftや表示単位はReact local state、永続設定はAnalyzerUiStateOwnerをauthorityにする。
 */
export function createAnalyzerGeometryEditorModel(
  context: AnalyzerGeometryEditorModelContext,
): AnalyzerGeometryEditorModel {
  let snapshot: AnalyzerGeometryEditorSnapshot = {
    userShapes: cloneUserShapes(context.getUserGeometryShapes()),
    revision: 0,
    refreshRevision: 0,
  };
  const listeners = new Set<() => void>();

  const emit = (refresh: boolean) => {
    snapshot = {
      userShapes: cloneUserShapes(context.getUserGeometryShapes()),
      revision: snapshot.revision + 1,
      refreshRevision: snapshot.refreshRevision + (refresh ? 1 : 0),
    };
    for (const listener of listeners) listener();
  };

  const applyShape = (shape: PhysicalShape): void => {
    const kind = customGeometryKind(shape.id);
    context.stateOwner.update((draft) => {
      draft.conditions.geometrySettings.shape = clonePhysicalShape(shape);
      draft.conditions.defaults.geometry = kind;
      draft.ui.input.geometry = kind;
    });
    context.onGeometryChanged(true);
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh() {
      emit(true);
    },
    resetAssignment() {
      context.stateOwner.update((draft) => {
        draft.conditions.geometrySettings.assignment =
          cloneGeometrySettings(DEFAULT_GEOMETRY_SETTINGS).assignment;
      });
      context.onGeometryChanged(false);
    },
    assignColumn(keyIds, finger) {
      markCustomAssignment(context.stateOwner, (keyFinger) => {
        for (const id of keyIds) keyFinger[id] = finger;
      });
      context.onGeometryChanged(false);
    },
    assignKey(keyId, finger) {
      markCustomAssignment(context.stateOwner, (keyFinger) => {
        keyFinger[keyId] = finger;
      });
      context.onGeometryChanged(false);
    },
    saveShape(shapeDraft, rawName, asNew) {
      const name = rawName.trim();
      if (!name) return '形状名を入力する';

      const shape = clonePhysicalShape(shapeDraft);
      ensureRowStagger(shape);
      const currentId = context.stateOwner.getSnapshot().conditions.geometrySettings.shape.id;
      const currentShapes = context.getUserGeometryShapes();
      if (asNew || !currentShapes.some((candidate) => candidate.id === currentId)) {
        shape.id = newGeometryId();
      }
      shape.name = name;

      const index = currentShapes.findIndex((candidate) => candidate.id === shape.id);
      const next = index < 0
        ? [...currentShapes, shape]
        : currentShapes.map((candidate, candidateIndex) => (
            candidateIndex === index ? shape : candidate
          ));
      context.commitUserGeometryShapes(next);
      emit(false);
      applyShape(shape);
      context.setStatus(`${shape.name}を保存した`);
      return null;
    },
    deleteCurrentShape() {
      const currentId = context.stateOwner.getSnapshot().conditions.geometrySettings.shape.id;
      const currentShapes = context.getUserGeometryShapes();
      if (!currentShapes.some((shape) => shape.id === currentId)) return false;

      context.commitUserGeometryShapes(
        currentShapes.filter((shape) => shape.id !== currentId),
      );
      emit(false);
      const fallback = clonePhysicalShape(PHYSICAL_SHAPES['row-staggered']);
      context.stateOwner.update((draft) => {
        draft.conditions.geometrySettings.shape = fallback;
        draft.conditions.defaults.geometry = 'row-staggered';
        draft.ui.input.geometry = 'row-staggered';
      });
      context.onGeometryChanged(true);
      return true;
    },
    exportSettings() {
      context.download(
        'keydist-geometry-settings.json',
        serializeGeometrySettings(context.stateOwner.getSnapshot().conditions.geometrySettings),
        'application/json',
      );
      context.setStatus('打ち手と機材の設定を書き出した');
    },
    async importSettings(file) {
      try {
        const current = context.stateOwner.getSnapshot().conditions.geometrySettings;
        const settings = parseGeometrySettings(await file.text(), current);
        const shape = clonePhysicalShape(settings.shape);
        shape.id = newGeometryId();
        ensureRowStagger(shape);
        if (shape.name === 'カスタム形状') shape.name = '読み込んだ形状';

        context.commitUserGeometryShapes([
          ...context.getUserGeometryShapes(),
          shape,
        ]);
        emit(false);
        const kind = customGeometryKind(shape.id);
        context.stateOwner.update((draft) => {
          draft.conditions.geometrySettings.assignment = settings.assignment;
          draft.conditions.geometrySettings.shape = shape;
          draft.conditions.defaults.geometry = kind;
          draft.ui.input.geometry = kind;
        });
        context.onGeometryChanged(true);
        context.setStatus('打ち手と機材の設定を読み込んだ');
      } catch (error) {
        context.setStatus(
          error instanceof Error ? error.message : '設定ファイルを読み込めない',
        );
      }
    },
  };
}
