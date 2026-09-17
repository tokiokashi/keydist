import type { MatrixSort } from './chart.ts';
import type { GeometryKind } from './geometry.ts';
import type { ModeId } from './layout-selection.ts';
import {
  DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
  DEFAULT_PLAYBACK_STEPS_PER_SECOND,
  PLAYBACK_SPEED_MULTIPLIER_MAX,
  PLAYBACK_SPEED_MULTIPLIER_MIN,
  PLAYBACK_STEPS_PER_SECOND_MAX,
  PLAYBACK_STEPS_PER_SECOND_MIN,
} from './playback.ts';
import type { ThemeChoice } from './theme.ts';

export const UI_STATE_STORAGE_KEY = 'keydist:ui-state';
export const UI_STATE_VERSION = 1;
export const MAX_SAVED_TEXT_LENGTH = 100_000;

export const LEGACY_THEME_KEY = 'keydist:theme';
export const LEGACY_SELECTION_KEY = 'keydist:selected-layouts';
export const LEGACY_TEXT_COLLAPSED_KEY = 'keydist:text-collapsed';

export type MatrixKind = 'press' | 'finger' | 'adjacentMean' | 'adjacentStdDev';
export type LayerView = 'auto' | 'side-by-side' | 'tabs';
export type LayerColorScale = 'linear' | 'log';
export type SensitivityScale = 'relative' | 'absolute';

export interface UiStateV1 {
  version: typeof UI_STATE_VERSION;
  theme: ThemeChoice;
  input: {
    mode: ModeId;
    geometry: GeometryKind;
    windowSize: number;
    sfbHomeCost: boolean;
    preferOppositeThumb: boolean;
    selectedSampleByMode: Record<ModeId, string>;
    customText?: string;
  };
  layouts: {
    selectedByMode: Record<ModeId, string[]>;
    detailByMode: Partial<Record<ModeId, string>>;
  };
  comparison: {
    baselineByMode: Partial<Record<ModeId, string>>;
    chartColumn: number;
    sort: MatrixSort | null;
    matrixSorts: Record<MatrixKind, MatrixSort | null>;
  };
  sensitivity: {
    scale: SensitivityScale;
  };
  layers: {
    view: LayerView;
    activeTab: number;
    colorScale: LayerColorScale;
    naginataDetail: boolean;
  };
  playback: {
    showFingers: boolean;
    showRomajiPlan: boolean;
    showPlanKeys: boolean;
    showTrail: boolean;
    trailTau: number;
    showOrderLabels: boolean;
    sameFingerDelay: boolean;
    useCalibration: boolean;
    showChain: boolean;
    chainIncludeSameFinger: boolean;
    chainIncludeLayerKeys: boolean;
    scale: number;
    stepsPerSecond: number;
    speedMultiplier: number;
  };
  panels: {
    addLayout: boolean;
    text: boolean;
    sensitivity: boolean;
    playback: boolean;
    playbackRateChart: boolean;
    layerStats: boolean;
    modifierList: boolean;
    comboTable: boolean;
  };
}

export interface UiStateDefaultsOptions {
  textPanelOpen: boolean;
  usePlaybackCalibration: boolean;
  selectedLayouts: Record<ModeId, readonly string[]>;
}

export interface UiStateChoices {
  layouts: Record<ModeId, readonly string[]>;
  samples: Record<ModeId, readonly string[]>;
}

export interface UiStateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface UiStateLoadResult {
  state: UiStateV1;
  migratedLegacy: boolean;
}

