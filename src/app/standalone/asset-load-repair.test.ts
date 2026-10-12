import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import type { KeyValueStorage } from '#platform/persistence/storage.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import { ASSET_KEYS, ASSET_STORAGE_SPECS, type AssetStorageSpec } from './asset-storage-specs.ts';
import { buildAssetSyncs, loadAssetsAndRepair, startAssetSyncs } from './asset-syncs.ts';
import {
  claimInitialAssetLoad,
  dismissAssetLoadNotices,
  getAssetLoadNoticesSnapshot,
  reportAssetLoadNotices,
  resetAssetLoadNoticesForTest,
} from './asset-load-notice.ts';
import { assetNoticeText } from './asset-load-notice-text.ts';

function createFakeStorage(options: { readonly failWrites?: boolean } = {}) {
  const map = new Map<string, string>();
  const writes: string[] = [];
  const storage: KeyValueStorage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      if (options.failWrites === true) throw new Error('quota');
      writes.push(key);
      map.set(key, value);
    },
    removeItem: (key) => { map.delete(key); },
  };
  return { storage, map, writes };
}

function open(storage: KeyValueStorage) {
  return loadAssetsAndRepair(buildAssetSyncs({ onExternalChange: () => {}, storage, notify: () => {} }));
}

/** 資産ごとの「診断が出るが読める」値（捨てた・直した値を含む）と、診断のpathの先頭。 */
const REPAIRABLE: { readonly [K in keyof KeydistAssets]: { readonly raw: Record<string, unknown>; readonly root: string } } = {
  setupLibrary: { raw: { setups: 5, overrides: {} }, root: 'setups' },
  fingerAssignments: { raw: { assignments: 5 }, root: 'assignments' },
  textLibrary: { raw: { texts: 5 }, root: 'texts' },
  standaloneTextSelection: { raw: { ref: { kind: 'builtin', id: 'ない' } }, root: 'ref' },
  standaloneAnalyzerOptions: { raw: { playback: 5 }, root: 'playback' },
  multiTargetSelection: { raw: { targets: 5 }, root: 'targets' },
  singleTargetSelection: { raw: { target: { kind: 'ない' } }, root: 'target' },
  workspaces: { raw: { workspaces: 5 }, root: 'workspaces' },
  presetLibrary: { raw: { presets: 5 }, root: 'presets' },
  userLayouts: { raw: { layouts: 5 }, root: 'layouts' },
  userRomajiRules: { raw: { rules: 5 }, root: 'rules' },
  personalSpeed: { raw: { calibration: 5 }, root: 'calibration' },
};

/** 診断が出る値に、その資産の現行版を付けた保存文字列。 */
function repairableRaw(key: keyof KeydistAssets): string {
  return JSON.stringify({ version: ASSET_STORAGE_SPECS[key].codec.currentVersion, ...REPAIRABLE[key].raw });
}

/** 資産全体が読めない値。JSONとして読めない・版が無い。 */
const UNREADABLE: readonly string[] = ['{壊れたJSON', JSON.stringify({ playback: 1 })];

beforeEach(() => {
  resetAssetLoadNoticesForTest();
});

for (const key of ASSET_KEYS) {
  const storageKey = ASSET_STORAGE_SPECS[key].storageKey;

  test(`${key}: 捨てた・直した値を知らせ、直した形を書き戻し、次に開くと知らせない`, () => {
    const { storage, map } = createFakeStorage();
    const original = repairableRaw(key);
    map.set(storageKey, original);

    const first = open(storage);
    const notice = first.notices.find((candidate) => candidate.key === key);
    assert.equal(notice?.kind, 'repaired');
    assert.ok((notice?.diagnostics.length ?? 0) > 0);
    assert.notEqual(map.get(storageKey), original, '直した形を書き戻している');

    const second = open(storage);
    assert.deepEqual(second.notices, [], '次に開いた時は同じ知らせが出ない');
    assert.deepEqual(second.assets[key], first.assets[key], '書き戻した形がそのまま読める');
  });

  test(`${key}: 診断のpathは資産の直下の項目から始まる（payloadを前置しない）`, () => {
    const { storage, map } = createFakeStorage();
    map.set(storageKey, repairableRaw(key));
    const notice = open(storage).notices.find((candidate) => candidate.key === key);
    const paths = notice?.diagnostics.map((diagnostic) => diagnostic.path) ?? [];
    assert.ok(paths.length > 0);
    for (const path of paths) {
      assert.ok(path.startsWith(REPAIRABLE[key].root), `${key}: ${path}`);
    }
  });

  for (const raw of UNREADABLE) {
    test(`${key}: 読めない値（${raw.slice(0, 8)}）は既定値で始め、既定値を書き戻す`, () => {
      const { storage, map } = createFakeStorage();
      map.set(storageKey, raw);

      const first = open(storage);
      assert.equal(first.notices.find((candidate) => candidate.key === key)?.kind, 'reset');
      assert.equal(first.assets[key], undefined, '読めなかった資産は手持ちを作らない（既定値のまま）');
      const spec = ASSET_STORAGE_SPECS[key] as unknown as AssetStorageSpec<unknown>;
      const written = JSON.stringify(spec.codec.encode(spec.initial()));
      assert.equal(map.get(storageKey), written);

      const second = open(storage);
      assert.deepEqual(second.notices, []);
      assert.deepEqual(second.assets[key], ASSET_STORAGE_SPECS[key].initial());
    });
  }

  test(`${key}: 新しい版が書いた値は書き戻さず残し、開くたびに知らせの材料が届く`, () => {
    const { storage, map, writes } = createFakeStorage();
    const future = JSON.stringify({ version: ASSET_STORAGE_SPECS[key].codec.currentVersion + 1, 将来: true });
    map.set(storageKey, future);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const outcome = open(storage);
      assert.equal(outcome.notices.find((candidate) => candidate.key === key)?.kind, 'newer-version');
      assert.equal(map.get(storageKey), future);
    }
    assert.deepEqual(writes, []);
  });
}

