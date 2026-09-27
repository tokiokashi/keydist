import assert from 'node:assert/strict';
import test from 'node:test';
import type { KeyValueStorage } from '#platform/persistence/storage.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import { ASSET_KEYS, ASSET_STORAGE_SPECS } from './asset-storage-specs.ts';
import { buildAssetSyncs, loadAssets, saveChangedAssets, startAssetSyncs } from './asset-syncs.ts';

/**
 * `ASSET_STORAGE_SPECS`の`initial()`をそのまま束ねるだけの、このテスト専用の最小`KeydistAssets`。
 * 手で全キーを書き並べないのは、`KeydistAssets`にキーが増えるたびにこのテストも
 * 書き換える必要が出るのを避けるため（`use-keydist-assets.ts`の`initialAssets`と同じ理由）。
 */
function baseAssets(): KeydistAssets {
  const entries = ASSET_KEYS.map((key) => [key, ASSET_STORAGE_SPECS[key].initial()] as const);
  return Object.fromEntries(entries) as unknown as KeydistAssets;
}

/** `asset-tab-sync.test.ts`と同じ形の偽物（`window.localStorage`相当）。 */
function createFakeStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
  };
}

/** `asset-tab-sync.test.ts`と同じ形の偽バス。複数`buildAssetSyncs`（＝複数タブ）で共有できる。 */
function createFakeBus() {
  const listeners = new Set<(key: string) => void>();
  return {
    subscribe: (keys: readonly string[], listener: (key: string) => void) => {
      const watched = new Set(keys);
      const wrapped = (key: string) => { if (watched.has(key)) listener(key); };
      listeners.add(wrapped);
      return () => { listeners.delete(wrapped); };
    },
    notify: (key: string) => {
      for (const listener of listeners) listener(key);
    },
  };
}

test('loadAssets: storageが空なら何も返さない', () => {
  const syncs = buildAssetSyncs({ onExternalChange: () => {}, storage: createFakeStorage() });
  assert.deepEqual(loadAssets(syncs), {});
});

test('saveChangedAssets→loadAssets: 書いたキーだけ往復する', () => {
  const storage = createFakeStorage();
  const syncsA = buildAssetSyncs({ onExternalChange: () => {}, storage });
  const nextText = { ...ASSET_STORAGE_SPECS.standaloneText.initial(), text: 'hello' };
  saveChangedAssets(syncsA, { ...baseAssets(), standaloneText: nextText }, ['standaloneText']);

  // 別インスタンス（＝別タブ相当）で読む。同じstorageを共有すればload側は独立して読める。
  const syncsB = buildAssetSyncs({ onExternalChange: () => {}, storage });
  const loaded = loadAssets(syncsB);
  assert.deepEqual(loaded.standaloneText, nextText);
  assert.equal(loaded.setupLibrary, undefined);
  assert.equal(loaded.fingerAssignments, undefined);
});

test('外部変更: 購読開始(startAssetSyncs)後、他タブの書き込みが同じキーのonExternalChangeへ届く', () => {
  const storage = createFakeStorage();
  const bus = createFakeBus();
  const seen: unknown[] = [];

  const syncsA = buildAssetSyncs({
    onExternalChange: (key, value) => seen.push([key, value]),
    storage,
    subscribe: bus.subscribe,
    notify: bus.notify,
  });
  const syncsB = buildAssetSyncs({
    onExternalChange: () => {},
    storage,
    subscribe: bus.subscribe,
    notify: bus.notify,
  });
  const stopA = startAssetSyncs(syncsA);
  const stopB = startAssetSyncs(syncsB);

  const nextText = { ...ASSET_STORAGE_SPECS.standaloneText.initial(), text: 'from tab B' };
  saveChangedAssets(syncsB, { ...baseAssets(), standaloneText: nextText }, ['standaloneText']);

  assert.deepEqual(seen, [['standaloneText', nextText]]);
  stopA();
  stopB();
});

/**
 * ReactのStrictMode（開発時のmount→cleanup→mount二重実行）を模した回帰テスト
 * （#544レビュー: `useKeydistAssets`が構築時に自動購読・`useEffect`のcleanupでだけ
 * 停止する形だった時、二重実行後は外部タブの変更を二度と受け取れなくなっていた。
 * 実機での再現は`e2e/standalone-bigram-flow.spec.ts`「複数タブ」テスト参照）。
 */
test('startAssetSyncs→stop→startAssetSyncs（StrictModeの二重実行を模す）しても、外部変更が届き続ける', () => {
  const storage = createFakeStorage();
  const bus = createFakeBus();
  const seen: unknown[] = [];

  const syncsA = buildAssetSyncs({
    onExternalChange: (key, value) => seen.push([key, value]),
    storage,
    subscribe: bus.subscribe,
    notify: bus.notify,
  });
  const syncsB = buildAssetSyncs({
    onExternalChange: () => {},
    storage,
    subscribe: bus.subscribe,
    notify: bus.notify,
  });

  const stopFirst = startAssetSyncs(syncsA); // 1回目のmount相当
  stopFirst(); // StrictModeが模すcleanup
  const stopSecond = startAssetSyncs(syncsA); // 2回目のmount（実際に生きる購読）
  startAssetSyncs(syncsB);

  const nextText = { ...ASSET_STORAGE_SPECS.standaloneText.initial(), text: 'from tab B after remount' };
  saveChangedAssets(syncsB, { ...baseAssets(), standaloneText: nextText }, ['standaloneText']);

  assert.deepEqual(seen, [['standaloneText', nextText]], '2回目のstart後も外部変更が届く');
  stopSecond();
});

test('ASSET_KEYS: 表に無いキーは無い（KeydistAssetsの全キーをカバーする最小確認）', () => {
  assert.deepEqual([...ASSET_KEYS].sort(), Object.keys(ASSET_STORAGE_SPECS).sort());
});
