import {
  createAppStateSliceScheduler,
  loadOrMigrateAppStateSlice,
  patchAppStateSlice,
  type AppStateSliceScheduler,
} from '../../persistence/app-state-storage.ts';
import type { KeyValueStorage } from '../../persistence/storage.ts';
import { decodeVersionedState } from '../../persistence/versioned-state.ts';

/*
 * Tester preferenceは#413 Phase 8でAppStateV2へ統合済み。
 * keydist:input-converter-preferences はread-once migration sourceとしてのみ残す。
 *
 * 次のstorageはUI preferenceではなくdomain/user assetなのでAppStateへ吸収しない。
 * - keydist:input-key-bindings（レガシーキー: keydist:input-thumb-key-bindings）
 * - keydist:geometry-shapes
 *
 * 現在選択中の配列と物理配列はTester全体の状態として保存し、
 * 練習環境は配列ごとに保存する。
 */

export const INPUT_CONVERTER_PREFERENCES_VERSION = 2;

/** AppStateV2移行元。Phase 8以降はこのkeyへ書かない。 */
export const INPUT_CONVERTER_PREFERENCES_STORAGE_KEY = 'keydist:input-converter-preferences';

export type InputConverterRandomPracticeMode = 'word' | 'phrase';

export interface InputConverterLayoutPreferencesV2 {
  /** 動的ガイド（打鍵候補のハイライト）の表示 */
  showDynamicGuide: boolean;
  /** レイヤーカンペ（レイヤー定義一覧パネル）の表示 */
  showLayerGuide: boolean;
  /** レイヤーキー（トリガーキーの着色）の表示 */
  showLayerKeys: boolean;
  /** Shiftキーの表示（レイアウトがShiftキーを持つ場合のみ画面に出る） */
  showShiftKeys: boolean;
  /** Text Input に入力済みの文字列 */
  inputText: string;
  /** Practice Text の現在値。ランダム練習中は現在のお題そのもの */
  practiceText: string;
  /** ランダム練習の種別。通常のPractice Textならnull */
  randomPracticeMode: InputConverterRandomPracticeMode | null;
}

export interface InputConverterPreferencesV2 {
  version: typeof INPUT_CONVERTER_PREFERENCES_VERSION;
  /** 現在選択中の配列id（src/layouts の Layout.id） */
  layoutId: string;
  /**
   * 選択中の物理配列id（プリセットの PhysicalShape.id、または自作形状のid）。
   * 物理配列は配列ごとには分けず、Tester全体で1つだけ保持する。
   */
  geometryId: string;
  /** 配列idごとの練習環境 */
  layouts: Record<string, InputConverterLayoutPreferencesV2>;
}

export interface InputConverterPreferencesDefaults {
  layoutId: string;
  geometryId: string;
  layout: InputConverterLayoutPreferencesV2;
}

/** layoutId / geometryId が現在選べる値かどうかを検査するためのカタログ。呼び出し時点のものを渡す。 */
export interface InputConverterPreferencesCatalogs {
  layoutIds: readonly string[];
  geometryIds: readonly string[];
}

interface InputConverterPreferencesV1 {
  version: 1;
  layoutId: unknown;
  geometryId: unknown;
  showDynamicGuide: unknown;
  showLayerGuide: unknown;
  showLayerKeys: unknown;
  showShiftKeys: unknown;
}

export function createDefaultInputConverterPreferences(
  defaults: InputConverterPreferencesDefaults,
): InputConverterPreferencesV2 {
  return {
    version: INPUT_CONVERTER_PREFERENCES_VERSION,
    layoutId: defaults.layoutId,
    geometryId: defaults.geometryId,
    layouts: {
      [defaults.layoutId]: { ...defaults.layout },
    },
  };
}

