import type { MatrixSort } from './chart.ts';
import {
  DEFAULT_CHAIN_POLICY,
  chainPolicyFromLegacyUi,
  type ChainPolicy,
} from './analysis-chain.ts';
import {
  DEFAULT_ARPEGGIO_POLICY,
  type ArpeggioPolicy,
} from './analysis-arpeggio.ts';
import { isCustomGeometryKind, isPresetGeometryKind, type GeometryKind } from './geometry.ts';
import {
  DEFAULT_GEOMETRY_SETTINGS,
  cloneGeometrySettings,
  sanitizeGeometrySettings,
  type GeometrySettings,
} from './geometry-settings.ts';
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
import {
  DEFAULT_TRIGGER_REALIZATION_POLICY,
  type TriggerRealizationPolicy,
} from './trigger-realization.ts';
import {
  DEFAULT_HOLD_START_ACTION_POLICY,
  type HoldStartActionPolicy,
} from './hold-start-action.ts';

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

export interface UiStateConditionsDefaults {
  geometry: GeometryKind;
  windowSize: number;
  sfbHomeCost: boolean;
  preferOppositeThumb: boolean;
  chain: ChainPolicy;
  arpeggioPolicy: ArpeggioPolicy;
  triggerRealization: TriggerRealizationPolicy;
  holdStartAction: HoldStartActionPolicy;
}

export interface UiPlaybackState {
  showFingers: boolean;
  showRomajiPlan: boolean;
  showPlanKeys: boolean;
  showTrail: boolean;
  trailTau: number;
  showOrderLabels: boolean;
  showSameFingerMotion: boolean;
  sameFingerDelay: boolean;
  useCalibration: boolean;
  showChain: boolean;
  showArpeggio: boolean;
  scale: number;
  stepsPerSecond: number;
  speedMultiplier: number;
}

/** 配列ごとに既定値から上書きする差分。空のplaybackは個別設定の有効化を表す。 */
export interface UiStateLayoutConditions extends Partial<UiStateConditionsDefaults> {
  romajiRule?: string;
  playback?: Partial<UiPlaybackState>;
}

/** main 側の呼び出しとの互換名。保存形式は UiStateLayoutConditions に統一する。 */
export type UiStateConditionOverride = UiStateLayoutConditions;

/** 数値計算へ影響する条件の既定値。説明・保存・計算で同じ値を参照する。 */
export const DEFAULT_CONDITION_DEFAULTS: UiStateConditionsDefaults = {
  geometry: 'row-staggered',
  windowSize: 3,
  sfbHomeCost: true,
  preferOppositeThumb: false,
  chain: { ...DEFAULT_CHAIN_POLICY },
  arpeggioPolicy: { ...DEFAULT_ARPEGGIO_POLICY },
  triggerRealization: { ...DEFAULT_TRIGGER_REALIZATION_POLICY },
  holdStartAction: { ...DEFAULT_HOLD_START_ACTION_POLICY },
};

