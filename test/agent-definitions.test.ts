import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// reviewerとreviewer-strictは、手順の本文を同じにし、frontmatterのname・description・model・colorだけを変える（AGENTS.md「エージェントの役割」）。
// 片方だけ直すと区分によってレビューの手順が変わるので、この約束をテストで確かめる。

const AGENTS_DIR = join(dirname(dirname(fileURLToPath(import.meta.url))), '.claude', 'agents');

// 区分ごとに変わってよいfrontmatterのキー
const VARIABLE_KEYS = new Set(['name', 'description', 'model', 'color']);

type Definition = { frontmatter: Record<string, string>; body: string };

/** 定義ファイルをfrontmatterと本文に分ける。frontmatterは`key: value`の行だけを読む */
function parseDefinition(file: string): Definition {
  const text = readFileSync(join(AGENTS_DIR, file), 'utf8');
  const lines = text.split('\n');
  assert.equal(lines[0], '---', `${file}の先頭がfrontmatterの区切りではない`);
  const end = lines.indexOf('---', 1);
  assert.notEqual(end, -1, `${file}のfrontmatterが閉じていない`);

  const frontmatter: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    if (line.trim() === '') continue;
    const colon = line.indexOf(':');
    assert.notEqual(colon, -1, `${file}のfrontmatterにkey: valueでない行がある: ${line}`);
    frontmatter[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  const body = lines.slice(end + 1).join('\n').trim();
  return { frontmatter, body };
}

describe('reviewerとreviewer-strictの定義', () => {
  const reviewer = parseDefinition('reviewer.md');
  const strict = parseDefinition('reviewer-strict.md');

  test('手順の本文が一致する', () => {
    assert.equal(
      strict.body,
      reviewer.body,
      'reviewer.mdとreviewer-strict.mdの本文が違う。手順を直す時は両方を同じように直す',
    );
  });

  test('frontmatterのname・description・model・color以外のキーと値が一致する', () => {
    const pick = (fm: Record<string, string>) =>
      Object.fromEntries(Object.entries(fm).filter(([key]) => !VARIABLE_KEYS.has(key)));
    assert.deepEqual(
      pick(strict.frontmatter),
      pick(reviewer.frontmatter),
      'name・description・model・color以外のfrontmatterが違う',
    );
  });

  test('可変のキーは両方に存在する', () => {
    for (const fm of [reviewer.frontmatter, strict.frontmatter]) {
      for (const key of VARIABLE_KEYS) {
        assert.ok(fm[key], `frontmatterに${key}が無い`);
      }
    }
  });
});
