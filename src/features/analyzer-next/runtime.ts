import {
  analyzerSlicesFromUiState,
  uiStateFromAppState,
  type AppStateV2,
} from '#app/state/app-state.ts';
import { ANALYZER_INITIAL_LAYOUTS } from '#legacy/analyzer-ui-state-bootstrap.ts';
import { ANALYZER_SAMPLES } from '#legacy/analyzer-samples.ts';
import type { PhysicalShape } from '#input/shapes/geometry.ts';
import { LAYOUTS, LAYOUTS_JA } from '#input/layouts/index.ts';
import { loadAppStateDocument } from '#app/state/app-state-storage.ts';
import type { RomajiSettings } from '#input/romaji/rules.ts';
import { loadRomajiSettings } from '#platform/assets/romaji-settings-storage.ts';
import {
  createDefaultUiState,
  sanitizeUiState,
  type UiStateChoices,
} from '#legacy/ui-state.ts';
import { load as loadUserGeometryShapes } from '#platform/assets/user-geometries-storage.ts';
import type { UserLayout } from '#input/layouts/user-layouts.ts';
import { load as loadUserLayouts } from '#platform/assets/user-layouts-storage.ts';
import {
  createMutableAnalysisDomainCatalog,
  type AnalysisDomainCatalogSource,
  type MutableAnalysisDomainCatalog,
} from './domain-catalog.ts';
import { createResolvedAnalysisInputResolver } from './resolved-input.ts';
import { analysisSessionSeedFromAppState } from './session-app-state.ts';
import {
  createAnalysisSessionStore,
  type AnalysisDistanceConditions,
  type AnalysisDistanceOverrideConditions,
  type AnalysisSessionState,
  type AnalysisSessionStore,
  type AnalysisTimingConditions,
  type AnalysisTimingOverrideConditions,
} from './session-store.ts';
import { computeAnalysisSnapshot, type AnalysisSnapshot, type ResolvedAnalysisInput } from './snapshot-computation.ts';
import { createAnalysisSnapshotReader } from './snapshot-reader.ts';
import {
  createAnalysisSnapshotService,
  type AnalysisSnapshotService,
} from './snapshot-service.ts';
import type { AnalysisSessionCommands, AnalysisSnapshotReader } from './views/view-contract.ts';

export interface AnalysisRuntimeSource {
  appState: AppStateV2;
  userLayouts: readonly UserLayout[];
  userGeometryShapes: readonly PhysicalShape[];
  romajiSettings: RomajiSettings;
}

export interface AnalysisRuntime {
  session: AnalysisSessionStore;
  catalog: MutableAnalysisDomainCatalog;
  snapshots: AnalysisSnapshotService<ResolvedAnalysisInput, AnalysisSnapshot>;
  commands: AnalysisSessionCommands;
  createReader(session: AnalysisSessionState): AnalysisSnapshotReader;
}

function choicesFor(userLayouts: readonly UserLayout[]): UiStateChoices {
  const userIds = userLayouts.map((layout) => layout.id);
  const ids = (layouts: readonly { id: string }[]) =>
    [...new Set([...layouts.map((layout) => layout.id), ...userIds])];

  return {
    layouts: {
      en: ids(LAYOUTS),
      ja: ids(LAYOUTS_JA),
    },
    samples: {
      en: Object.keys(ANALYZER_SAMPLES.en),
      ja: Object.keys(ANALYZER_SAMPLES.ja),
    },
  };
}

export function normalizeAnalysisRuntimeSource(source: AnalysisRuntimeSource): {
  appState: AppStateV2;
  geometrySettings: ReturnType<typeof createDefaultUiState>['conditions']['geometrySettings'];
} {
  const fallback = createDefaultUiState({
    textPanelOpen: true,
    usePlaybackCalibration: false,
    selectedLayouts: ANALYZER_INITIAL_LAYOUTS,
  });
  const ui = sanitizeUiState(
    uiStateFromAppState(source.appState, fallback),
    fallback,
    choicesFor(source.userLayouts),
  );

  return {
    appState: {
      version: source.appState.version,
      ...analyzerSlicesFromUiState(ui),
    },
    geometrySettings: ui.conditions.geometrySettings,
  };
}

type DistanceDefaultCommand = {
  [K in keyof AnalysisDistanceConditions]-?: {
    key: K;
    value: AnalysisDistanceConditions[K];
  }
}[keyof AnalysisDistanceConditions];

type DistanceOverrideCommand = {
  [K in keyof AnalysisDistanceOverrideConditions]-?: {
    key: K;
    value: AnalysisDistanceOverrideConditions[K] | undefined;
  }
}[keyof AnalysisDistanceOverrideConditions];

type TimingDefaultCommand = {
  [K in keyof AnalysisTimingConditions]-?: {
    key: K;
    value: AnalysisTimingConditions[K];
  }
}[keyof AnalysisTimingConditions];

type TimingOverrideCommand = {
  [K in keyof AnalysisTimingOverrideConditions]-?: {
    key: K;
    value: AnalysisTimingOverrideConditions[K] | undefined;
  }
}[keyof AnalysisTimingOverrideConditions];

function setDistanceDefaultCommand<K extends keyof AnalysisDistanceConditions>(
  session: AnalysisSessionStore,
  command: { key: K; value: AnalysisDistanceConditions[K] },
): void {
  session.setDistanceDefault(command.key, command.value);
}

