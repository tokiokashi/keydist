import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 解析設定の下書きは、自分が保存先へ書いた値の記録（`OptionsWriteLogsProvider`）が渡されて初めて
// 保存の反響を見分けられる。渡し忘れても画面は動くが、静かに保存の反響で下書きが巻き戻る挙動へ戻るので、
// ページを組み立てる `app` のファイルが provider を使っているかを静的に検査する。

const APP = join(dirname(dirname(fileURLToPath(import.meta.url))), 'src', 'app');

async function listTsx(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await listTsx(path)));
    else if (entry.name.endsWith('.tsx')) found.push(path);
  }
  return found;
}

test('解析設定の下書きを持つページを組み立てる app のファイルは、OptionsWriteLogsProvider で包む', async () => {
  const pageElement = /<(?:\w+StandalonePage|WorkspacePage)\b/;
  const mounted: string[] = [];
  for (const file of await listTsx(APP)) {
    const text = await readFile(file, 'utf8');
    if (!pageElement.test(text)) continue;
    mounted.push(file);
    assert.match(text, /<OptionsWriteLogsProvider\b/, `${file} が OptionsWriteLogsProvider を使っていない`);
  }
  // 検査の対象が空になっていないこと（個別画面3つとWorkspace）
  assert.ok(mounted.length >= 4, `対象のファイルが${mounted.length}個しか見つからない`);
});
