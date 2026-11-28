import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { configureKanjiDirectLoader, kanjiDirectLayout, kanjiDirectStatus, requestKanjiDirectLayout } from './kanji-direct-tables.ts';
import { SECCA_DECLARATION } from './secca.ts';
import { tableIdentityOf } from './table-identity.ts';

test('requestKanjiDirectLayoutで作った雪華の配列は、一度に作った配列と一致し、識別子を持つ', async () => {
  const table = JSON.parse(readFileSync(new URL('./tables/secca.json', import.meta.url), 'utf8')) as unknown;
  configureKanjiDirectLoader(() => Promise.resolve(table));
  const pending = requestKanjiDirectLayout('secca');
  assert.equal(kanjiDirectStatus('secca'), 'loading');
  await pending;
  assert.equal(kanjiDirectStatus('secca'), 'loaded');
  const built = kanjiDirectLayout('secca')!;
  assert.deepEqual(built, SECCA_DECLARATION.layoutFromTable(table));
  assert.notEqual(tableIdentityOf(built), undefined);
});
