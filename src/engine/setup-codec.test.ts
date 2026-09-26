import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSetup, type SetupLibrary } from '#input/setup/index.ts';
import { SETUP_LIBRARY_CODEC } from './setup-codec.ts';
import type { SettingsValueMap } from './settings-items.ts';

let nextId = 0;
const generateId = () => `setup-${++nextId}`;

test('SETUP_LIBRARY_CODEC: 実際のSetupの手持ち（createSetupの結果）をencode→decodeで往復できる', () => {
  const empty: SetupLibrary<SettingsValueMap> = { setups: [], overrides: {} };
  const withOne = createSetup(empty, 'qwerty', 'row-staggered', generateId, 'メイン');
  const withTwo = createSetup(withOne, 'oonishi', 'row-staggered', generateId);

  const decoded = SETUP_LIBRARY_CODEC.decode(SETUP_LIBRARY_CODEC.encode(withTwo));
  assert.equal(decoded.ok, true);
  if (decoded.ok) {
    assert.deepEqual(decoded.value, withTwo);
    assert.deepEqual(decoded.diagnostics, []);
  }
});

test('SETUP_LIBRARY_CODEC: 未来バージョンの資産は黙って切り捨てず失敗として報告する', () => {
  const result = SETUP_LIBRARY_CODEC.decode({ version: 999, setups: [] });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason.kind, 'future-version');
});
