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
    /** 今リスナーとして生きている数（StrictModeの二重実行後に購読が1つだけ残っているか等の検査用）。 */
    listenerCount: () => listeners.size,
  };
}

test('save→load: encodeしたJSONがそのまま往復できる（start()を呼ばなくてもload/saveは使える）', () => {
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
  const stop = sync.start();

  sync.save({ count: 1 });
  assert.equal(externalCalls, 0, 'save自体からのnotifyは自分の反響なので無視される');
  stop();
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
  const stop = sync.start();

  // 別タブ相当: 同じstorageへ直接書き込み、同じbusで通知する（このsyncのlastWrittenRawとは無関係）。
  storage.setItem('test:counter', JSON.stringify(COUNTER_CODEC.encode({ count: 42 })));
  bus.notify('test:counter');

  assert.deepEqual(changes, [{ count: 42 }]);
  stop();
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
  const stop = sync.start();

  sync.save({ count: 1 }); // 自分の書き込み（反響は無視される）
  storage.setItem('test:counter', JSON.stringify(COUNTER_CODEC.encode({ count: 2 }))); // 他タブ
  bus.notify('test:counter');

  assert.deepEqual(changes, [{ count: 2 }]);
  stop();
});

test('自分がA→他タブがB→他タブがAに戻す、の3手目も外部変更として届く（反響の誤判定をしない）', () => {
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
  const stop = sync.start();

  sync.save({ count: 1 }); // 1手目: 自分がAを書く（反響は無視される。ここではonExternalChangeは呼ばれない）
  const rawA = storage.getItem('test:counter');

  storage.setItem('test:counter', JSON.stringify(COUNTER_CODEC.encode({ count: 2 }))); // 2手目: 他タブがBを書く
  bus.notify('test:counter');

  storage.setItem('test:counter', rawA!); // 3手目: 他タブがAに戻す（storageの中身はsave時のrawと再び一致する）
  bus.notify('test:counter');

  // lastWrittenRawを外部変更の取り込み時にも更新していれば、3手目は「自分の反響」ではなく
  // 「他タブが書いた値と一致した」と正しく判定され、onExternalChangeが呼ばれる。
  assert.deepEqual(changes, [{ count: 2 }, { count: 1 }]);
  stop();
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
  const stop = sync.start();

  storage.setItem('test:counter', '{not json');
  bus.notify('test:counter');

  assert.equal(failures.length, 1);
  assert.deepEqual(failures[0], { kind: 'invalid-json' });
  stop();
});

test('同じ壊れたrawの通知が2回続けば、onLoadFailureも2回呼ばれる（壊れたrawは覚えて黙らない）', () => {
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
  const stop = sync.start();

  storage.setItem('test:counter', '{not json');
  bus.notify('test:counter');
  bus.notify('test:counter'); // 同じ壊れたrawのまま、もう一度通知が来る

  assert.equal(failures.length, 2, '壊れたrawを覚えて2回目を黙って無視したりしない');
  stop();
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
  const stop = sync.start();

  storage.setItem('test:counter', JSON.stringify({ version: 999, count: 1 }));
  bus.notify('test:counter');

  assert.equal(failures.length, 1);
  assert.deepEqual(failures[0], { kind: 'future-version', version: 999, currentVersion: 1 });
  stop();
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
  assert.deepEqual(failures[0], { kind: 'invalid-shape', message: 'payloadの形式が不正で読み取れません' });
});

test('start()が返す停止関数を呼ぶと、以後notifyが届いてもonExternalChangeを呼ばない', () => {
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
  const stop = sync.start();
  stop();

  storage.setItem('test:counter', JSON.stringify(COUNTER_CODEC.encode({ count: 5 })));
  bus.notify('test:counter');

  assert.equal(calls, 0);
});

/**
 * ReactのStrictMode（開発時のmount→cleanup→mountの二重実行）を模した回帰テスト
 * （`start()`と`stop()`を同じ`useEffect`のペアで呼ばず、構築時に
 * 自動購読・effectのcleanupでだけ停止する設計だと、この2回目の`start()`が
 * 存在しないため、二重実行後は外部変更を二度と受け取れなくなる）。
 */
test('start→stop→start（StrictModeの二重実行を模す）しても、2回目のstart後は外部変更が届く', () => {
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

  const stop1 = sync.start(); // 1回目のmount
  stop1(); // StrictModeが模す cleanup
  assert.equal(bus.listenerCount(), 0, 'cleanup後は購読が残らない');

  const stop2 = sync.start(); // 2回目のmount（実際に生きる購読）
  assert.equal(bus.listenerCount(), 1);

  storage.setItem('test:counter', JSON.stringify(COUNTER_CODEC.encode({ count: 7 })));
  bus.notify('test:counter');

  assert.deepEqual(changes, [{ count: 7 }], '2回目のstart後も外部変更が届く');
  stop2();
});

test('catchUp: 通知が届く前でも、他タブがstorageへ書いた値を取り込む', () => {
  const storage = createFakeStorage();
  const changes: Counter[] = [];
  const sync = createAssetTabSync({
    storageKey: 'test:counter',
    codec: COUNTER_CODEC,
    storage,
    subscribe: createFakeBus().subscribe,
    notify: () => {},
    onExternalChange: (value) => { changes.push(value); },
  });
  sync.save({ count: 1 });
  sync.catchUp();
  assert.deepEqual(changes, [], '自分の書き込みのままなら何もしない');

  storage.setItem('test:counter', JSON.stringify(COUNTER_CODEC.encode({ count: 2 })));
  sync.catchUp();
  sync.catchUp();
  assert.deepEqual(changes, [{ count: 2 }], '同じ値を2度取り込まない');
});

test('catchUp: 読み込んだ直後の値は他タブの変更として扱わない', () => {
  const storage = createFakeStorage();
  storage.setItem('test:counter', JSON.stringify(COUNTER_CODEC.encode({ count: 5 })));
  const sync = createAssetTabSync({
    storageKey: 'test:counter',
    codec: COUNTER_CODEC,
    storage,
    subscribe: createFakeBus().subscribe,
    notify: () => {},
    onExternalChange: () => assert.fail('読み込み済みの値で呼ばれた'),
  });
  assert.deepEqual(sync.load(), { count: 5 });
  sync.catchUp();
});

test('catchUp: decodeできない値は取り込まずonLoadFailureへ渡す', () => {
  const storage = createFakeStorage();
  const failures: unknown[] = [];
  const sync = createAssetTabSync({
    storageKey: 'test:counter',
    codec: COUNTER_CODEC,
    storage,
    subscribe: createFakeBus().subscribe,
    notify: () => {},
    onExternalChange: () => assert.fail('壊れた値を取り込んだ'),
    onLoadFailure: (reason) => { failures.push(reason); },
  });
  storage.setItem('test:counter', '{not json');
  sync.catchUp();
  assert.deepEqual(failures, [{ kind: 'invalid-json' }]);
});
