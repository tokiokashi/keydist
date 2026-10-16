import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// 旧画面が保存した自作の配列・物理配列・ローマ字規則・条件・個人速度・テーマは、新しい構成へ移さない。
// 旧画面の保存キーと、そのキーを読み書きしていたモジュールを、アプリのコードが参照していないことを検査する。
// テストと、新しい保存キーの説明で旧キーの名前を挙げるコメントは対象にしない。

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'src');

const FORBIDDEN = [
  'keydist:layouts',
  'keydist:romaji-rules',
  'keydist:geometry-shapes',
  'keydist:condition-presets',
  'keydist:ui-state',
  'keydist:theme',
  'keydist:selected-layouts',
  'keydist:text-collapsed',
  'keydist.playback-calibration',
  'user-layouts-storage',
  'user-geometries-storage',
  'romaji-settings-storage',
  'playback-calibration-storage',
];

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

test('アプリのコードは旧画面の保存キーと、そのキーを読み書きするモジュールを参照しない', async () => {
  const offenders: string[] = [];
  for (const file of await sourceFiles(SRC)) {
    const name = relative(SRC, file).split(sep).join('/');
    const code = (await readFile(file, 'utf8'))
      .split('\n')
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join('\n');
    for (const word of FORBIDDEN) {
      if (code.includes(word)) offenders.push(`${name}: ${word}`);
    }
  }
  assert.deepEqual(offenders, []);
});