function setDistanceOverrideCommand(
  session: AnalysisSessionStore,
  layoutId: string,
  command: DistanceOverrideCommand,
): void {
  switch (command.key) {
    case 'geometry':
      session.setDistanceOverride(layoutId, 'geometry', command.value);
      return;
    case 'windowSize':
      session.setDistanceOverride(layoutId, 'windowSize', command.value);
      return;
    case 'sfbHomeCost':
      session.setDistanceOverride(layoutId, 'sfbHomeCost', command.value);
      return;
    case 'preferOppositeThumb':
      session.setDistanceOverride(layoutId, 'preferOppositeThumb', command.value);
      return;
    case 'chain':
      session.setDistanceOverride(layoutId, 'chain', command.value);
      return;
    case 'arpeggioPolicy':
      session.setDistanceOverride(layoutId, 'arpeggioPolicy', command.value);
      return;
    case 'triggerRealization':
      session.setDistanceOverride(layoutId, 'triggerRealization', command.value);
      return;
    case 'actionRealization':
      session.setDistanceOverride(layoutId, 'actionRealization', command.value);
      return;
    case 'romajiRule':
      session.setDistanceOverride(layoutId, 'romajiRule', command.value);
      return;
  }
}

function setTimingDefaultCommand<K extends keyof AnalysisTimingConditions>(
  session: AnalysisSessionStore,
  command: { key: K; value: AnalysisTimingConditions[K] },
): void {
  session.setTimingDefault(command.key, command.value);
}

function setTimingOverrideCommand<K extends keyof AnalysisTimingOverrideConditions>(
  session: AnalysisSessionStore,
  layoutId: string,
  command: { key: K; value: AnalysisTimingOverrideConditions[K] | undefined },
): void {
  session.setTimingOverride(layoutId, command.key, command.value);
}

function createCommands(
  session: AnalysisSessionStore,
  catalog: MutableAnalysisDomainCatalog,
): AnalysisSessionCommands {
  return {
    setFocus(layoutId) {
      session.setFocus(layoutId);
    },
    addSelectedLayout(mode, layoutId) {
      const current = session.getSnapshot();
      if (current.mode !== mode) return;
      if (!catalog.availableLayoutIdsByMode()[mode].includes(layoutId)) return;
      if (current.selectedLayoutIds.includes(layoutId)) return;
      session.setSelectedLayouts([...current.selectedLayoutIds, layoutId]);
    },
    setDistanceCondition(command) {
      if (command.scope.kind === 'default') {
        setDistanceDefaultCommand(session, command as DistanceDefaultCommand);
        return;
      }
      setDistanceOverrideCommand(
        session,
        command.scope.layoutId,
        command as DistanceOverrideCommand,
      );
    },
    setTimingCondition(command) {
      if (command.scope.kind === 'default') {
        setTimingDefaultCommand(session, command as TimingDefaultCommand);
        return;
      }
      setTimingOverrideCommand(
        session,
        command.scope.layoutId,
        command as TimingOverrideCommand,
      );
    },
  };
}

/**
 * Analyzer Next application runtime.
 *
 * Browser/storage concerns enter only through AnalysisRuntimeSource. Session, resolver and
 * Snapshot cache stay explicit and are shared by standalone routes and the future Workspace.
 */
export function createAnalysisRuntime(source: AnalysisRuntimeSource): AnalysisRuntime {
  const normalized = normalizeAnalysisRuntimeSource(source);
  const session = createAnalysisSessionStore(
    analysisSessionSeedFromAppState(normalized.appState),
  );
  const catalog = createMutableAnalysisDomainCatalog({
    userLayouts: source.userLayouts,
    userGeometryShapes: source.userGeometryShapes,
    romajiSettings: source.romajiSettings,
    geometrySettings: normalized.geometrySettings,
  });
  const resolve = createResolvedAnalysisInputResolver({
    getSession: session.getSnapshot,
    layoutsForMode: catalog.layoutsForMode,
    geometryForKind: catalog.geometryForKind,
  });
  const snapshots = createAnalysisSnapshotService({
    resolve,
    evaluate: computeAnalysisSnapshot,
  });

  return {
    session,
    catalog,
    snapshots,
    commands: createCommands(session, catalog),
    createReader(current) {
      return createAnalysisSnapshotReader({
        session: current,
        layoutsForMode: catalog.layoutsForMode,
        geometryForKind: catalog.geometryForKind,
        snapshots,
      });
    },
  };
}

export function analysisDomainCatalogSourceFromRuntimeSource(
  source: AnalysisRuntimeSource,
): AnalysisDomainCatalogSource {
  const normalized = normalizeAnalysisRuntimeSource(source);
  return {
    userLayouts: source.userLayouts,
    userGeometryShapes: source.userGeometryShapes,
    romajiSettings: source.romajiSettings,
    geometrySettings: normalized.geometrySettings,
  };
}

/**
 * Browser-only source reader. Storage is kept at the platform composition boundary.
 */
export function loadBrowserAnalysisRuntimeSource(): AnalysisRuntimeSource {
  if (typeof window === 'undefined') {
    throw new Error('loadBrowserAnalysisRuntimeSource must run in a browser');
  }
  return {
    appState: loadAppStateDocument(window.localStorage),
    userLayouts: loadUserLayouts(),
    userGeometryShapes: loadUserGeometryShapes(window.localStorage),
    romajiSettings: loadRomajiSettings(),
  };
}

/**
 * Browser-only composition root. Call after mount so SSR/prerender never reads localStorage.
 */
export function createBrowserAnalysisRuntime(): AnalysisRuntime {
  return createAnalysisRuntime(loadBrowserAnalysisRuntimeSource());
}
