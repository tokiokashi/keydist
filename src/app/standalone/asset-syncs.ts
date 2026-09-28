import { createAssetTabSync, type AssetTabSync } from '#platform/asset-tab-sync.ts';
import type { KeyValueStorage } from '#platform/persistence/storage.ts';
import { notifyKeydistStorageChange, subscribeKeydistStorageChanges } from '#platform/browser-storage-events.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import { ASSET_KEYS, ASSET_STORAGE_SPECS } from './asset-storage-specs.ts';

/**
 * `ASSET_STORAGE_SPECS`をReactから独立して組み立てる層（コーディネーター指示:
 * 「資産の一覧表はKeyValueStorageを注入できる形を保つ（createAssetTabSyncと同じ）」）。
 *
 * `createAssetTabSync`が資産1つぶんに持つ`storage`/`subscribe`/`notify`の注入口を
 * そのまま資産ぶんまとめて中継するだけの薄い層にする。Reactを一切importしないので、
 * `use-keydist-assets.ts`（hook）を経由せずnode:testから直接組み立てて検証できる
 * （`asset-syncs.test.ts`）。
 */
export type AssetSyncMap = { readonly [K in keyof KeydistAssets]: AssetTabSync<KeydistAssets[K]> };

export interface BuildAssetSyncsOptions {
  readonly onExternalChange: <K extends keyof KeydistAssets>(key: K, value: KeydistAssets[K]) => void;
  /** 既定は`createAssetTabSync`自身の既定（`window.localStorage`）。テストでは偽物を注入する。 */
  readonly storage?: KeyValueStorage;
  /** 既定は`browser-storage-events.ts`の購読。テストでは偽物を注入する。 */
  readonly subscribe?: typeof subscribeKeydistStorageChanges;
  /** 既定は`browser-storage-events.ts`の通知。テストでは偽物を注入する。 */
  readonly notify?: typeof notifyKeydistStorageChange;
}

/**
 * `key`ごとに`AssetTabSync<KeydistAssets[K]>`を組み立てる。ジェネリック関数として
 * 1キー分だけを扱うことで、`spec`・`sync`双方の型パラメータ`K`をTypeScriptに相関させる
 * （`ASSET_KEYS.map`のような単純なループの中で直接組み立てると、map結果の配列要素の型が
 * `AssetTabSync<A> | AssetTabSync<B> | ...`という緩い合併に潰れ、`Object.fromEntries`の
 * 戻り値が`AssetSyncMap`と噛み合わなくなる）。
 */
function buildOne<K extends keyof KeydistAssets>(
  key: K,
  options: BuildAssetSyncsOptions,
): readonly [K, AssetTabSync<KeydistAssets[K]>] {
  const spec = ASSET_STORAGE_SPECS[key];
  const sync = createAssetTabSync({
    storageKey: spec.storageKey,
    codec: spec.codec,
    storage: options.storage,
    subscribe: options.subscribe,
    notify: options.notify,
    onExternalChange: (value) => options.onExternalChange(key, value),
  });
  return [key, sync];
}

export function buildAssetSyncs(options: BuildAssetSyncsOptions): AssetSyncMap {
  const entries = ASSET_KEYS.map((key) => buildOne(key, options));
  // `ASSET_STORAGE_SPECS`が`KeydistAssets`の全キーを型で強制しているので、ここでの
  // `unknown`経由のcastは「全キー分そろっている」という保証済みの前提を表す1箇所だけの
  // 変換として許容する（`Array#map`がタプルの相関をunionへ潰してしまうためのworkaround。
  // `buildOne`のコメント参照）。
  return Object.fromEntries(entries) as unknown as AssetSyncMap;
}

function loadOne<K extends keyof KeydistAssets>(
  syncs: AssetSyncMap,
  key: K,
): readonly [K, KeydistAssets[K]] | undefined {
  const value = syncs[key].load();
  return value === undefined ? undefined : [key, value];
}

/** storageに何かあった資産キーだけを返す（無ければキーごと省く。呼び出し側は`{...current, ...loaded}`で合成する）。 */
export function loadAssets(syncs: AssetSyncMap): Partial<KeydistAssets> {
  const entries = ASSET_KEYS
    .map((key) => loadOne(syncs, key))
    .filter((entry) => entry !== undefined);
  return Object.fromEntries(entries) as unknown as Partial<KeydistAssets>;
}

function saveOne<K extends keyof KeydistAssets>(syncs: AssetSyncMap, assets: KeydistAssets, key: K): void {
  syncs[key].save(assets[key]);
}

/** `applyCommand`が返した`changes`のキーだけをstorageへ書く。 */
export function saveChangedAssets(
  syncs: AssetSyncMap,
  assets: KeydistAssets,
  changedKeys: readonly (keyof KeydistAssets)[],
): void {
  for (const key of changedKeys) saveOne(syncs, assets, key);
}

/**
 * 全資産の購読を始め、まとめて止める関数を返す（`AssetTabSync.start()`のコメント参照）。
 * **呼び出し側は`useEffect`の中でこれを呼び、返ってきた関数をその`cleanup`で呼ぶこと。**
 * ReactのStrictMode（開発時のmount→cleanup→mount二重実行）でcleanupが挟まっても、
 * 次のeffect実行でまた`startAssetSyncs`を呼べば正しく購読し直される
 * （#544レビュー: 構築時に自動購読・`useEffect`の外で1回だけ購読していた旧設計は、
 * 二重実行後ずっと外部タブの変更を受け取れなくなっていた。再現・原因は
 * `asset-tab-sync.test.ts`の「StrictModeの二重実行を模す」テスト参照）。
 */
export function startAssetSyncs(syncs: AssetSyncMap): () => void {
  const stops = ASSET_KEYS.map((key) => syncs[key].start());
  return () => {
    for (const stop of stops) stop();
  };
}
