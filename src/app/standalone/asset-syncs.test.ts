import assert from 'node:assert/strict';
import test from 'node:test';
import type { KeyValueStorage } from '#platform/persistence/storage.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import { ASSET_KEYS, ASSET_STORAGE_SPECS } from './asset-storage-specs.ts';
import {
  createSetupCommand,
  createTextCommand,
  selectTextCommand,
} from '#engine/commands.ts';
import { applyCommand, applyExternalChange, emptyCommandHistory, type Command } from '#input/commands/index.ts';
import {
  buildAssetSyncs,
  commitCommand,
  commitHistoryStep,
  loadAssets,
  saveChangedAssets,
  startAssetSyncs,
  type AssetState,
} from './asset-syncs.ts';

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
  const nextLibrary = { texts: [{ id: 'text-1', name: 'hello', text: 'hello' }] };
  saveChangedAssets(syncsA, { ...baseAssets(), textLibrary: nextLibrary }, ['textLibrary']);

  // 別インスタンス（＝別タブ相当）で読む。同じstorageを共有すればload側は独立して読める。
  const syncsB = buildAssetSyncs({ onExternalChange: () => {}, storage });
  const loaded = loadAssets(syncsB);
  assert.deepEqual(loaded.textLibrary, nextLibrary);
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

  const nextLibrary = { texts: [{ id: 'text-1', name: 'from tab B', text: 'from tab B' }] };
  saveChangedAssets(syncsB, { ...baseAssets(), textLibrary: nextLibrary }, ['textLibrary']);

  assert.deepEqual(seen, [['textLibrary', nextLibrary]]);
  stopA();
  stopB();
});

/**
 * ReactのStrictMode（開発時のmount→cleanup→mount二重実行）を模した回帰テスト
 * （`useKeydistAssets`が構築時に自動購読・`useEffect`のcleanupでだけ
 * 停止する形だと、二重実行後は外部タブの変更を二度と受け取れなくなる。
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

  const nextLibrary = { texts: [{ id: 'text-1', name: 'from tab B after remount', text: 'from tab B after remount' }] };
  saveChangedAssets(syncsB, { ...baseAssets(), textLibrary: nextLibrary }, ['textLibrary']);

  assert.deepEqual(seen, [['textLibrary', nextLibrary]], '2回目のstart後も外部変更が届く');
  stopSecond();
});

test('ASSET_KEYS: 表に無いキーは無い（KeydistAssetsの全キーをカバーする最小確認）', () => {
  assert.deepEqual([...ASSET_KEYS].sort(), Object.keys(ASSET_STORAGE_SPECS).sort());
});

/**
 * 1タブぶんの手持ちと`commitCommand`を`useKeydistAssets`と同じ配線で組む。
 * 変更通知は届けない（他タブの書き込みの通知がまだ届いていない状況を作るため）。
 */
function createTab(storage: KeyValueStorage) {
  let state: AssetState = { assets: baseAssets(), history: emptyCommandHistory() };
  const syncs = buildAssetSyncs({
    onExternalChange: (key, value) => { state = applyExternalChange(state.assets, state.history, key, value); },
    storage,
    notify: () => {},
  });
  return {
    get state() { return state; },
    dispatch(command: Command<KeydistAssets>) {
      const result = commitCommand(syncs, () => state, command);
      if (result.outcome.kind === 'applied') state = result;
    },
    step(direction: 'undo' | 'redo') {
      const result = commitHistoryStep(syncs, () => state, direction);
      if (result.outcome.kind === 'applied') state = result;
    },
  };
}

let nextId = 0;
const freshId = () => `id-${++nextId}`;

test('commitCommand: 通知の届いていない他タブの追加を消さずに自分の追加を書く（textLibrary）', () => {
  const storage = createFakeStorage();
  const tabA = createTab(storage);
  const tabB = createTab(storage);

  tabA.dispatch(createTextCommand('standalone', freshId));
  tabB.dispatch(createTextCommand('standalone', freshId));

  const stored = loadAssets(buildAssetSyncs({ onExternalChange: () => {}, storage }));
  assert.equal(stored.textLibrary?.texts.length, 2);
  assert.deepEqual(tabB.state.assets.textLibrary, stored.textLibrary);
});

