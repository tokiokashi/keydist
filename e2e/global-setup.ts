import { realpathSync } from 'node:fs';
import { dirname } from 'node:path';

import type { FullConfig } from '@playwright/test';

// webServerの起動後に走る。`reuseExistingServer` は、ポートが重なると別のserverを
// 黙って使い回し、自分のコードを測っていない結果になる。ポートはworktreeのパスから決めるが、
// ハッシュの衝突や手で立てたserverで重なりうるので、使うserverが自分のworktreeのものかをここで確かめる。
// dev serverは `vite.config.ts` のプラグインで、自分のルートを `/__e2e-root` に返す。
// 自分のルートと完全に一致しなければ止めるので、祖先・子孫・横のworktree、別のプロジェクトのserverを区別できる。
export default async function globalSetup(config: FullConfig): Promise<void> {
  if (process.env.CI) return;
  // リンク経由の `-c` でも、serverが返す実体のパスと比べられるよう実体にそろえる
  const root = realpathSync(dirname(config.configFile ?? ''));
  const baseURL = config.projects[0]?.use.baseURL;
  const res = await fetch(`${baseURL}/__e2e-root`).catch(() => undefined);
  if (!res) {
    throw new Error(`${baseURL} のserverに接続できません。`);
  }
  const served = res.ok ? (await res.text()).trim() : '';
  if (served !== root) {
    throw new Error(
      `${baseURL} で動いているserverが、このworktree（${root}）のものではありません` +
        `（serverのルート: ${served || `不明、応答 ${res.status}`}）。` +
        '別のserverがこのポートを使っています。環境変数 KEYDIST_E2E_PORT で別のポートを指定してください。',
    );
  }
}
