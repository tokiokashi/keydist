import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { REPOSITORY_URL, SPEC_LINKS } from './links.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('仕様書のリンクは、リポジトリに実在するファイルを指す', () => {
  assert.ok(SPEC_LINKS.length > 0);
  for (const link of SPEC_LINKS) {
    assert.ok(existsSync(join(ROOT, link.path)), `${link.path} がリポジトリに無い`);
    assert.equal(link.url, `${REPOSITORY_URL}/blob/main/${link.path}${link.anchor === undefined ? '' : `#${link.anchor}`}`);
  }
});

test('アンカー付きのリンクは、仕様書に実在する見出しを指す', () => {
  const anchored = SPEC_LINKS.filter((link) => link.heading !== undefined);
  assert.ok(anchored.length > 0);
  for (const link of anchored) {
    const lines = readFileSync(join(ROOT, link.path), 'utf8').split('\n');
    assert.ok(lines.some((line) => /^#{1,6} /.test(line) && line.replace(/^#+ /, '') === link.heading), `${link.path} に見出し「${link.heading}」が無い`);
  }
});

test('構造解析モデルのリンクは、距離モデルの仕様書の§10の見出しへのアンカーを持つ', () => {
  const link = SPEC_LINKS.find((l) => l.label === '構造解析モデルの仕様');
  assert.equal(link?.url, `${REPOSITORY_URL}/blob/main/spec/distance-model.md#10-任意時点の指位置`);
});
