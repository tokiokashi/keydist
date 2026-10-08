import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { REPOSITORY_URL, SPEC_LINKS } from './links.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('仕様書のリンクは、リポジトリに実在するファイルを指す', () => {
  assert.ok(SPEC_LINKS.length > 0);
  for (const link of SPEC_LINKS) {
    assert.ok(existsSync(join(ROOT, link.path)), `${link.path} がリポジトリに無い`);
    assert.equal(link.url, `${REPOSITORY_URL}/blob/main/${link.path}`);
  }
});
