import assert from 'node:assert/strict';
import test from 'node:test';
import type { EngineRequestError } from '#engine/request.ts';
import type { ResolvedInputError } from '#engine/resolved-input.ts';
import { combinePaneStates, describeEngineRequestError, describeResolvedInputError, paneStatusLabel } from './pane-status.ts';

test('paneStatusLabel: 各状態に短い文言を返す', () => {
  assert.equal(paneStatusLabel('idle'), '未計算');
  assert.equal(paneStatusLabel('computing'), '計算中…');
  assert.equal(paneStatusLabel('stale'), '計算中…（直前の結果を表示）');
  assert.equal(paneStatusLabel('ready'), '');
  assert.equal(paneStatusLabel('failed'), '失敗');
});

test('describeResolvedInputError: reference（配列・形状の削除）', () => {
  const error: ResolvedInputError = {
    kind: 'reference',
    errors: [{ kind: 'layout-missing', layoutId: 'ghost-layout' }],
  };
  assert.match(describeResolvedInputError(error), /ghost-layout/);
});

test('describeResolvedInputError: incompatible-text（このテキストには使えないSetup）', () => {
  const error: ResolvedInputError = {
    kind: 'incompatible-text',
    layout: { name: 'NICOLA' } as never,
    language: 'en',
  };
  const message = describeResolvedInputError(error);
  assert.match(message, /NICOLA/);
  assert.match(message, /英語/);
});

test('describeResolvedInputError: geometry（形状が組めない）', () => {
  const error: ResolvedInputError = { kind: 'geometry', message: '行数が足りない' };
  assert.match(describeResolvedInputError(error), /行数が足りない/);
});

test('describeEngineRequestError: resolutionはResolvedInputErrorへ委譲する', () => {
  const error: EngineRequestError = {
    kind: 'resolution',
    error: { kind: 'geometry', message: 'boom' },
  };
  assert.match(describeEngineRequestError(error), /boom/);
});

test('describeEngineRequestError: exceptionはErrorのmessageを使う', () => {
  const error: EngineRequestError = { kind: 'exception', error: new Error('computed failure') };
  assert.match(describeEngineRequestError(error), /computed failure/);
});

test('combinePaneStates: 抽出がreadyでもTraceが揃っていなければ計算中にする', () => {
  const ready = { status: 'ready', value: 1 } as const;
  assert.deepEqual(combinePaneStates(ready, { status: 'computing' }), { status: 'computing' });
  assert.deepEqual(combinePaneStates(ready, { status: 'idle' }), { status: 'computing' });
  assert.deepEqual(combinePaneStates(ready, { status: 'stale', value: 'old' }), { status: 'stale', value: 1 });
  assert.deepEqual(combinePaneStates(ready, { status: 'ready', value: 'trace' }), ready);
});

test('combinePaneStates: どちらかの失敗はそのまま出す', () => {
  const failed = { status: 'failed', error: { kind: 'exception', message: 'x' } } as never;
  assert.equal(combinePaneStates(failed, { status: 'ready', value: 0 }), failed);
  assert.equal(combinePaneStates({ status: 'ready', value: 1 }, failed), failed);
  assert.deepEqual(combinePaneStates({ status: 'computing' }, { status: 'ready', value: 0 }), { status: 'computing' });
});