export function createDefaultUiState(options: UiStateDefaultsOptions): UiStateV1 {
  return {
    version: UI_STATE_VERSION,
    theme: 'system',
    input: {
      mode: 'ja',
      geometry: 'row-staggered',
      windowSize: 3,
      sfbHomeCost: true,
      preferOppositeThumb: false,
      selectedSampleByMode: { en: 'default', ja: 'modern' },
    },
    layouts: {
      selectedByMode: {
        en: [...options.selectedLayouts.en],
        ja: [...options.selectedLayouts.ja],
      },
      detailByMode: {},
    },
    comparison: {
      baselineByMode: {},
      chartColumn: 1,
      sort: null,
      matrixSorts: {
        press: null,
        finger: null,
        adjacentMean: null,
        adjacentStdDev: null,
      },
    },
    sensitivity: { scale: 'relative' },
    layers: {
      view: 'auto',
      activeTab: 0,
      colorScale: 'linear',
      naginataDetail: false,
    },
    playback: {
      showFingers: false,
      showRomajiPlan: true,
      showPlanKeys: false,
      showTrail: false,
      trailTau: 5,
      showOrderLabels: false,
      sameFingerDelay: false,
      useCalibration: options.usePlaybackCalibration,
      showChain: false,
      chainIncludeSameFinger: false,
      chainIncludeLayerKeys: true,
      scale: 1.5,
      stepsPerSecond: DEFAULT_PLAYBACK_STEPS_PER_SECOND,
      speedMultiplier: DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
    },
    panels: {
      addLayout: false,
      text: options.textPanelOpen,
      sensitivity: false,
      playback: false,
      playbackRateChart: false,
      layerStats: false,
      modifierList: false,
      comboTable: false,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function choice<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;
}

function numberInRange(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : fallback;
}

function integerInRange(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}

function optionalId(value: unknown, allowed: readonly string[]): string | undefined {
  return typeof value === 'string' && allowed.includes(value) ? value : undefined;
}

function sort(value: unknown, fallback: MatrixSort | null, maxColumn: number): MatrixSort | null {
  if (value === null) return null;
  if (!isRecord(value)) return fallback;
  const column = value.column;
  const direction = value.direction;
  return typeof column === 'number'
    && Number.isInteger(column)
    && column >= 0
    && column <= maxColumn
    && (direction === 'asc' || direction === 'desc')
    ? { column, direction }
    : fallback;
}

/** 空配列は意図した「全解除」として残し、削除済みidだけの非空配列は既定へ戻す。 */
function selectedIds(value: unknown, allowed: readonly string[], fallback: readonly string[]): string[] {
  if (!Array.isArray(value) || !value.every((id) => typeof id === 'string')) return [...fallback];
  if (value.length === 0) return [];
  const valid = [...new Set(value.filter((id) => allowed.includes(id)))];
  return valid.length > 0 ? valid : [...fallback];
}

export function sanitizeUiState(
  value: unknown,
  defaults: UiStateV1,
  choices: UiStateChoices,
): UiStateV1 {
  if (!isRecord(value) || value.version !== UI_STATE_VERSION) return structuredClone(defaults);

  const input = record(value.input);
  const layouts = record(value.layouts);
  const selectedByMode = record(layouts.selectedByMode);
  const detailByMode = record(layouts.detailByMode);
  const comparison = record(value.comparison);
  const baselineByMode = record(comparison.baselineByMode);
  const matrixSorts = record(comparison.matrixSorts);
  const sensitivity = record(value.sensitivity);
  const layers = record(value.layers);
  const playback = record(value.playback);
  const panels = record(value.panels);
  const samples = record(input.selectedSampleByMode);
  const customText = typeof input.customText === 'string'
    && input.customText.length <= MAX_SAVED_TEXT_LENGTH
    ? input.customText
    : undefined;

  return {
    version: UI_STATE_VERSION,
    theme: choice(value.theme, ['light', 'dark', 'system'], defaults.theme),
    input: {
      mode: choice(input.mode, ['en', 'ja'], defaults.input.mode),
      geometry: choice(
        input.geometry,
        ['row-staggered', 'ortholinear', 'column-staggered'],
        defaults.input.geometry,
      ),
      windowSize: integerInRange(input.windowSize, 0, 12, defaults.input.windowSize),
      sfbHomeCost: boolean(input.sfbHomeCost, defaults.input.sfbHomeCost),
      preferOppositeThumb: boolean(input.preferOppositeThumb, defaults.input.preferOppositeThumb),
      selectedSampleByMode: {
        en: choice(samples.en, choices.samples.en, defaults.input.selectedSampleByMode.en),
        ja: choice(samples.ja, choices.samples.ja, defaults.input.selectedSampleByMode.ja),
      },
      ...(customText === undefined ? {} : { customText }),
    },
    layouts: {
      selectedByMode: {
        en: selectedIds(selectedByMode.en, choices.layouts.en, defaults.layouts.selectedByMode.en),
        ja: selectedIds(selectedByMode.ja, choices.layouts.ja, defaults.layouts.selectedByMode.ja),
      },
      detailByMode: {
        ...(optionalId(detailByMode.en, choices.layouts.en) === undefined
          ? {}
          : { en: optionalId(detailByMode.en, choices.layouts.en) }),
        ...(optionalId(detailByMode.ja, choices.layouts.ja) === undefined
          ? {}
          : { ja: optionalId(detailByMode.ja, choices.layouts.ja) }),
      },
    },
    comparison: {
      baselineByMode: {
        ...(optionalId(baselineByMode.en, choices.layouts.en) === undefined
          ? {}
          : { en: optionalId(baselineByMode.en, choices.layouts.en) }),
        ...(optionalId(baselineByMode.ja, choices.layouts.ja) === undefined
          ? {}
          : { ja: optionalId(baselineByMode.ja, choices.layouts.ja) }),
      },
      chartColumn: integerInRange(comparison.chartColumn, 0, 9, defaults.comparison.chartColumn),
      sort: sort(comparison.sort, defaults.comparison.sort, 9),
      matrixSorts: {
        press: sort(matrixSorts.press, defaults.comparison.matrixSorts.press, 9),
        finger: sort(matrixSorts.finger, defaults.comparison.matrixSorts.finger, 9),
        adjacentMean: sort(matrixSorts.adjacentMean, defaults.comparison.matrixSorts.adjacentMean, 5),
        adjacentStdDev: sort(matrixSorts.adjacentStdDev, defaults.comparison.matrixSorts.adjacentStdDev, 5),
      },
    },
    sensitivity: {
      scale: choice(sensitivity.scale, ['relative', 'absolute'], defaults.sensitivity.scale),
    },
    layers: {
      view: choice(layers.view, ['auto', 'side-by-side', 'tabs'], defaults.layers.view),
      activeTab: integerInRange(layers.activeTab, 0, 100, defaults.layers.activeTab),
      colorScale: choice(layers.colorScale, ['linear', 'log'], defaults.layers.colorScale),
      naginataDetail: boolean(layers.naginataDetail, defaults.layers.naginataDetail),
    },
    playback: {
      showFingers: boolean(playback.showFingers, defaults.playback.showFingers),
      showRomajiPlan: boolean(playback.showRomajiPlan, defaults.playback.showRomajiPlan),
      showPlanKeys: boolean(playback.showPlanKeys, defaults.playback.showPlanKeys),
      showTrail: boolean(playback.showTrail, defaults.playback.showTrail),
      trailTau: integerInRange(playback.trailTau, 1, 20, defaults.playback.trailTau),
      showOrderLabels: boolean(playback.showOrderLabels, defaults.playback.showOrderLabels),
      sameFingerDelay: boolean(playback.sameFingerDelay, defaults.playback.sameFingerDelay),
      useCalibration: boolean(playback.useCalibration, defaults.playback.useCalibration),
      showChain: boolean(playback.showChain, defaults.playback.showChain),
      chainIncludeSameFinger: boolean(
        playback.chainIncludeSameFinger,
        defaults.playback.chainIncludeSameFinger,
      ),
      chainIncludeLayerKeys: boolean(
        playback.chainIncludeLayerKeys,
        defaults.playback.chainIncludeLayerKeys,
      ),
      scale: numberInRange(playback.scale, 0.5, 4, defaults.playback.scale),
      stepsPerSecond: numberInRange(
        playback.stepsPerSecond,
        PLAYBACK_STEPS_PER_SECOND_MIN,
        PLAYBACK_STEPS_PER_SECOND_MAX,
        defaults.playback.stepsPerSecond,
      ),
      speedMultiplier: numberInRange(
        playback.speedMultiplier,
        PLAYBACK_SPEED_MULTIPLIER_MIN,
        PLAYBACK_SPEED_MULTIPLIER_MAX,
        defaults.playback.speedMultiplier,
      ),
    },
    panels: {
      addLayout: boolean(panels.addLayout, defaults.panels.addLayout),
      text: boolean(panels.text, defaults.panels.text),
      sensitivity: boolean(panels.sensitivity, defaults.panels.sensitivity),
      playback: boolean(panels.playback, defaults.panels.playback),
      playbackRateChart: boolean(panels.playbackRateChart, defaults.panels.playbackRateChart),
      layerStats: boolean(panels.layerStats, defaults.panels.layerStats),
      modifierList: boolean(panels.modifierList, defaults.panels.modifierList),
      comboTable: boolean(panels.comboTable, defaults.panels.comboTable),
    },
  };
}

function legacyState(storage: UiStateStorage, defaults: UiStateV1): UiStateV1 | undefined {
  let found = false;
  const state = structuredClone(defaults);

  const theme = storage.getItem(LEGACY_THEME_KEY);
  if (theme !== null) {
    found = true;
    state.theme = choice(theme, ['light', 'dark', 'system'], state.theme);
  }

  const collapsed = storage.getItem(LEGACY_TEXT_COLLAPSED_KEY);
  if (collapsed !== null) {
    found = true;
    if (collapsed === 'true' || collapsed === 'false') state.panels.text = collapsed !== 'true';
  }

  const selection = storage.getItem(LEGACY_SELECTION_KEY);
  if (selection !== null) {
    found = true;
    try {
      const parsed = record(JSON.parse(selection));
      for (const mode of ['en', 'ja'] as const) {
        if (Array.isArray(parsed[mode]) && parsed[mode].every((id) => typeof id === 'string')) {
          state.layouts.selectedByMode[mode] = parsed[mode];
        }
      }
    } catch {
      // 壊れた旧形式は既定値のまま移行する
    }
  }
  return found ? state : undefined;
}

export function saveUiState(storage: UiStateStorage | undefined, state: UiStateV1): boolean {
  if (!storage) return false;
  try {
    const saved = structuredClone(state);
    if (saved.input.customText !== undefined
      && saved.input.customText.length > MAX_SAVED_TEXT_LENGTH) {
      delete saved.input.customText;
    }
    storage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(saved));
    return true;
  } catch {
    return false;
  }
}

export function loadUiState(
  storage: UiStateStorage | undefined,
  defaults: UiStateV1,
  choices: UiStateChoices,
): UiStateLoadResult {
  if (!storage) return { state: structuredClone(defaults), migratedLegacy: false };
  try {
    const raw = storage.getItem(UI_STATE_STORAGE_KEY);
    if (raw !== null) {
      return { state: sanitizeUiState(JSON.parse(raw), defaults, choices), migratedLegacy: false };
    }

    const legacy = legacyState(storage, defaults);
    if (!legacy) return { state: structuredClone(defaults), migratedLegacy: false };
    const state = sanitizeUiState(legacy, defaults, choices);
    if (!saveUiState(storage, state)) return { state, migratedLegacy: false };
    for (const key of [LEGACY_THEME_KEY, LEGACY_SELECTION_KEY, LEGACY_TEXT_COLLAPSED_KEY]) {
      try {
        storage.removeItem(key);
      } catch {
        // 新形式の保存は完了している。旧キーの掃除に失敗しても復元結果は維持する
      }
    }
    return { state, migratedLegacy: true };
  } catch {
    return { state: structuredClone(defaults), migratedLegacy: false };
  }
}
