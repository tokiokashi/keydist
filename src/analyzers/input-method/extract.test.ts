import assert from 'node:assert/strict';
import test from 'node:test';
import { checkOptionsDiscipline } from '#analyzers/options.ts';
import { inputMethodDefinition } from './extract.ts';
import { DEFAULT_INPUT_METHOD_OPTIONS, inputMethodOptions } from './options.ts';

test('宣言と、抽出に効く設定の入れ忘れが無い', () => {
  assert.deepEqual(Object.keys(inputMethodOptions.items), []);
  assert.deepEqual(
    checkOptionsDiscipline(inputMethodOptions, inputMethodDefinition.optionsDiscipline),
    { keyViolations: [], viewExtractionViolations: [] },
  );
  assert.deepEqual(DEFAULT_INPUT_METHOD_OPTIONS, {});
});
