import { defineConfig, devices } from '@playwright/test';

import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const isCI = Boolean(process.env.CI);

// 手元のポートはworktreeごとに分ける。固定にすると、並行する別worktreeのdev serverが
// 先に同じポートで起動していた時に `reuseExistingServer` がそれを使い回し、
// 自分のコードを測っていない結果が出る。configのあるディレクトリ（リポジトリのルート）の
// 絶対パスから4200〜4999を決めるので、どのディレクトリから回しても同じworktreeなら同じポートになる。
// ハッシュの衝突や手で立てたserverでポートが重なる場合は、`e2e/global-setup.ts` が
// 自分のworktreeのものでないserverを検出して実行を止める。止まった時や固定したい時は
// `KEYDIST_E2E_PORT` で上書きする。
// CIは1ジョブにつき新しい実行環境で、同時に立つserverは1つだけ（`reuseExistingServer` も無効）なので、
// 衝突の恐れが無く、従来どおり4173の固定にしてある。
const rootDir = fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '');

function resolvePort(): number {
  const fromEnv = process.env.KEYDIST_E2E_PORT;
  if (fromEnv) {
    // 0x1100 や 1e3 のような書き方は受け付けず、十進数だけにする
    const port = /^\d+$/.test(fromEnv.trim()) ? Number(fromEnv) : Number.NaN;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("不正なポート指定です: KEYDIST_E2E_PORT=" + fromEnv);
    }
    return port;
  }
  if (isCI) return 4173;
  const hash = createHash('sha256').update(rootDir).digest().readUInt32BE(0);
  return 4200 + (hash % 800);
}

const port = resolvePort();
const baseURL = `http://127.0.0.1:${port}`;
// どのポートの自分のserverに当たるかを実行のたびに確かめられるようにする（workerでは読み込みごとに出ないよう省く）
if (process.env.TEST_WORKER_INDEX === undefined) console.log(`e2e: ${baseURL}`);

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  workers: isCI ? 4 : undefined,
  reporter: isCI ? 'line' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: isCI
      ? `npm run build && npm run preview -- --host 127.0.0.1 --port ${port} --strictPort --outDir .output/public`
      : `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: isCI ? 120_000 : 60_000,
  },
});
