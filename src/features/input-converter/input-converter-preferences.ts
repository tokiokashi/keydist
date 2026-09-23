import {
  createDebouncedPersistenceScheduler,
  type DebouncedPersistenceScheduler,
} from '../../persistence/debounced-scheduler.ts';
import type { KeyValueStorage } from '../../persistence/storage.ts';
import { decodeVersionedState } from '../../persistence/versioned-state.ts';

/*
 * 入力コンバータには既に localStorage を使う永続化がある（このモジュールとは別の系統）。
 * 統合はしない（#413 Phase 8で legacy UiStateV1 と合わせて検討する）。
 *
 * - keydist:input-key-bindings（レガシーキー: keydist:input-thumb-key-bindings）
 *   物理キーコード → 論理キーの対応。browser-keyboard-bindings.ts が持つ
 * - keydist:geometry-shapes
 *   自作した物理配列の形状そのもの。user-geometries.ts が持つ
 *
 * このファイルが持つのはそれらへの「参照」（どのIDを選んでいたか）と表示トグルだけで、
 * 上記2つの実体（キー割当・形状の中身）はここでは扱わない。
 */

export const INPUT_CONVERTER_PREFERENCES_VERSION = 1;

/** localStorageのキー。バージョンは InputConverterPreferencesV1.version 側で管理する */
export const INPUT_CONVERTER_PREFERENCES_STORAGE_KEY = 'keydist:input-converter-preferences';

export interface InputConverterPreferencesV1 {
  version: typeof INPUT_CONVERTER_PREFERENCES_VERSION;
  /** 選択中の配列id（src/layouts の Layout.id） */
  layoutId: string;
  /** 選択中の物理配列id（プリセットの PhysicalShape.id、または自作形状のid） */
  geometryId: string;
  /** 動的ガイド（打鍵候補のハイライト）の表示 */
  showDynamicGuide: boolean;
  /** レイヤーカンペ（レイヤー定義一覧パネル）の表示 */
  showLayerGuide: boolean;
  /** レイヤーキー（トリガーキーの着色）の表示 */
  showLayerKeys: boolean;
  /** Shiftキーの表示（レイアウトがShiftキーを持つ場合のみ画面に出る） */
  showShiftKeys: boolean;
}

/** decode時、raw JSON に無い/型が違うフィールドを埋めるための既定値。呼び出し側の現在値から作る。 */
export type InputConverterPreferencesDefaults = Omit<InputConverterPreferencesV1, 'version'>;

/** layoutId / geometryId が現在選べる値かどうかを検査するためのカタログ。呼び出し時点のものを渡す。 */
export interface InputConverterPreferencesCatalogs {
  layoutIds: readonly string[];
  geometryIds: readonly string[];
}

export function createDefaultInputConverterPreferences(
  defaults: InputConverterPreferencesDefaults,
): InputConverterPreferencesV1 {
  return { version: INPUT_CONVERTER_PREFERENCES_VERSION, ...defaults };
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

/**
 * 保存済みJSONをデコードする。バージョン不一致・壊れたJSON・構造不一致・
 * 未知のlayoutId/geometryId・フィールドの型違いは、すべて例外を投げず
 * フィールド単位で defaults へ落ちる（1フィールドの異常で全体を捨てない）。
 */
export function decodeInputConverterPreferences(
  raw: string | null,
  catalogs: InputConverterPreferencesCatalogs,
  defaults: InputConverterPreferencesDefaults,
): InputConverterPreferencesV1 {
  const fallback = createDefaultInputConverterPreferences(defaults);
  const decoded = decodeVersionedState(
    raw,
    INPUT_CONVERTER_PREFERENCES_VERSION,
    isRawPreferencesShape,
  );
  if (decoded.status !== 'ok') return fallback;

  const value = decoded.value;
  return {
    version: INPUT_CONVERTER_PREFERENCES_VERSION,
    layoutId: sanitizeString(value.layoutId, catalogs.layoutIds, fallback.layoutId),
    geometryId: sanitizeString(value.geometryId, catalogs.geometryIds, fallback.geometryId),
    showDynamicGuide: sanitizeBoolean(value.showDynamicGuide, fallback.showDynamicGuide),
    showLayerGuide: sanitizeBoolean(value.showLayerGuide, fallback.showLayerGuide),
    showLayerKeys: sanitizeBoolean(value.showLayerKeys, fallback.showLayerKeys),
    showShiftKeys: sanitizeBoolean(value.showShiftKeys, fallback.showShiftKeys),
  };
}

export function serializeInputConverterPreferences(prefs: InputConverterPreferencesV1): string {
  return JSON.stringify(prefs);
}

/** storage.getItem自体が例外を投げる環境（プライベートモード等）でも既定値へ倒す */
export function loadInputConverterPreferences(
  storage: KeyValueStorage,
  catalogs: InputConverterPreferencesCatalogs,
  defaults: InputConverterPreferencesDefaults,
): InputConverterPreferencesV1 {
  let raw: string | null;
  try {
    raw = storage.getItem(INPUT_CONVERTER_PREFERENCES_STORAGE_KEY);
  } catch {
    raw = null;
  }
  return decodeInputConverterPreferences(raw, catalogs, defaults);
}

export function saveInputConverterPreferences(
  storage: KeyValueStorage,
  prefs: InputConverterPreferencesV1,
): void {
  try {
    storage.setItem(
      INPUT_CONVERTER_PREFERENCES_STORAGE_KEY,
      serializeInputConverterPreferences(prefs),
    );
  } catch {
    // 保存できなくてもその場の画面は成立する
  }
}

export type InputConverterPreferencesScheduler =
  DebouncedPersistenceScheduler<InputConverterPreferencesV1>;

export interface InputConverterPreferencesSchedulerOptions {
  storage: KeyValueStorage;
  debounceMs?: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

/**
 * トグルの連打・配列切替の連続操作でlocalStorageへ書きすぎないための書き込みコアレッシング。
 * ワークスペース永続化（src/workspace/workspace-persistence.ts）と同じ汎用スケジューラを使う。
 */
export function createInputConverterPreferencesScheduler(
  options: InputConverterPreferencesSchedulerOptions,
): InputConverterPreferencesScheduler {
  return createDebouncedPersistenceScheduler<InputConverterPreferencesV1>({
    write: (prefs) => saveInputConverterPreferences(options.storage, prefs),
    serialize: serializeInputConverterPreferences,
    debounceMs: options.debounceMs,
    setTimeoutFn: options.setTimeoutFn,
    clearTimeoutFn: options.clearTimeoutFn,
  });
}
