import {
  createAppStateSliceScheduler,
  loadOrMigrateAppStateSlice,
  patchAppStateSlice,
  type AppStateSliceScheduler,
} from '#app/state/app-state-storage.ts';
import type { KeyValueStorage } from '#platform/persistence/storage.ts';
import { decodeVersionedState } from '#platform/persistence/versioned-state.ts';
import type {
  PanelId,
  WorkspacePanelDefinition,
  WorkspacePanelRegistry,
} from './panel-registry.ts';
import { clampPanelRectToViewport, type ViewportSize } from './viewport-clamp.ts';
import {
  compactWorkspacePanels,
  createWorkspaceState,
  WORKSPACE_STATE_VERSION,
  type PanelMode,
  type PanelRect,
  type WorkspacePanels,
  type WorkspacePanelState,
  type WorkspaceStateV1,
} from './workspace-state.ts';

/** AppStateV2移行元。Phase 8以降はこのkeyへ書かない。 */
export const WORKSPACE_STORAGE_KEY = 'keydist:workspace-state';

function isPanelRect(value: unknown): value is PanelRect {
  if (typeof value !== 'object' || value === null) return false;
  const rect = value as Partial<PanelRect>;
  return typeof rect.x === 'number' && typeof rect.y === 'number'
    && typeof rect.width === 'number' && typeof rect.height === 'number';
}

function isPanelMode(value: unknown): value is PanelMode {
  return value === 'docked' || value === 'floating';
}

/**
 * 生JSONの1パネル分を検査しつつ、未知フィールドを落として最小形へ整える。
 * floating ⇒ rect必須の不変条件はここで崩れたものを docked へ倒す。
 */
function sanitizePanelState(value: unknown): WorkspacePanelState | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.visible !== 'boolean' || !isPanelMode(raw.mode)) return undefined;

  const rect = isPanelRect(raw.rect) ? raw.rect : undefined;
  const mode: PanelMode = raw.mode === 'floating' && rect === undefined ? 'docked' : raw.mode;

  return {
    visible: raw.visible,
    mode,
    ...(rect === undefined ? {} : { rect }),
    ...(typeof raw.dockSlot === 'string' ? { dockSlot: raw.dockSlot } : {}),
  };
}

interface SavedWorkspaceShape {
  version: number;
  panels: Record<string, unknown>;
  zOrder: unknown[];
}

function isSavedWorkspaceShape(value: unknown): value is SavedWorkspaceShape {
  if (typeof value !== 'object' || value === null) return false;
  const raw = value as Record<string, unknown>;
  return typeof raw.panels === 'object' && raw.panels !== null && !Array.isArray(raw.panels)
    && Array.isArray(raw.zOrder);
}

/**
 * canHide: false のパネルは常に表示。viewportへのクランプは
 * registryが持つパネル毎の最小サイズを尊重する（未登録＝dormantならクランプのみ行う）。
 */
function normalizeAgainstRegistry(
  panel: WorkspacePanelState,
  definition: WorkspacePanelDefinition | undefined,
  viewport: ViewportSize,
): WorkspacePanelState {
  const visible = definition?.canHide === false ? true : panel.visible;
  if (panel.mode !== 'floating' || panel.rect === undefined) {
    return { ...panel, visible };
  }
  const rect = clampPanelRectToViewport(panel.rect, viewport, {
    minWidth: definition?.minWidth,
    minHeight: definition?.minHeight,
  });
  return { ...panel, visible, rect };
}

/**
 * 保存済みJSONをデコードする。バージョン不一致・壊れたJSON・構造不一致は
 * すべて例外を投げず、現在のdefinitionsから作った既定値へ落ちる。
 *
 * definitionsに無いidのうち input.layer:* だけをbounded dormant stateとして残す。
 * 未知/廃止済み静的idはpruneする。zOrderには現在のdefinitionsにあるidだけを載せ、
 * 足りないものは既定順で補う。
 */