test('storageが空なら知らせず、何も書かない', () => {
  const { storage, writes } = createFakeStorage();
  const outcome = open(storage);
  assert.deepEqual(outcome.notices, []);
  assert.deepEqual(outcome.assets, {});
  assert.deepEqual(writes, []);
});

test('正常な値は知らせず、書き戻さない', () => {
  const { storage, map, writes } = createFakeStorage();
  const key = 'textLibrary';
  map.set(ASSET_STORAGE_SPECS[key].storageKey, JSON.stringify({ version: 1, texts: [] }));
  assert.deepEqual(open(storage).notices, []);
  assert.deepEqual(writes, []);
});

test('書き込みに失敗した時も知らせ、次に開いた時にも知らせる', () => {
  const { storage, map } = createFakeStorage({ failWrites: true });
  const key = 'presetLibrary';
  const original = repairableRaw(key);
  map.set(ASSET_STORAGE_SPECS[key].storageKey, original);

  assert.equal(open(storage).notices.find((candidate) => candidate.key === key)?.kind, 'repaired');
  assert.equal(map.get(ASSET_STORAGE_SPECS[key].storageKey), original);
  assert.equal(open(storage).notices.find((candidate) => candidate.key === key)?.kind, 'repaired');
});

test('他のタブの変更を取り込んでも、知らせの材料は出ず、取り込んだ側は書き戻さない', () => {
  const { storage, map, writes } = createFakeStorage();
  const key = 'textLibrary';
  const storageKey = ASSET_STORAGE_SPECS[key].storageKey;
  const received: unknown[] = [];
  const listeners = new Set<(changed: string) => void>();
  const syncs = buildAssetSyncs({
    storage,
    notify: () => {},
    subscribe: (_keys, listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onExternalChange: (changed, value) => { received.push([changed, value]); },
  });
  const stop = startAssetSyncs(syncs);
  // 他のタブが、直せば読める値を書いた
  map.set(storageKey, repairableRaw(key));
  for (const listener of listeners) listener(storageKey);

  assert.equal(received.length, 1, '他タブの変更は取り込む');
  assert.deepEqual(writes, [], '取り込む側は書き戻さない');
  assert.deepEqual(getAssetLoadNoticesSnapshot(), []);
  stop();
});

test('知らせの記憶: 同じ資産は重複せず、新しい版の値は閉じた後に出し直さない', () => {
  reportAssetLoadNotices([{ key: 'workspaces', kind: 'newer-version', diagnostics: [] }]);
  reportAssetLoadNotices([{ key: 'workspaces', kind: 'newer-version', diagnostics: [] }]);
  assert.equal(getAssetLoadNoticesSnapshot().length, 1);

  dismissAssetLoadNotices();
  reportAssetLoadNotices([{ key: 'workspaces', kind: 'newer-version', diagnostics: [] }]);
  assert.deepEqual(getAssetLoadNoticesSnapshot(), [], '同じタブで知らせ済み');

  reportAssetLoadNotices([{ key: 'presetLibrary', kind: 'reset', diagnostics: [] }]);
  assert.equal(getAssetLoadNoticesSnapshot().length, 1);
});

test('そのタブの最初の読み込みだけが知らせと書き戻しを担う', () => {
  assert.equal(claimInitialAssetLoad(), true);
  assert.equal(claimInitialAssetLoad(), false);
  resetAssetLoadNoticesForTest();
  assert.equal(claimInitialAssetLoad(), true);
});

test('知らせの文: 資産の名前と件数だけを出し、codecの診断の文を流さない', () => {
  const diagnostics = [
    { path: 'presets[0]', message: 'Invalid type: Expected Object but received 5のため捨てました' },
    { path: 'presets[1]', message: '項目「playbackRateAverage」を捨てました' },
  ];
  const repaired = assetNoticeText({ key: 'presetLibrary', kind: 'repaired', diagnostics });
  assert.equal(repaired, 'プリセット: 読めない部分が2件あったため、読める部分だけで開きました。');
  assert.doesNotMatch(repaired, /Invalid|playbackRateAverage/);

  assert.match(assetNoticeText({ key: 'userLayouts', kind: 'reset', diagnostics: [] }), /^自作の配列: .*初期の状態/);
  assert.match(assetNoticeText({ key: 'workspaces', kind: 'newer-version', diagnostics: [] }), /^Workspace: 新しい版/);
});
