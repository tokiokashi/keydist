import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSET_KEYS, ASSET_STORAGE_SPECS } from '#app/standalone/asset-storage-specs.ts';

/**
 * storageキーの重複検出（コーディネーター指示）。
 *
 * `ASSET_STORAGE_SPECS`（#544 §5・§8-2）のキーどうしが重複しないことに加え、
 * リポジトリ内の他の `keydist:*` 定数（layouts / geometry-shapes / romaji-rules /
 * app-state 等。`platform/assets/*-storage.ts` 以外にも `legacy/` `tester/` `app/`に散っている）
 * とも衝突しないことを検査する。ファイルを列挙しない（architecture-layers.test.tsと同じ方針。
 * `keydist:` 定数を足せば自動で検査対象になる）。
 */

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'src');

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() ? [path] : [];
  }));
  return nested.flat();
}

/**
 * `export const XXX = 'keydist:...'` のような**宣言**だけを拾う。単なる参照
 * （`localStorage.getItem('keydist:app-state')`のような、定数を再exportせず
 * 生の文字列で直接読む書き方。`app/theme/theme.ts`が旧キーをread-onlyで読む時に使う）は
 * 対象にしない（宣言と同じ値を意図的に再掲しているだけで、衝突ではないため）。
 */
function declaredKeydistKeys(source: string): string[] {
  const matches = source.matchAll(/=\s*['"](keydist:[A-Za-z0-9_-]+)['"]/g);
  return [...matches].map((match) => match[1]!);
}

async function allDeclaredKeydistKeys(): Promise<string[]> {
  const files = (await sourceFiles(SRC)).filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path));
  const perFile = await Promise.all(files.map(async (path) => declaredKeydistKeys(await readFile(path, 'utf8'))));
  return perFile.flat();
}

test('ASSET_STORAGE_SPECS: storageKeyが資産キーどうしで重複しない', () => {
  const keys = ASSET_KEYS.map((key) => ASSET_STORAGE_SPECS[key].storageKey);
  assert.deepEqual(keys, [...new Set(keys)]);
});

test('ASSET_STORAGE_SPECS: KeydistAssetsの全キーを表がカバーする', () => {
  // `{ [K in keyof KeydistAssets]: ... }`という定義そのものが型検査で強制するが、
  // 実行時にも「表が空でない」ことだけ最小限確認する（型だけに頼らない）。
  assert.ok(ASSET_KEYS.length > 0);
});

test('リポジトリ全体の keydist:* 定数が重複しない（storage keyの衝突検出）', async () => {
  const declared = await allDeclaredKeydistKeys();
  const seen = new Map<string, number>();
  for (const key of declared) seen.set(key, (seen.get(key) ?? 0) + 1);
  const duplicates = [...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key);
  assert.deepEqual(duplicates, []);
});

test('ASSET_STORAGE_SPECS のstorageKeyはリポジトリ全体の宣言と一致する（表が古いキーを指していないか）', async () => {
  const declared = new Set(await allDeclaredKeydistKeys());
  const missing = ASSET_KEYS
    .map((key) => ASSET_STORAGE_SPECS[key].storageKey)
    .filter((storageKey) => !declared.has(storageKey));
  assert.deepEqual(missing, []);
});