function isRawPreferencesShape(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeString(
  value: unknown,
  allowed: readonly string[],
  fallback: string,
): string {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

function sanitizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeText(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function sanitizeRandomPracticeMode(
  value: unknown,
  fallback: InputConverterRandomPracticeMode | null,
): InputConverterRandomPracticeMode | null {
  return value === 'word' || value === 'phrase' || value === null
    ? value
    : fallback;
}

function sanitizeLayoutPreferences(
  value: unknown,
  fallback: InputConverterLayoutPreferencesV2,
): InputConverterLayoutPreferencesV2 {
  if (!isRawPreferencesShape(value)) return { ...fallback };
  return {
    showDynamicGuide: sanitizeBoolean(value.showDynamicGuide, fallback.showDynamicGuide),
    showLayerGuide: sanitizeBoolean(value.showLayerGuide, fallback.showLayerGuide),
    showLayerKeys: sanitizeBoolean(value.showLayerKeys, fallback.showLayerKeys),
    showShiftKeys: sanitizeBoolean(value.showShiftKeys, fallback.showShiftKeys),
    inputText: sanitizeText(value.inputText, fallback.inputText),
    practiceText: sanitizeText(value.practiceText, fallback.practiceText),
    randomPracticeMode: sanitizeRandomPracticeMode(
      value.randomPracticeMode,
      fallback.randomPracticeMode,
    ),
  };
}

function migrateV1(
  value: Record<string, unknown>,
  catalogs: InputConverterPreferencesCatalogs,
  defaults: InputConverterPreferencesDefaults,
): InputConverterPreferencesV2 {
  const legacy = value as unknown as InputConverterPreferencesV1;
  const layoutId = sanitizeString(legacy.layoutId, catalogs.layoutIds, defaults.layoutId);
  const geometryId = sanitizeString(legacy.geometryId, catalogs.geometryIds, defaults.geometryId);
  return {
    version: INPUT_CONVERTER_PREFERENCES_VERSION,
    layoutId,
    geometryId,
    layouts: {
      [layoutId]: {
        ...defaults.layout,
        showDynamicGuide: sanitizeBoolean(
          legacy.showDynamicGuide,
          defaults.layout.showDynamicGuide,
        ),
        showLayerGuide: sanitizeBoolean(
          legacy.showLayerGuide,
          defaults.layout.showLayerGuide,
        ),
        showLayerKeys: sanitizeBoolean(
          legacy.showLayerKeys,
          defaults.layout.showLayerKeys,
        ),
        showShiftKeys: sanitizeBoolean(
          legacy.showShiftKeys,
          defaults.layout.showShiftKeys,
        ),
      },
    },
  };
}

/**
 * 保存済みJSONをデコードする。
 *
 * - V2: globalなlayoutId/geometryIdと配列ごとの練習環境をフィールド単位でsanitize
 * - V1: 同じstorage key上でV2へ1世代だけmigration
 * - 壊れたJSON / 未知version / 構造不一致: defaultsへfallback
 */
export function decodeInputConverterPreferences(
  raw: string | null,
  catalogs: InputConverterPreferencesCatalogs,
  defaults: InputConverterPreferencesDefaults,
): InputConverterPreferencesV2 {
  const fallback = createDefaultInputConverterPreferences(defaults);
  const decoded = decodeVersionedState(
    raw,
    INPUT_CONVERTER_PREFERENCES_VERSION,
    isRawPreferencesShape,
  );

  if (decoded.status === 'unsupported-version' && decoded.version === 1) {
    return migrateV1(decoded.value, catalogs, defaults);
  }
  if (decoded.status !== 'ok') return fallback;

  const value = decoded.value;
  const layoutId = sanitizeString(value.layoutId, catalogs.layoutIds, fallback.layoutId);
  const geometryId = sanitizeString(value.geometryId, catalogs.geometryIds, fallback.geometryId);
  const layouts: Record<string, InputConverterLayoutPreferencesV2> = {};

  if (isRawPreferencesShape(value.layouts)) {
    for (const candidateLayoutId of catalogs.layoutIds) {
      if (!(candidateLayoutId in value.layouts)) continue;
      layouts[candidateLayoutId] = sanitizeLayoutPreferences(
        value.layouts[candidateLayoutId],
        defaults.layout,
      );
    }
  }

  if (!(layoutId in layouts)) {
    layouts[layoutId] = { ...defaults.layout };
  }

  return {
    version: INPUT_CONVERTER_PREFERENCES_VERSION,
    layoutId,
    geometryId,
    layouts,
  };
}

export function inputConverterLayoutPreferences(
  prefs: InputConverterPreferencesV2,
  layoutId: string,
  fallback: InputConverterLayoutPreferencesV2,
): InputConverterLayoutPreferencesV2 {
  return prefs.layouts[layoutId] ?? { ...fallback };
}

export function serializeInputConverterPreferences(prefs: InputConverterPreferencesV2): string {
  return JSON.stringify(prefs);
}

/** storage.getItem自体が例外を投げる環境（プライベートモード等）でも既定値へ倒す */
export function loadInputConverterPreferences(
  storage: KeyValueStorage,
  catalogs: InputConverterPreferencesCatalogs,
  defaults: InputConverterPreferencesDefaults,
): InputConverterPreferencesV2 {
  return loadOrMigrateAppStateSlice(storage, 'inputConverter', {
    decode: (value) => decodeInputConverterPreferences(
      JSON.stringify(value),
      catalogs,
      defaults,
    ),
    loadLegacy: () => {
      let raw: string | null;
      try {
        raw = storage.getItem(INPUT_CONVERTER_PREFERENCES_STORAGE_KEY);
      } catch {
        raw = null;
      }
      return decodeInputConverterPreferences(raw, catalogs, defaults);
    },
    legacyKeys: [INPUT_CONVERTER_PREFERENCES_STORAGE_KEY],
  });
}

export function saveInputConverterPreferences(
  storage: KeyValueStorage,
  prefs: InputConverterPreferencesV2,
): void {
  patchAppStateSlice(storage, 'inputConverter', prefs);
}

export type InputConverterPreferencesScheduler =
  AppStateSliceScheduler<InputConverterPreferencesV2>;

export interface InputConverterPreferencesSchedulerOptions {
  storage: KeyValueStorage;
  debounceMs?: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

/**
 * トグル・入力・配列切替の連続操作でlocalStorageへ書きすぎないための書き込みコアレッシング。
 * ワークスペース永続化（src/workspace/workspace-persistence.ts）と同じ汎用スケジューラを使う。
 */
export function createInputConverterPreferencesScheduler(
  options: InputConverterPreferencesSchedulerOptions,
): InputConverterPreferencesScheduler {
  return createAppStateSliceScheduler(
    options.storage,
    'inputConverter',
    serializeInputConverterPreferences,
    options.debounceMs,
  );
}