export function decodeWorkspaceState(
  raw: string | null,
  definitions: readonly WorkspacePanelDefinition[],
  registry: WorkspacePanelRegistry,
  viewport: ViewportSize,
): WorkspaceStateV1 {
  const fallback = createWorkspaceState(definitions);
  const decoded = decodeVersionedState(raw, WORKSPACE_STATE_VERSION, isSavedWorkspaceShape);
  if (decoded.status !== 'ok') return fallback;

  const definitionIds = new Set(definitions.map((definition) => definition.id));
  const panels: WorkspacePanels = { ...fallback.panels };

  for (const [id, rawPanel] of Object.entries(decoded.value.panels)) {
    const sanitized = sanitizePanelState(rawPanel);
    if (sanitized === undefined) continue;
    panels[id as PanelId] = normalizeAgainstRegistry(sanitized, registry.get(id), viewport);
  }

  // 保存されたzOrderは同じidが複数回入る場合がある（旧バージョンの書き込み不具合等）。
  // indexOfでz-indexを引くため、重複が残ると先頭以降のidが無視されてしまう。
  // 初出だけを残して順序は保つ。
  const zOrder: PanelId[] = [];
  const seenIds = new Set<PanelId>();
  for (const id of decoded.value.zOrder) {
    if (typeof id !== 'string' || !definitionIds.has(id) || seenIds.has(id)) continue;
    seenIds.add(id);
    zOrder.push(id);
  }
  for (const id of fallback.zOrder) {
    if (!seenIds.has(id)) {
      seenIds.add(id);
      zOrder.push(id);
    }
  }

  return {
    version: WORKSPACE_STATE_VERSION,
    panels: compactWorkspacePanels(panels, definitionIds),
    zOrder,
  };
}

export function serializeWorkspaceState(state: WorkspaceStateV1): string {
  return JSON.stringify(state);
}

/** storage.getItem自体が例外を投げる環境（プライベートモード等）でも既定値へ倒す */
export function loadWorkspaceState(
  storage: KeyValueStorage,
  definitions: readonly WorkspacePanelDefinition[],
  registry: WorkspacePanelRegistry,
  viewport: ViewportSize,
): WorkspaceStateV1 {
  return loadOrMigrateAppStateSlice(storage, 'workspace', {
    decode: (value) => decodeWorkspaceState(JSON.stringify(value), definitions, registry, viewport),
    loadLegacy: () => {
      let raw: string | null;
      try {
        raw = storage.getItem(WORKSPACE_STORAGE_KEY);
      } catch {
        raw = null;
      }
      return decodeWorkspaceState(raw, definitions, registry, viewport);
    },
    legacyKeys: [WORKSPACE_STORAGE_KEY],
  });
}

export function saveWorkspaceState(storage: KeyValueStorage, state: WorkspaceStateV1): void {
  patchAppStateSlice(storage, 'workspace', state);
}

/**
 * window resize時に全floatingパネルをviewport内へ再クランプする。
 * 変化が無ければ同一参照を返し、無駄な再レンダーを避ける。
 */
export function clampAllFloatingPanels(
  state: WorkspaceStateV1,
  registry: WorkspacePanelRegistry,
  viewport: ViewportSize,
): WorkspaceStateV1 {
  let changed = false;
  const panels: WorkspacePanels = { ...state.panels };

  for (const [id, panel] of Object.entries(state.panels)) {
    if (panel === undefined || panel.mode !== 'floating' || panel.rect === undefined) continue;
    const definition = registry.get(id);
    const clamped = clampPanelRectToViewport(panel.rect, viewport, {
      minWidth: definition?.minWidth,
      minHeight: definition?.minHeight,
    });
    const rect = panel.rect;
    if (
      clamped.x !== rect.x || clamped.y !== rect.y
      || clamped.width !== rect.width || clamped.height !== rect.height
    ) {
      panels[id as PanelId] = { ...panel, rect: clamped };
      changed = true;
    }
  }

  return changed ? { ...state, panels } : state;
}

export type WorkspacePersistenceScheduler = AppStateSliceScheduler<WorkspaceStateV1>;

export interface WorkspacePersistenceSchedulerOptions {
  storage: KeyValueStorage;
  debounceMs?: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

/**
 * pointermoveのたびにlocalStorageへ書かないための書き込みコアレッシング。
 * 直列化した値が前回と同じなら書かない（drag終了後の同一位置への再通知等）。
 * debounce本体は汎用スケジューラ（src/persistence/debounced-scheduler.ts）に括り出してある。
 */
export function createWorkspacePersistenceScheduler(
  options: WorkspacePersistenceSchedulerOptions,
): WorkspacePersistenceScheduler {
  return createAppStateSliceScheduler(
    options.storage,
    'workspace',
    serializeWorkspaceState,
    options.debounceMs,
  );
}