test('commitCommand: 通知の届いていない他タブの追加を消さずに自分の追加を書く（setupLibrary）', () => {
  const storage = createFakeStorage();
  const tabA = createTab(storage);
  const tabB = createTab(storage);

  tabA.dispatch(createSetupCommand('qwerty', 'row-staggered', freshId));
  tabB.dispatch(createSetupCommand('qwerty', 'row-staggered', freshId));

  const stored = loadAssets(buildAssetSyncs({ onExternalChange: () => {}, storage }));
  assert.equal(stored.setupLibrary?.setups.length, 2);
});

test('commitCommand: 他タブの変更を取り込んだ資産の履歴は捨て、自分のコマンドだけが残る', () => {
  const storage = createFakeStorage();
  const tabA = createTab(storage);
  const tabB = createTab(storage);

  tabB.dispatch(createTextCommand('standalone', freshId));
  assert.equal(tabB.state.history.undoStack.length, 1);
  tabA.dispatch(createTextCommand('standalone', freshId));
  tabB.dispatch(createTextCommand('standalone', freshId));

  assert.deepEqual(tabB.state.history.undoStack.map((entry) => entry.label), ['テキストを作成する']);
  assert.equal(tabB.state.assets.textLibrary.texts.length, 3);
});

test('commitCommand: 単一値の資産は最後に書いたタブの値になる', () => {
  const storage = createFakeStorage();
  const tabA = createTab(storage);
  const tabB = createTab(storage);

  tabA.dispatch(selectTextCommand('standalone', { kind: 'builtin', id: 'builtin:ja.modern' }));
  tabB.dispatch(selectTextCommand('standalone', { kind: 'builtin', id: 'builtin:ja.legacy' }));

  const stored = loadAssets(buildAssetSyncs({ onExternalChange: () => {}, storage }));
  assert.deepEqual(stored.standaloneTextSelection?.ref, { kind: 'builtin', id: 'builtin:ja.legacy' });
});

test('commitCommand: 何も取り込まなければapplyCommandと同じ結果になる', () => {
  const storage = createFakeStorage();
  const tab = createTab(storage);
  const command = createTextCommand('standalone', () => 'fixed');
  const expected = applyCommand(tab.state.assets, tab.state.history, command);
  tab.dispatch(command);
  assert.deepEqual(tab.state.assets, expected.assets);
});

test('commitHistoryStep: Undoで戻した値をstorageへ書き、Redoでやり直した値も書く', () => {
  const storage = createFakeStorage();
  const tab = createTab(storage);
  const read = () => loadAssets(buildAssetSyncs({ onExternalChange: () => {}, storage }));

  tab.dispatch(selectTextCommand('standalone', { kind: 'builtin', id: 'builtin:ja.modern' }));
  assert.deepEqual(read().standaloneTextSelection?.ref, { kind: 'builtin', id: 'builtin:ja.modern' });

  tab.step('undo');
  assert.notDeepEqual(read().standaloneTextSelection?.ref, { kind: 'builtin', id: 'builtin:ja.modern' });
  assert.deepEqual(read().standaloneTextSelection, tab.state.assets.standaloneTextSelection);
  assert.equal(tab.state.history.redoStack.length, 1);

  tab.step('redo');
  assert.deepEqual(read().standaloneTextSelection?.ref, { kind: 'builtin', id: 'builtin:ja.modern' });
});

test('commitHistoryStep: 他タブが書き換えた資産はUndoで巻き戻さない', () => {
  const storage = createFakeStorage();
  const tabA = createTab(storage);
  const tabB = createTab(storage);

  tabB.dispatch(createTextCommand('standalone', freshId));
  tabA.dispatch(createTextCommand('standalone', freshId));
  // tabBは通知を受けていないが、Undoの直前に追いつき、textLibraryに触れる履歴を捨てる。
  tabB.step('undo');

  const stored = loadAssets(buildAssetSyncs({ onExternalChange: () => {}, storage }));
  assert.equal(stored.textLibrary?.texts.length, 2);
});

