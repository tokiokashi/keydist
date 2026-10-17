import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// 参照先が見つからない時の文は`src/input/setup/missing-text.ts`に、読み込みの失敗の文は
// `src/hosts/shared/preset-file.ts`にだけ書く。各所は定数を読む。同じ文を別の場所に書き直すと、口調を直した時に直し漏れが出る。

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const MISSING_HOME = 'input/setup/missing-text.ts';
const IMPORT_HOME = 'hosts/shared/preset-file.ts';

// 名前の代わりの文は、文字列として単独で書いたものだけを対象にする（説明文の一部に同じ語が入るため）。
const SENTENCES = [
  '配列が見つかりません（削除された可能性があります）',
  '物理配列が見つかりません（削除された可能性があります）',
  'Setupが削除されました',
  "'見つからない物理配列'",
  "'削除されたSetup'",
  "'見つからない配列'",
  '見つからないローマ字規則',
  '見つからない指の割当',
  '既定に選んでいた物理配列が見つからないため',
];

const HOMES: readonly (readonly [string, readonly string[]])[] = [
  [MISSING_HOME, SENTENCES],
  [IMPORT_HOME, ['読み込みに失敗しました。もう一度試してください']],
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
    // コメント行は対象にしない（文を引用して説明することがある）。
    const text = (await readFile(file, 'utf8')).split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
    for (const [home, sentences] of HOMES) {
      if (rel === home) continue;
      for (const sentence of sentences) {
        if (text.includes(sentence)) problems.push(`${rel}: 「${sentence}」を直接書いている。${home}の定数を読む`);
      }
    }
  }
  assert.deepEqual(problems, []);
});
