import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { KeyValueStorage } from '#platform/persistence/storage.ts';
import {
  createInputConverterPreferencesScheduler,
  loadInputConverterPreferences,
  type InputConverterPreferencesCatalogs,
  type InputConverterPreferencesDefaults,
  type InputConverterPreferencesScheduler,
  type InputConverterPreferencesV2,
} from './input-converter-preferences.ts';

export interface UseInputConverterPreferencesOptions {
  /** テスト用の差し替え。省略時は window.localStorage */
  storage?: KeyValueStorage;
}

export interface InputConverterPreferencesHook {
  /**
   * mount後の副作用から一度だけ呼ぶ。呼んだ時点のcatalogs/defaultsでstorageから復元する。
   * 2回目以降の呼び出し（開発時のeffect二重実行等）は最初の結果をそのまま返し、再読込はしない。
   */
  restoreOnce(
    catalogs: InputConverterPreferencesCatalogs,
    defaults: InputConverterPreferencesDefaults,
  ): InputConverterPreferencesV2;
  /**
   * 復元後の状態変化をdebounceでまとめて書く。呼び出し側は restoreOnce が返した値を
   * 適用する前にこれを呼ばないこと（復元前のdefault値で上書きしてしまうため）。
   */
  save(prefs: InputConverterPreferencesV2): void;
}

/**
 * 入力コンバータの設定（配列・物理配列・配列ごとの練習環境）の永続化バウンダリ。
 * feature側のコンポーネントはこのフック経由でだけ storage に触れ、直接
 * localStorage / KeyValueStorage を読み書きしない。
 *
 * ワークスペース永続化（src/workspace/workspace-runtime.tsx）と同じ制約に従う:
 * レンダー中にstorageを読まない、復元は副作用で一度だけ、書き込みはdebounceでまとめ、
 * pagehide / visibilitychange(hidden) で確実にflushする。
 */
export function useInputConverterPreferences(
  options: UseInputConverterPreferencesOptions = {},
): InputConverterPreferencesHook {
  const storageOverride = options.storage;
  const resolveStorage = useCallback(
    (): KeyValueStorage => storageOverride ?? window.localStorage,
    [storageOverride],
  );

  const restoredRef = useRef<InputConverterPreferencesV2 | null>(null);
  const restoreOnce = useCallback((
    catalogs: InputConverterPreferencesCatalogs,
    defaults: InputConverterPreferencesDefaults,
  ): InputConverterPreferencesV2 => {
    if (restoredRef.current !== null) return restoredRef.current;
    const restored = loadInputConverterPreferences(resolveStorage(), catalogs, defaults);
    restoredRef.current = restored;
    return restored;
  }, [resolveStorage]);

  const schedulerRef = useRef<InputConverterPreferencesScheduler | null>(null);
  const getScheduler = useCallback((): InputConverterPreferencesScheduler => {
    if (schedulerRef.current === null) {
      schedulerRef.current = createInputConverterPreferencesScheduler({
        storage: resolveStorage(),
      });
    }
    return schedulerRef.current;
  }, [resolveStorage]);

  const save = useCallback((prefs: InputConverterPreferencesV2) => {
    getScheduler().notify(prefs);
  }, [getScheduler]);

  useEffect(() => {
    const scheduler = getScheduler();
    const flush = () => scheduler.flush();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      // アンマウント時（画面遷移等）も保留中の書き込みは取りこぼさず反映する
      scheduler.flush();
    };
  }, [getScheduler]);

  return useMemo(() => ({ restoreOnce, save }), [restoreOnce, save]);
}
