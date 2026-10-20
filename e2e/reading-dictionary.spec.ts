import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { dictionaryPlugin } from '../scripts/dictionary-plugin.ts';
import { DICTIONARY_SPEC } from '../src/platform/reading/dictionary-spec.ts';

/**
 * 読みの辞書の読み込み口（`src/platform/reading/client.ts`）の確認。
 * 入口を呼ぶ画面はまだ無いので、製品の画面には呼び出し口を足さず、このspecが自前のdevサーバーで
 * 入口を呼ぶだけのページ（`e2e/reading-harness/`）を配って確かめる。辞書の配信は製品と同じプラグインを使う。
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ZIP_PATH = `/${DICTIONARY_SPEC.fileName}`;

let server: ViteDevServer;
let origin: string;
let cacheDir: string;

test.beforeAll(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), 'keydist-reading-'));
  server = await createServer({
    configFile: false,
    root: ROOT,
    cacheDir,
    appType: 'mpa',
    logLevel: 'error',
    plugins: [dictionaryPlugin()],
    optimizeDeps: { exclude: ['lindera-wasm'] },
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (address === null || address === undefined || typeof address === 'string') throw new Error('サーバーのアドレスを取れない');
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await server.close();
  await rm(cacheDir, { recursive: true, force: true });
});

interface Traffic {
  zip: number;
  wasm: number;
}

async function openHarness(page: Page): Promise<Traffic> {
  const traffic: Traffic = { zip: 0, wasm: 0 };
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname === ZIP_PATH) traffic.zip += 1;
    if (pathname.endsWith('.wasm')) traffic.wasm += 1;
  });
  await page.goto(`${origin}/e2e/reading-harness/index.html`);
  await page.waitForFunction(() => (window as unknown as { harnessReady?: boolean }).harnessReady === true);
  return traffic;
}

type Harness = {
  shared(): {
    load(): Promise<void>;
    tokenize(text: string): Promise<unknown[]>;
    status(): { state: string; source?: string; stored?: boolean; message?: string };
  };
  withVersion(version: string): ReturnType<Harness['shared']>;
  cacheNames(): Promise<string[]>;
  cachedUrls(name: string): Promise<string[]>;
};
declare global {
  interface Window {
    harness: Harness;
  }
}

test('入口を呼ぶまではwasmも辞書も通信せず、呼ぶと取得・保存して解析する', async ({ page }) => {
  const traffic = await openHarness(page);
  expect(await page.evaluate(() => window.harness.shared().status().state)).toBe('idle');
  expect(page.workers()).toHaveLength(0);
  expect(traffic).toEqual({ zip: 0, wasm: 0 });

  const tokens = await page.evaluate(() => window.harness.shared().tokenize('今日は良い天気です') as Promise<Record<string, unknown>[]>);
  expect(tokens.map((token) => token.surface).join('')).toBe('今日は良い天気です');
  expect(tokens[0]).toMatchObject({ surface: '今日', byteStart: 0, byteEnd: 6, reading: 'キョウ', isUnknown: false });
  expect(tokens[1]).toMatchObject({ surface: 'は', byteStart: 6, byteEnd: 9, reading: 'ハ' });
  expect(traffic.zip).toBe(1);
  expect(traffic.wasm).toBe(1);
  expect(await page.evaluate(() => window.harness.shared().status())).toEqual({ state: 'ready', source: 'network', stored: true });

  const names = await page.evaluate(() => window.harness.cacheNames());
  expect(names).toEqual([`keydist-reading-dictionary-${DICTIONARY_SPEC.version}`]);
});

test('開き直した2回目は辞書を通信せずに保存から読み、辞書の版を変えると取り直す', async ({ context }) => {
  const first = await context.newPage();
  const firstTraffic = await openHarness(first);
  await first.evaluate(() => window.harness.shared().load());
  expect(firstTraffic.zip).toBe(1);
  await first.close();

  const second = await context.newPage();
  const secondTraffic = await openHarness(second);
  await second.evaluate(() => window.harness.shared().load());
  expect(await second.evaluate(() => window.harness.shared().status())).toEqual({ state: 'ready', source: 'cache', stored: true });
  expect(secondTraffic.zip).toBe(0);
  await second.close();

  const third = await context.newPage();
  const thirdTraffic = await openHarness(third);
  await third.evaluate(() => window.harness.withVersion('0.0.0-e2e').load());
  expect(thirdTraffic.zip).toBe(1);
  // 古い版の保存は消え、新しい版の保存だけが残る
  expect(await third.evaluate(() => window.harness.cacheNames())).toEqual(['keydist-reading-dictionary-0.0.0-e2e']);
  await third.close();
});

test('辞書の応答がHTMLだった時は保存せず、失敗として区別でき、直った後の呼び出しで読み込み直す', async ({ page }) => {
  let broken = true;
  await page.route(`**${ZIP_PATH}`, (route) =>
    broken ? route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>not found</title>' }) : route.continue(),
  );
  await openHarness(page);
  const service = () =>
    page.evaluate(() =>
      window.harness
        .shared()
        .load()
        .then(
          () => 'ok',
          (error: Error) => error.message,
        ),
    );
  expect(await service()).not.toBe('ok');
  expect(await page.evaluate(() => window.harness.shared().status().state)).toBe('error');
  const cached = await page.evaluate(async () => {
    const names = await window.harness.cacheNames();
    return Promise.all(names.map((name) => window.harness.cachedUrls(name)));
  });
  expect(cached.flat()).toEqual([]);

  broken = false;
  expect(await service()).toBe('ok');
  expect(await page.evaluate(() => window.harness.shared().status().state)).toBe('ready');
});
