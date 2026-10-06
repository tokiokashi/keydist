import assert from 'node:assert/strict';
import test from 'node:test';
import type { AnalysisTarget } from '#input/setup/index.ts';
import { SINGLE_TARGET_SELECTION_CODEC } from './single-target-selection-codec.ts';

const SETUP_A: AnalysisTarget = { kind: 'setup', setupId: 'a' };

test('SINGLE_TARGET_SELECTION_CODEC: encode→decodeで往復する', () => {
  for (const state of [{ target: SETUP_A }, { target: undefined }]) {
    const decoded = SINGLE_TARGET_SELECTION_CODEC.decode(SINGLE_TARGET_SELECTION_CODEC.encode(state));
    assert.equal(decoded.ok, true);
    assert.deepEqual(decoded.ok ? decoded.value : undefined, state);
  }
});

test('SINGLE_TARGET_SELECTION_CODEC: 壊れた対象（未知kind）は診断付きで「まだ選んでいない」へ戻す', () => {
  const decoded = SINGLE_TARGET_SELECTION_CODEC.decode({ version: 1, target: { kind: 'workspace', workspaceId: 'x' } });
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok ? decoded.value : undefined, { target: undefined });
  assert.ok(decoded.ok && decoded.diagnostics.length > 0);
});

test('SINGLE_TARGET_SELECTION_CODEC: object形式でなければdecode自体が失敗する', () => {
  assert.equal(SINGLE_TARGET_SELECTION_CODEC.decode('not-an-object').ok, false);
});
