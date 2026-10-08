import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// 旧画面（legacy/・features/analyzer-next/）が保存した自作の配列・ローマ字規則は新しい側へ移さない。
// 新しい側のコードが旧画面の保存キーや、そのキーを読み書きするモジュールを参照していないことを検査する。

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'src');

const OLD_SIDE_PREFIXES = ['legacy/', 'features/analyzer-next/'];
/** 旧画面の保存キーを定義するモジュール。旧側だけが使う。 */
const OLD_STORAGE_MODULES = new Set([
  'platform/assets/user-layouts-storage.ts',
  'platform/assets/romaji-settings-storage.ts',
]);
const FORBIDDEN = [
  'keydist:layouts',
  'keydist:romaji-rules',
  'user-layouts-storage',
  'romaji-settings-storage',
];

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

test('新しい側のコードは旧画面の保存キー（keydist:layouts・keydist:romaji-rules）を読まない', async () => {
  const offenders: string[] = [];
  for (const file of await sourceFiles(SRC)) {
    const name = relative(SRC, file).split(sep).join('/');
    if (OLD_SIDE_PREFIXES.some((prefix) => name.startsWith(prefix))) continue;
    if (OLD_STORAGE_MODULES.has(name)) continue;
    // 旧画面の保存を前提にしたテストは旧側の検査で、新しい側の読み取りではない
    if (name === 'input/layouts/user-layouts-decode.test.ts') continue;
    const text = await readFile(file, 'utf8');
    for (const word of FORBIDDEN) {
      // 新しい保存キーの説明で旧キーの名前を挙げるコメントは許す
      const code = text.split('\n').filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line)).join('\n');
      if (code.includes(word)) offenders.push(`${name}: ${word}`);
    }
  }
  assert.deepEqual(offenders, []);
});
