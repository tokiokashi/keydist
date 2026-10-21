import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { splitBunsetsu } from './budoux.ts';
import { BUNSETSU_SPLITTER } from './info.ts';

test('分割器の版は package.json の budoux の版と同じ', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as { dependencies: Record<string, string> };
  assert.equal(pkg.dependencies.budoux, BUNSETSU_SPLITTER.version);
});

test('断片を連結すると原文に戻り、文を文節らしい単位に分ける', () => {
  const text = '吾輩は猫である。名前はまだ無い。';
  const chunks = splitBunsetsu(text);
  assert.equal(chunks.join(''), text);
  assert.ok(chunks.length > 3);
  assert.deepEqual(splitBunsetsu(''), []);
});