test('自作の配列とローマ字規則: 書いたものが往復し、別タブの変更が同じキーのonExternalChangeへ届く', () => {
  const storage = createFakeStorage();
  const bus = createFakeBus();
  const seen: unknown[] = [];
  const syncsA = buildAssetSyncs({
    onExternalChange: (key, value) => seen.push([key, value]),
    storage,
    subscribe: bus.subscribe,
    notify: bus.notify,
  });
  const syncsB = buildAssetSyncs({ onExternalChange: () => {}, storage, subscribe: bus.subscribe, notify: bus.notify });
  const stopA = startAssetSyncs(syncsA);
  const userLayouts = [{ id: 'user-a', name: 'A', rows: ['', 'qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'] as [string, string, string, string], romaji: 'kunrei' }];
  const userRomajiRules = [{ id: 'rule-a', name: 'R', base: 'kunrei' as const, overrides: { し: 'si' }, generateSokuon: true }];

  saveChangedAssets(syncsB, { ...baseAssets(), userLayouts, userRomajiRules }, ['userLayouts', 'userRomajiRules']);

  assert.deepEqual(seen, [['userLayouts', userLayouts], ['userRomajiRules', userRomajiRules]]);
  assert.deepEqual(loadAssets(buildAssetSyncs({ onExternalChange: () => {}, storage })).userLayouts, userLayouts);
  stopA();
});

test('自作の配列とローマ字規則: 保存された値の壊れた要素・id重複は読み込み時に捨てられる', () => {
  const storage = createFakeStorage();
  const layout = { id: 'user-a', name: 'A', rows: ['', 'q', 'a', 'z'], romaji: 'kunrei' };
  const rule = { id: 'rule-a', name: 'R', base: 'kunrei', overrides: {}, generateSokuon: true };
  storage.setItem(ASSET_STORAGE_SPECS.userLayouts.storageKey, JSON.stringify({ version: 1, layouts: [layout, layout, 5] }));
  storage.setItem(ASSET_STORAGE_SPECS.userRomajiRules.storageKey, JSON.stringify({ version: 1, rules: [rule, rule, 5] }));
  const loaded = loadAssets(buildAssetSyncs({ onExternalChange: () => {}, storage }));
  assert.equal(loaded.userLayouts?.length, 1);
  assert.equal(loaded.userRomajiRules?.length, 1);
});

test('外部変更: 他タブで書いた自作の配列とローマ字規則が、それぞれのキーのonExternalChangeへ届く', () => {
  const storage = createFakeStorage();
  const bus = createFakeBus();
  const seen: unknown[] = [];

  const syncsA = buildAssetSyncs({
    onExternalChange: (key, value) => seen.push([key, value]),
    storage,
    subscribe: bus.subscribe,
    notify: bus.notify,
  });
  const syncsB = buildAssetSyncs({ onExternalChange: () => {}, storage, subscribe: bus.subscribe, notify: bus.notify });
  const stopA = startAssetSyncs(syncsA);
  const stopB = startAssetSyncs(syncsB);

  const userLayouts = [{
    id: 'user-a',
    name: '自作の配列',
    rows: ['1234567890', 'qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'] as [string, string, string, string],
    romaji: 'romaji-a',
  }];
  const userRomajiRules = [{ id: 'romaji-a', name: '自作の規則', base: 'kunrei' as const, overrides: { し: 'shi' }, generateSokuon: true }];
  saveChangedAssets(syncsB, { ...baseAssets(), userLayouts, userRomajiRules }, ['userLayouts', 'userRomajiRules']);

  assert.deepEqual(seen, [['userLayouts', userLayouts], ['userRomajiRules', userRomajiRules]]);
  // 新しいタブの読み込みでも同じ値が読める
  const loaded = loadAssets(buildAssetSyncs({ onExternalChange: () => {}, storage }));
  assert.deepEqual(loaded.userLayouts, userLayouts);
  assert.deepEqual(loaded.userRomajiRules, userRomajiRules);
  stopA();
  stopB();
});
