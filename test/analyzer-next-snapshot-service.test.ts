import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnalysisSnapshotService } from '../src/features/analyzer-next/snapshot-service.ts';

test('same resolved calculation key reuses Snapshot across focus/timing/ViewConfig-like changes', () => {
  let evaluationCount = 0;
  let key = 'ja|qwerty|text:a|distance:1|catalog:1';
  let payload = 1;
  const service = createAnalysisSnapshotService({
    resolve: () => ({ key, input: payload }),
    evaluate: (input: number) => {
      evaluationCount += 1;
      return input * 10;
    },
  });

  assert.equal(service.get('qwerty'), 10);
  assert.equal(service.get('qwerty'), 10);
  assert.equal(evaluationCount, 1);

  // focus/timing/theme/ViewConfig changes never enter the resolved Snapshot key.
  const unrelatedUiRevision = 99;
  assert.equal(unrelatedUiRevision, 99);
  assert.equal(service.get('qwerty'), 10);
  assert.equal(evaluationCount, 1);

  key = 'ja|qwerty|text:a|distance:2|catalog:1';
  payload = 2;
  assert.equal(service.get('qwerty'), 20);
  assert.equal(evaluationCount, 2);
});

test('per-layout key change recomputes only that layout', () => {
  let qwertyKey = 'q:1';
  let naginataKey = 'n:1';
  let evaluationCount = 0;
  const service = createAnalysisSnapshotService({
    resolve: (layoutId: string) => ({
      key: layoutId === 'qwerty' ? qwertyKey : naginataKey,
      input: layoutId,
    }),
    evaluate: (layoutId: string) => {
      evaluationCount += 1;
      return `${layoutId}:${evaluationCount}`;
    },
  });

  service.get('qwerty');
  service.get('naginata');
  assert.equal(evaluationCount, 2);

  qwertyKey = 'q:2';
  service.get('qwerty');
  service.get('naginata');
  assert.equal(evaluationCount, 3);

  naginataKey = 'n:2';
  service.get('naginata');
  assert.equal(evaluationCount, 4);
});


test('repeated text/condition key changes do not retain stale Snapshots', () => {
  let revision = 0;
  const service = createAnalysisSnapshotService({
    resolve: (layoutId: string) => ({
      key: `${layoutId}:${revision}`,
      input: revision,
    }),
    evaluate: (input: number) => input,
  });

  for (revision = 0; revision < 100; revision += 1) {
    service.get('qwerty');
    assert.equal(service.cacheSize(), 1);
  }
});

test('shared cache key is kept until the last layout reference is invalidated', () => {
  const service = createAnalysisSnapshotService({
    resolve: () => ({ key: 'shared', input: 1 }),
    evaluate: (input: number) => input,
  });

  service.get('a');
  service.get('b');
  assert.equal(service.cacheSize(), 1);
  service.invalidateLayout('a');
  assert.equal(service.cacheSize(), 1);
  service.invalidateLayout('b');
  assert.equal(service.cacheSize(), 0);
});


test('selected layout becoming unavailable releases its cached Snapshot', () => {
  let available = true;
  const service = createAnalysisSnapshotService({
    resolve: () => available ? { key: 'qwerty:1', input: 1 } : undefined,
    evaluate: (input: number) => input,
  });

  assert.equal(service.get('qwerty'), 1);
  assert.equal(service.cacheSize(), 1);

  available = false;
  assert.equal(service.get('qwerty'), undefined);
  assert.equal(service.cacheSize(), 0);
});
