import assert from 'node:assert/strict';
import test from 'node:test';
import { microtaskScheduler } from './scheduler.ts';

test('microtaskScheduler: 依頼したタスクを1回だけ実行する', async () => {
  let calls = 0;
  microtaskScheduler.schedule(() => {
    calls++;
  });
  await Promise.resolve();
  assert.equal(calls, 1);
});

test('microtaskScheduler: 実行前にキャンセルすればタスクは走らない', async () => {
  let calls = 0;
  const cancel = microtaskScheduler.schedule(() => {
    calls++;
  });
  cancel();
  await Promise.resolve();
  assert.equal(calls, 0);
});

test('microtaskScheduler: 実行後のキャンセルは何もしない（二重実行にならない）', async () => {
  let calls = 0;
  const cancel = microtaskScheduler.schedule(() => {
    calls++;
  });
  await Promise.resolve();
  cancel();
  await Promise.resolve();
  assert.equal(calls, 1);
});
