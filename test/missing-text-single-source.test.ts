import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// 参照先が見つからない時の文は、`src/input/setup/missing-text.ts`にだけ書く。
// 各所は定数を読む。同じ文を別の場所に書き直すと、口調を直した時に直し漏れが出る。

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const HOME = 'input/setup/missing-text.ts';

// 名前の代わりの文は、文字列として単独で書いたものだけを対象にする（説明文の一部に同じ語が入るため）。
const SENTENCES = [
  '配列が見つかりません（削除された可能性があります）',
  '物理配列が見つかりません（削除された可能性があります）',
  'Setupが削除されました',
  "'見つからない物理配列'",
  "'削除されたSetup'",
];

async function sourceFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(path);
  }
  return files;
}

test('見つからない時の文は1か所にだけ書かれている', async () => {
  const problems: string[] = [];
  for (const file of await sourceFiles(SRC)) {
    const rel = relative(SRC, file).split('\\').join('/');
    if (rel === HOME) continue;
    // コメント行は対象にしない（文を引用して説明することがある）。
    const text = (await readFile(file, 'utf8')).split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
    for (const sentence of SENTENCES) {
      if (text.includes(sentence)) problems.push(`${rel}: 「${sentence}」を直接書いている。${HOME}の定数を読む`);
    }
  }
  assert.deepEqual(problems, []);
});
