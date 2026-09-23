import assert from 'node:assert/strict';
import test from 'node:test';
import { createDebouncedPersistenceScheduler } from '../src/persistence/debounced-scheduler.ts';

/**
 * Phase 5のワークスペース永続化とPhase 6の入力コンバータ設定永続化、両方が使う
 * 汎用スケジューラそのものの単体テスト。書き込み先の型に依存しない形で検証する。
 */

interface Sample {
  n: number;
}

function writesRecorder() {
  const values: Sample[] = [];
  return { values, write: (value: Sample) => values.push(value) };
}

test('generic scheduler: rapid notify() calls debounce into a single write', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { values, write } = writesRecorder();
  const scheduler = createDebouncedPersistenceScheduler<Sample>({
    write,
    serialize: (value) => JSON.stringify(value),
    debounceMs: 300,
  });

  scheduler.notify({ n: 1 });
  t.mock.timers.tick(100);
  scheduler.notify({ n: 2 });
  t.mock.timers.tick(100);
  scheduler.notify({ n: 3 });
  assert.equal(values.length, 0);

  t.mock.timers.tick(300);
  assert.deepEqual(values, [{ n: 3 }]);
});

test('generic scheduler: identical serialized value is not written twice', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { values, write } = writesRecorder();
  const scheduler = createDebouncedPersistenceScheduler<Sample>({
    write,
    serialize: (value) => JSON.stringify(value),
    debounceMs: 50,
  });

  scheduler.notify({ n: 1 });
  t.mock.timers.tick(50);
  assert.equal(values.length, 1);

  scheduler.notify({ n: 1 });
  t.mock.timers.tick(50);
  assert.equal(values.length, 1);
});

test('generic scheduler: flush() writes immediately and cancels the pending timer', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { values, write } = writesRecorder();
  const scheduler = createDebouncedPersistenceScheduler<Sample>({
    write,
    serialize: (value) => JSON.stringify(value),
    debounceMs: 1000,
  });

  scheduler.notify({ n: 1 });
  scheduler.flush();
  assert.deepEqual(values, [{ n: 1 }]);

  t.mock.timers.tick(1000);
  assert.equal(values.length, 1);
});

test('generic scheduler: flush() with nothing pending is a no-op', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { values, write } = writesRecorder();
  const scheduler = createDebouncedPersistenceScheduler<Sample>({
    write,
    serialize: (value) => JSON.stringify(value),
    debounceMs: 100,
  });

  scheduler.flush();
  assert.equal(values.length, 0);
});

test('generic scheduler: cancel() drops the pending write', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { values, write } = writesRecorder();
  const scheduler = createDebouncedPersistenceScheduler<Sample>({
    write,
    serialize: (value) => JSON.stringify(value),
    debounceMs: 200,
  });

  scheduler.notify({ n: 1 });
  scheduler.cancel();
  t.mock.timers.tick(200);
  assert.equal(values.length, 0);
});

test('generic scheduler: notify() after flush schedules a fresh debounce window', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { values, write } = writesRecorder();
  const scheduler = createDebouncedPersistenceScheduler<Sample>({
    write,
    serialize: (value) => JSON.stringify(value),
    debounceMs: 100,
  });

  scheduler.notify({ n: 1 });
  scheduler.flush();
  assert.deepEqual(values, [{ n: 1 }]);

  scheduler.notify({ n: 2 });
  t.mock.timers.tick(100);
  assert.deepEqual(values, [{ n: 1 }, { n: 2 }]);
});
