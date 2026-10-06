import assert from 'node:assert/strict';
import test from 'node:test';
import type { EngineRequestError } from '#engine/request.ts';
import type { ResolvedInputError } from '#engine/resolved-input.ts';
import { combinePaneStates, describeEngineRequestError, describeResolvedInputError, engineRequestErrorDetail, paneStatusLabel } from './pane-status.ts';

test('paneStatusLabel: 各状態に短い文言を返す', () => {
  assert.equal(paneStatusLabel('idle'), '');
  assert.equal(paneStatusLabel('computing'), '計算中…');
  assert.equal(paneStatusLabel('stale'), '計算中…（直前の結果を表示）');
  assert.equal(paneStatusLabel('ready'), '');
  assert.equal(paneStatusLabel('failed'), '失敗');
});

test('describeResolvedInputError: reference（配列・物理配列の削除）', () => {
  const error: ResolvedInputError = {
    kind: 'reference',
    errors: [{ kind: 'layout-missing', layoutId: 'ghost-layout' }],
  };
  const message = describeResolvedInputError(error);
  assert.match(message, /配列が見つからない/);
  // 画面にそのまま出る文なので、内部のidは含めない。
  assert.doesNotMatch(message, /ghost-layout/);
});

test('describeResolvedInputError: 削除された対象はidを出さず、1つの短い理由にする', () => {
  const setupMissing: ResolvedInputError = { kind: 'target-missing', target: { kind: 'setup', setupId: '3f2a-uuid' } };
  const layoutMissing: ResolvedInputError = { kind: 'target-missing', target: { kind: 'layout', layoutId: 'gone-layout' } };
  const shapeMissing: ResolvedInputError = { kind: 'reference', errors: [{ kind: 'shape-missing', shapeId: 'gone-shape' }] };
  assert.equal(describeResolvedInputError(setupMissing), 'Setupが削除された');
  for (const error of [setupMissing, layoutMissing, shapeMissing]) {
    const message = describeResolvedInputError(error);
    assert.doesNotMatch(message, /3f2a|gone-|:/);
  }
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

test('describeResolvedInputError: geometry（物理配列が組めない）', () => {
  const error: ResolvedInputError = { kind: 'geometry', message: '指割り当て「finger-x」にキー q が無い' };
  const message = describeResolvedInputError(error);
  assert.match(message, /組み立てられない/);
  // 例外の文は定義の内部（idやキー名）を指すので出さない。
  assert.doesNotMatch(message, /finger-x/);
});

test('describeEngineRequestError: resolutionはResolvedInputErrorへ委譲する', () => {
  const error: EngineRequestError = {
    kind: 'resolution',
    error: { kind: 'geometry', message: 'boom' },
  };
  assert.equal(describeEngineRequestError(error), describeResolvedInputError(error.error));
});

test('describeEngineRequestError: exceptionは1文だけ返し、原文は詳細へ分ける', () => {
  const error: EngineRequestError = { kind: 'exception', error: new Error('キー k_12 が無い') };
  assert.doesNotMatch(describeEngineRequestError(error), /k_12/);
  assert.match(engineRequestErrorDetail(error).join('\n'), /k_12/);
  assert.deepEqual(engineRequestErrorDetail({ kind: 'exception', error: 'plain' }), ['plain']);
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
