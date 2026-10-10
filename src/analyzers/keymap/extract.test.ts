import assert from 'node:assert/strict';
import test from 'node:test';
import { checkOptionsDiscipline } from '#analyzers/options.ts';
import { keymapDefinition } from './extract.ts';
import { DEFAULT_KEYMAP_OPTIONS, keymapOptions } from './options.ts';

test('宣言と、抽出に効く設定の入れ忘れが無い', () => {
  assert.deepEqual(Object.keys(keymapOptions.items), []);
  assert.deepEqual(
    checkOptionsDiscipline(keymapOptions, keymapDefinition.optionsDiscipline),
    { keyViolations: [], viewExtractionViolations: [] },
  );
  assert.deepEqual(DEFAULT_KEYMAP_OPTIONS, {});
});