export interface UiStateV1 {
  version: typeof UI_STATE_VERSION;
  ui: {
    theme: ThemeChoice;
    input: {
      mode: ModeId;
      geometry: GeometryKind;
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
    playback: UiPlaybackState;
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
  };
  conditions: {
    defaults: UiStateConditionsDefaults;
    geometrySettings: GeometrySettings;
    perLayout: Record<string, UiStateLayoutConditions>;
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
  migratedArpeggioModel: boolean;
}

export function createDefaultUiState(options: UiStateDefaultsOptions): UiStateV1 {
  return {
    version: UI_STATE_VERSION,
    ui: {
      theme: 'system',
      input: {
        mode: 'ja',
        geometry: 'row-staggered',
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
        showSameFingerMotion: false,
        sameFingerDelay: true,
        useCalibration: options.usePlaybackCalibration,
        showChain: false,
        showArpeggio: false,
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
    },
    conditions: {
      defaults: { ...DEFAULT_CONDITION_DEFAULTS },
      geometrySettings: cloneGeometrySettings(DEFAULT_GEOMETRY_SETTINGS),
      perLayout: {},
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

function chainPolicy(value: unknown, fallback: ChainPolicy): ChainPolicy {
  const source = record(value);
  return {
    breakOnSameFinger: boolean(source.breakOnSameFinger, fallback.breakOnSameFinger),
    breakOnTriggerOnly: boolean(source.breakOnTriggerOnly, fallback.breakOnTriggerOnly),
    breakOnOppositeHandSimultaneous: boolean(
      source.breakOnOppositeHandSimultaneous,
      fallback.breakOnOppositeHandSimultaneous,
    ),
  };
}

function arpeggioPolicy(value: unknown, fallback: ArpeggioPolicy): ArpeggioPolicy {
  const source = record(value);
  return {
    includeThumb: boolean(source.includeThumb, fallback.includeThumb),
    bridgeSameFinger: boolean(source.bridgeSameFinger, fallback.bridgeSameFinger),
    includeSingleRedirectTail: boolean(
      source.includeSingleRedirectTail,
      fallback.includeSingleRedirectTail,
    ),
  };
}

function triggerRealizationPolicy(
  value: unknown,
  fallback: TriggerRealizationPolicy,
): TriggerRealizationPolicy {
  const source = record(value);
  return {
    useHold: boolean(source.useHold, fallback.useHold),
  };
}

function holdStartActionPolicy(
  value: unknown,
  fallback: HoldStartActionPolicy,
): HoldStartActionPolicy {
  const source = record(value);
  return {
    countAsSeparateStep: boolean(source.countAsSeparateStep, fallback.countAsSeparateStep),
  };
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

function validConditionValues(value: unknown): Partial<UiStateConditionsDefaults> {
  const source = record(value);
  const result: Partial<UiStateConditionsDefaults> = {};
  if (isCustomGeometryKind(source.geometry) || isPresetGeometryKind(source.geometry)) {
    result.geometry = source.geometry as GeometryKind;
  }
  if (typeof source.windowSize === 'number'
    && Number.isInteger(source.windowSize)
    && source.windowSize >= 0
    && source.windowSize <= 12) {
    result.windowSize = source.windowSize;
  }
  if (typeof source.sfbHomeCost === 'boolean') result.sfbHomeCost = source.sfbHomeCost;
  if (typeof source.preferOppositeThumb === 'boolean') {
    result.preferOppositeThumb = source.preferOppositeThumb;
  }
  if (isRecord(source.chain)) {
    result.chain = chainPolicy(source.chain, DEFAULT_CHAIN_POLICY);
  }
  if (isRecord(source.arpeggioPolicy)) {
    result.arpeggioPolicy = arpeggioPolicy(source.arpeggioPolicy, DEFAULT_ARPEGGIO_POLICY);
  }
  if (isRecord(source.triggerRealization)) {
    result.triggerRealization = triggerRealizationPolicy(
      source.triggerRealization,
      DEFAULT_TRIGGER_REALIZATION_POLICY,
    );
  }
  if (isRecord(source.holdStartAction)) {
    result.holdStartAction = holdStartActionPolicy(
      source.holdStartAction,
      DEFAULT_HOLD_START_ACTION_POLICY,
    );
  }
  // 旧ArpeggioConditionsから意味が一致するincludeThumbだけ移行する。
  // geometry閾値 / breakOnOppositeHandは新structural Policyへ推測変換しない。
  if (isRecord(source.arpeggio) && typeof source.arpeggio.includeThumb === 'boolean') {
    result.arpeggioPolicy = {
      ...(result.arpeggioPolicy ?? DEFAULT_ARPEGGIO_POLICY),
      includeThumb: source.arpeggio.includeThumb,
    };
  }
  return result;
}

function validLayoutConditionValues(value: unknown): UiStateLayoutConditions {
  const result: UiStateLayoutConditions = validConditionValues(value);
  const source = record(value);
  if (typeof source.romajiRule === 'string' && /^[a-z0-9][a-z0-9-]*$/i.test(source.romajiRule)) {
    result.romajiRule = source.romajiRule;
  }
  return result;
}

export function sanitizeConditionDefaults(
  value: unknown,
  fallback: UiStateConditionsDefaults,
): UiStateConditionsDefaults {
  const values = validConditionValues(value);
  return {
    geometry: values.geometry ?? fallback.geometry,
    windowSize: values.windowSize ?? fallback.windowSize,
    sfbHomeCost: values.sfbHomeCost ?? fallback.sfbHomeCost,
    preferOppositeThumb: values.preferOppositeThumb ?? fallback.preferOppositeThumb,
    chain: values.chain ?? fallback.chain,
    arpeggioPolicy: values.arpeggioPolicy ?? fallback.arpeggioPolicy,
    triggerRealization: values.triggerRealization ?? fallback.triggerRealization,
    holdStartAction: values.holdStartAction ?? fallback.holdStartAction,
  };
}

function sanitizePlaybackSettings(value: unknown, fallback: UiPlaybackState): UiPlaybackState {
  const playback = record(value);
  const rawShowChain = boolean(playback.showChain, fallback.showChain);
  const legacyArpeggioDisplay = playback.arpeggioDisplay;
  const hasModernArpeggioDisplay = typeof playback.showArpeggio === 'boolean';
  // 旧形式の未保存値は旧既定値「both」として扱う。
  const legacyDisplay = choice(legacyArpeggioDisplay, ['chain', 'arpeggio', 'both'], 'both');
  const showChain = !hasModernArpeggioDisplay && legacyDisplay === 'arpeggio'
    ? false
    : rawShowChain;
  const legacyShowArpeggio = rawShowChain
    && legacyDisplay !== 'chain';
  return {
    showFingers: boolean(playback.showFingers, fallback.showFingers),
    showRomajiPlan: boolean(playback.showRomajiPlan, fallback.showRomajiPlan),
    showPlanKeys: boolean(playback.showPlanKeys, fallback.showPlanKeys),
    showTrail: boolean(playback.showTrail, fallback.showTrail),
    trailTau: integerInRange(playback.trailTau, 1, 20, fallback.trailTau),
    showOrderLabels: boolean(playback.showOrderLabels, fallback.showOrderLabels),
    showSameFingerMotion: boolean(playback.showSameFingerMotion, fallback.showSameFingerMotion),
    sameFingerDelay: boolean(playback.sameFingerDelay, fallback.sameFingerDelay),
    useCalibration: boolean(playback.useCalibration, fallback.useCalibration),
    showChain,
    // arpeggioDisplayは旧保存値との互換用。新しい保存値ではshowArpeggioを優先する。
    showArpeggio: boolean(
      playback.showArpeggio,
      !hasModernArpeggioDisplay
        ? legacyShowArpeggio
        : fallback.showArpeggio,
    ),
    scale: numberInRange(playback.scale, 0.5, 4, fallback.scale),
    stepsPerSecond: numberInRange(
      playback.stepsPerSecond,
      PLAYBACK_STEPS_PER_SECOND_MIN,
      PLAYBACK_STEPS_PER_SECOND_MAX,
      fallback.stepsPerSecond,
    ),
    speedMultiplier: numberInRange(
      playback.speedMultiplier,
      PLAYBACK_SPEED_MULTIPLIER_MIN,
      PLAYBACK_SPEED_MULTIPLIER_MAX,
      fallback.speedMultiplier,
    ),
  };
}

function sanitizePlaybackOverrides(
  value: unknown,
  fallback: UiPlaybackState,
): Partial<UiPlaybackState> {
  const source = record(value);
  const result: Partial<UiPlaybackState> = {};
  for (const key of Object.keys(fallback) as Array<keyof UiPlaybackState>) {
    if (!(key in source)) continue;
    const sanitized = sanitizePlaybackSettings({ [key]: source[key] }, fallback);
    Object.assign(result, { [key]: sanitized[key] });
  }
  return result;
}

export function sanitizeConditionOverrides(
  value: unknown,
  playbackFallback: UiPlaybackState,
  chainFallback: ChainPolicy = DEFAULT_CHAIN_POLICY,
): UiStateConditionOverride {
  const source = record(value);
  const result: UiStateConditionOverride = validLayoutConditionValues(value);
  if (isRecord(source.playback)) {
    // 空オブジェクトも「配列固有設定を有効にした」印として保持する。
    result.playback = sanitizePlaybackOverrides(source.playback, playbackFallback);
    // cutover時、旧chain表示設定が保存されていて新Policyが無い場合だけ、
    // 意味が一意に対応する項目をPolicyへ移す。旧フィールドは保存結果へ残さない。
    if (!isRecord(source.chain)
      && ('chainIncludeSameFinger' in source.playback || 'chainIncludeLayerKeys' in source.playback)) {
      const legacyPlayback = record(source.playback);
      result.chain = chainPolicyFromLegacyUi({
        chainIncludeSameFinger: boolean(
          legacyPlayback.chainIncludeSameFinger,
          !chainFallback.breakOnSameFinger,
        ),
        chainIncludeLayerKeys: boolean(
          legacyPlayback.chainIncludeLayerKeys,
          !chainFallback.breakOnTriggerOnly,
        ),
      }, chainFallback);
    }
  }
  return result;
}

function geometryChoice(value: unknown, fallback: GeometryKind): GeometryKind {
  return isCustomGeometryKind(value) || isPresetGeometryKind(value) ? value as GeometryKind : fallback;
}

export function sanitizeUiState(
  value: unknown,
  defaults: UiStateV1,
  choices: UiStateChoices,
): UiStateV1 {
  if (!isRecord(value) || value.version !== UI_STATE_VERSION) return structuredClone(defaults);

  const ui = record(value.ui);
  const input = record(ui.input);
  const layouts = record(ui.layouts);
  const selectedByMode = record(layouts.selectedByMode);
  const detailByMode = record(layouts.detailByMode);
  const comparison = record(ui.comparison);
  const baselineByMode = record(comparison.baselineByMode);
  const matrixSorts = record(comparison.matrixSorts);
  const sensitivity = record(ui.sensitivity);
  const layers = record(ui.layers);
  const playback = record(ui.playback);
  const panels = record(ui.panels);
  const conditions = record(value.conditions);
  const conditionDefaults = record(conditions.defaults);
  const conditionPerLayout = record(conditions.perLayout);
  const samples = record(input.selectedSampleByMode);
  const customText = typeof input.customText === 'string'
    && input.customText.length <= MAX_SAVED_TEXT_LENGTH
    ? input.customText
    : undefined;
  const allowedLayoutIds = new Set([...choices.layouts.en, ...choices.layouts.ja]);
  const sanitizedPlayback = sanitizePlaybackSettings(playback, defaults.ui.playback);
  const sanitizedConditionDefaults = sanitizeConditionDefaults({
    ...conditionDefaults,
    // v1では物理形状がui.inputにだけ保存されていたため、未保存なら旧値を引き継ぐ。
    geometry: conditionDefaults.geometry ?? input.geometry,
  }, defaults.conditions.defaults);
  if (!isRecord(conditionDefaults.chain)
    && ('chainIncludeSameFinger' in playback || 'chainIncludeLayerKeys' in playback)) {
    sanitizedConditionDefaults.chain = chainPolicyFromLegacyUi({
      chainIncludeSameFinger: boolean(
        playback.chainIncludeSameFinger,
        !sanitizedConditionDefaults.chain.breakOnSameFinger,
      ),
      chainIncludeLayerKeys: boolean(
        playback.chainIncludeLayerKeys,
        !sanitizedConditionDefaults.chain.breakOnTriggerOnly,
      ),
    }, sanitizedConditionDefaults.chain);
  }
  const perLayout: Record<string, UiStateLayoutConditions> = {};
  for (const [layoutId, override] of Object.entries(conditionPerLayout)) {
    if (!allowedLayoutIds.has(layoutId) || !isRecord(override)) continue;
    const sanitized = sanitizeConditionOverrides(
      override,
      sanitizedPlayback,
      sanitizedConditionDefaults.chain,
    );
    // 空オブジェクトも「個別設定する」がオンだった状態として保存する。
    // チェックをオフにした時だけ、UI側がエントリ自体を削除する。
    perLayout[layoutId] = sanitized;
  }

  return {
    version: UI_STATE_VERSION,
    ui: {
      theme: choice(ui.theme, ['light', 'dark', 'system'], defaults.ui.theme),
      input: {
        mode: choice(input.mode, ['en', 'ja'], defaults.ui.input.mode),
        geometry: geometryChoice(
          input.geometry,
          defaults.ui.input.geometry,
        ),
        selectedSampleByMode: {
          en: choice(samples.en, choices.samples.en, defaults.ui.input.selectedSampleByMode.en),
          ja: choice(samples.ja, choices.samples.ja, defaults.ui.input.selectedSampleByMode.ja),
        },
        ...(customText === undefined ? {} : { customText }),
      },
      layouts: {
        selectedByMode: {
          en: selectedIds(selectedByMode.en, choices.layouts.en, defaults.ui.layouts.selectedByMode.en),
          ja: selectedIds(selectedByMode.ja, choices.layouts.ja, defaults.ui.layouts.selectedByMode.ja),
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
        chartColumn: integerInRange(comparison.chartColumn, 0, 9, defaults.ui.comparison.chartColumn),
        sort: sort(comparison.sort, defaults.ui.comparison.sort, 9),
        matrixSorts: {
          press: sort(matrixSorts.press, defaults.ui.comparison.matrixSorts.press, 9),
          finger: sort(matrixSorts.finger, defaults.ui.comparison.matrixSorts.finger, 9),
          adjacentMean: sort(matrixSorts.adjacentMean, defaults.ui.comparison.matrixSorts.adjacentMean, 5),
          adjacentStdDev: sort(matrixSorts.adjacentStdDev, defaults.ui.comparison.matrixSorts.adjacentStdDev, 5),
        },
      },
      sensitivity: {
        scale: choice(sensitivity.scale, ['relative', 'absolute'], defaults.ui.sensitivity.scale),
      },
      layers: {
        view: choice(layers.view, ['auto', 'side-by-side', 'tabs'], defaults.ui.layers.view),
        activeTab: integerInRange(layers.activeTab, 0, 100, defaults.ui.layers.activeTab),
        colorScale: choice(layers.colorScale, ['linear', 'log'], defaults.ui.layers.colorScale),
        naginataDetail: boolean(layers.naginataDetail, defaults.ui.layers.naginataDetail),
      },
      playback: sanitizedPlayback,
      panels: {
        addLayout: boolean(panels.addLayout, defaults.ui.panels.addLayout),
        text: boolean(panels.text, defaults.ui.panels.text),
        sensitivity: boolean(panels.sensitivity, defaults.ui.panels.sensitivity),
        playback: boolean(panels.playback, defaults.ui.panels.playback),
        playbackRateChart: boolean(panels.playbackRateChart, defaults.ui.panels.playbackRateChart),
        layerStats: boolean(panels.layerStats, defaults.ui.panels.layerStats),
        modifierList: boolean(panels.modifierList, defaults.ui.panels.modifierList),
        comboTable: boolean(panels.comboTable, defaults.ui.panels.comboTable),
      },
    },
    conditions: {
      defaults: sanitizedConditionDefaults,
      geometrySettings: sanitizeGeometrySettings(
        conditions.geometrySettings,
        defaults.conditions.geometrySettings,
      ),
      perLayout,
    },
  };
}

function legacyState(storage: UiStateStorage, defaults: UiStateV1): UiStateV1 | undefined {
  let found = false;
  const state = structuredClone(defaults);

  const theme = storage.getItem(LEGACY_THEME_KEY);
  if (theme !== null) {
    found = true;
    state.ui.theme = choice(theme, ['light', 'dark', 'system'], state.ui.theme);
  }

  const collapsed = storage.getItem(LEGACY_TEXT_COLLAPSED_KEY);
  if (collapsed !== null) {
    found = true;
    if (collapsed === 'true' || collapsed === 'false') state.ui.panels.text = collapsed !== 'true';
  }

  const selection = storage.getItem(LEGACY_SELECTION_KEY);
  if (selection !== null) {
    found = true;
    try {
      const parsed = record(JSON.parse(selection));
      for (const mode of ['en', 'ja'] as const) {
        if (Array.isArray(parsed[mode]) && parsed[mode].every((id) => typeof id === 'string')) {
          state.ui.layouts.selectedByMode[mode] = parsed[mode];
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
    if (saved.ui.input.customText !== undefined
      && saved.ui.input.customText.length > MAX_SAVED_TEXT_LENGTH) {
      delete saved.ui.input.customText;
    }
    storage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(saved));
    return true;
  } catch {
    return false;
  }
}

function hasArpeggioModelMigration(value: unknown): boolean {
  const root = record(value);
  const ui = record(root.ui);
  const playback = record(ui.playback);
  const conditions = record(root.conditions);
  const defaults = record(conditions.defaults);
  const perLayout = record(conditions.perLayout);

  if (isRecord(defaults.arpeggio)
    || 'arpeggioEnabled' in playback
    || 'arpeggioDelayMode' in playback) return true;

  return Object.values(perLayout).some((candidate) => {
    const override = record(candidate);
    const overridePlayback = record(override.playback);
    return isRecord(override.arpeggio)
      || 'arpeggioEnabled' in overridePlayback
      || 'arpeggioDelayMode' in overridePlayback;
  });
}

function hasCutoverModelMigration(value: unknown): boolean {
  if (hasArpeggioModelMigration(value)) return true;
  const root = record(value);
  const ui = record(root.ui);
  const playback = record(ui.playback);
  const conditions = record(root.conditions);
  const perLayout = record(conditions.perLayout);
  if ('chainIncludeSameFinger' in playback || 'chainIncludeLayerKeys' in playback) return true;
  return Object.values(perLayout).some((candidate) => {
    const overridePlayback = record(record(candidate).playback);
    return 'chainIncludeSameFinger' in overridePlayback || 'chainIncludeLayerKeys' in overridePlayback;
  });
}

export function loadUiState(
  storage: UiStateStorage | undefined,
  defaults: UiStateV1,
  choices: UiStateChoices,
): UiStateLoadResult {
  if (!storage) return {
    state: structuredClone(defaults),
    migratedLegacy: false,
    migratedArpeggioModel: false,
  };
  try {
    const raw = storage.getItem(UI_STATE_STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      const migratedArpeggioModel = hasArpeggioModelMigration(parsed);
      const migratedCutoverModel = hasCutoverModelMigration(parsed);
      const state = sanitizeUiState(parsed, defaults, choices);
      if (migratedCutoverModel) saveUiState(storage, state);
      return { state, migratedLegacy: false, migratedArpeggioModel };
    }

    const legacy = legacyState(storage, defaults);
    if (!legacy) return {
      state: structuredClone(defaults),
      migratedLegacy: false,
      migratedArpeggioModel: false,
    };
    const state = sanitizeUiState(legacy, defaults, choices);
    if (!saveUiState(storage, state)) return {
      state,
      migratedLegacy: false,
      migratedArpeggioModel: false,
    };
    for (const key of [LEGACY_THEME_KEY, LEGACY_SELECTION_KEY, LEGACY_TEXT_COLLAPSED_KEY]) {
      try {
        storage.removeItem(key);
      } catch {
        // 新形式の保存は完了している。旧キーの掃除に失敗しても復元結果は維持する
      }
    }
    return { state, migratedLegacy: true, migratedArpeggioModel: false };
  } catch {
    return {
      state: structuredClone(defaults),
      migratedLegacy: false,
      migratedArpeggioModel: false,
    };
  }
}
