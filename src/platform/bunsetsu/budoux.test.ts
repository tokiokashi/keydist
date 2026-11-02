import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { splitBunsetsu } from './budoux.ts';
import { BUNSETSU_SPLITTER } from './info.ts';

test('分割器の版は、固定した版で、入れてあるbudouxの版と同じ', () => {
  const installed = JSON.parse(readFileSync(new URL('../../../node_modules/budoux/package.json', import.meta.url), 'utf8')) as { version: string };
  assert.match(BUNSETSU_SPLITTER.version, /^\d+\.\d+\.\d+$/);
  assert.equal(BUNSETSU_SPLITTER.version, installed.version);
});

test('断片を連結すると原文に戻り、文を文節らしい単位に分ける', () => {
  const text = '吾輩は猫である。名前はまだ無い。';
  const chunks = splitBunsetsu(text);
  assert.equal(chunks.join(''), text);
  assert.ok(chunks.length > 3);
  assert.deepEqual(splitBunsetsu(''), []);
});
