import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defineAssetCodec, type AssetCodec } from '#input/codec/index.ts';
import { createAssetTabSync } from './asset-tab-sync.ts';
import type { KeyValueStorage } from './persistence/storage.ts';

/** テスト用の小さな資産。`{ count: number }` をそのままencode/decodeするだけ。 */
interface Counter {
  readonly count: number;
}

const COUNTER_CODEC: AssetCodec<Counter> = defineAssetCodec({
  currentVersion: 1,
  decodePayload: (payload) => {
    if (typeof payload !== 'object' || payload === null) return undefined;
    const count = (payload as Record<string, unknown>).count;
    return typeof count === 'number' ? { count } : undefined;
  },
  encodePayload: (value) => ({ count: value.count }),
});

/** `window.localStorage` 相当の偽物。テスト間で共有できるよう関数の外で作る。 */
function createFakeStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
  };
}

/**
 * `subscribeKeydistStorageChanges` / `notifyKeydistStorageChange` 相当の偽物。
 * 実物はDOMの`CustomEvent`/`StorageEvent`を使うが、テストでは同じ形の
 * 「通知したら、そのキーを購読している全リスナーが呼ばれる」というpub/subだけを再現する。
 * 複数の `createAssetTabSync` インスタンス（＝複数タブに見立てる）が同じbusを共有できる。
 */
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

test('save→load: encodeしたJSONがそのまま往復できる', () => {
  const storage = createFakeStorage();
  const bus = createFakeBus();
  const sync = createAssetTabSync({
    storageKey: 'test:counter',
    codec: COUNTER_CODEC,
    storage,
    subscribe: bus.subscribe,
    notify: bus.notify,
    onExternalChange: () => assert.fail('自分の書き込みでは呼ばれない'),
  });

  assert.equal(sync.load(), undefined, '書き込み前は無い');
  sync.save({ count: 3 });
  assert.deepEqual(sync.load(), { count: 3 });
  sync.stop();
});

test('自タブの書き込みの反響（同一タブへのnotify）はonExternalChangeを呼ばない', () => {
  const storage = createFakeStorage();
  const bus = createFakeBus();
  let externalCalls = 0;
  const sync = createAssetTabSync({
    storageKey: 'test:counter',
    codec: COUNTER_CODEC,
    storage,
    subscribe: bus.subscribe,
    notify: bus.notify,
    onExternalChange: () => { externalCalls++; },
  });

  sync.save({ count: 1 });
  assert.equal(externalCalls, 0, 'save自体からのnotifyは自分の反響なので無視される');
  sync.stop();
});

test('他タブの書き込みはonExternalChangeへ渡る', () => {
  const storage = createFakeStorage();
  const bus = createFakeBus();
  const changes: Counter[] = [];
  const sync = createAssetTabSync({
    storageKey: 'test:counter',
    codec: COUNTER_CODEC,
    storage,
    subscribe: bus.subscribe,
    notify: bus.notify,
    onExternalChange: (value) => { changes.push(value); },
  });

  // 別タブ相当: 同じstorageへ直接書き込み、同じbusで通知する（このsyncのlastWrittenRawとは無関係）。
  storage.setItem('test:counter', JSON.stringify(COUNTER_CODEC.encode({ count: 42 })));
  bus.notify('test:counter');

  assert.deepEqual(changes, [{ count: 42 }]);
  sync.stop();
});

test('自分がsaveした後でも、他タブが別の値を書き込めば外部変更として届く', () => {
  const storage = createFakeStorage();
  const bus = createFakeBus();
  const changes: Counter[] = [];
  const sync = createAssetTabSync({
    storageKey: 'test:counter',
    codec: COUNTER_CODEC,
    storage,
    subscribe: bus.subscribe,
    notify: bus.notify,
    onExternalChange: (value) => { changes.push(value); },
  });

  sync.save({ count: 1 }); // 自分の書き込み（反響は無視される）
  storage.setItem('test:counter', JSON.stringify(COUNTER_CODEC.encode({ count: 2 }))); // 他タブ
  bus.notify('test:counter');

  assert.deepEqual(changes, [{ count: 2 }]);
  sync.stop();
});

test('無効なJSONの通知はonExternalChangeを呼ばず、onLoadFailureへinvalid-jsonを渡す', () => {
  const storage = createFakeStorage();
  const bus = createFakeBus();
  const failures: unknown[] = [];
  const sync = createAssetTabSync({
    storageKey: 'test:counter',
    codec: COUNTER_CODEC,
    storage,
    subscribe: bus.subscribe,
    notify: bus.notify,
    onExternalChange: () => assert.fail('decode失敗時は呼ばれない'),
    onLoadFailure: (reason) => { failures.push(reason); },
  });

  storage.setItem('test:counter', '{not json');
  bus.notify('test:counter');

  assert.equal(failures.length, 1);
  assert.deepEqual(failures[0], { kind: 'invalid-json' });
  sync.stop();
});

test('codecがdecodeできない形式（未来バージョン）はonLoadFailureへ理由を渡す', () => {
  const storage = createFakeStorage();
  const bus = createFakeBus();
  const failures: unknown[] = [];
  const sync = createAssetTabSync({
    storageKey: 'test:counter',
    codec: COUNTER_CODEC,
    storage,
    subscribe: bus.subscribe,
    notify: bus.notify,
    onExternalChange: () => assert.fail('decode失敗時は呼ばれない'),
    onLoadFailure: (reason) => { failures.push(reason); },
  });

  storage.setItem('test:counter', JSON.stringify({ version: 999, count: 1 }));
  bus.notify('test:counter');

  assert.equal(failures.length, 1);
  assert.deepEqual(failures[0], { kind: 'future-version', version: 999, currentVersion: 1 });
  sync.stop();
});

test('load: storageに壊れた値がある場合はundefinedを返し、onLoadFailureへ理由を渡す', () => {
  const storage = createFakeStorage();
  const bus = createFakeBus();
  const failures: unknown[] = [];
  storage.setItem('test:counter', JSON.stringify({ version: 1, count: 'not-a-number' }));

  const sync = createAssetTabSync({
    storageKey: 'test:counter',
    codec: COUNTER_CODEC,
    storage,
    subscribe: bus.subscribe,
    notify: bus.notify,
    onExternalChange: () => assert.fail('loadはonExternalChangeを呼ばない'),
    onLoadFailure: (reason) => { failures.push(reason); },
  });

  assert.equal(sync.load(), undefined);
  assert.equal(failures.length, 1);
  assert.deepEqual(failures[0], { kind: 'invalid-shape', message: 'payloadの形式が不正で読み取れない' });
  sync.stop();
});

test('stop: 購読解除後はnotifyが届いてもonExternalChangeを呼ばない', () => {
  const storage = createFakeStorage();
  const bus = createFakeBus();
  let calls = 0;
  const sync = createAssetTabSync({
    storageKey: 'test:counter',
    codec: COUNTER_CODEC,
    storage,
    subscribe: bus.subscribe,
    notify: bus.notify,
    onExternalChange: () => { calls++; },
  });
  sync.stop();

  storage.setItem('test:counter', JSON.stringify(COUNTER_CODEC.encode({ count: 5 })));
  bus.notify('test:counter');

  assert.equal(calls, 0);
});
