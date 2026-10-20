import { expect, type Page, type Route, test } from '@playwright/test';
import { openTextChip } from './context-bar-helper.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 漢字を読みに直す段（仕様 §4.6の1段目）の、画面とのつながり。
 * 読みに直した結果の数え方はunit test（`reading.test.ts`・`convert.test.ts`）に任せ、ここでは
 * 辞書を取得する条件、読み込み中と失敗のペインの出方、条件の要約と打てない文字の内訳の表示を見る。
 */

const ZIP_PATTERN = '**/lindera-ipadic-*.zip';

interface Traffic {
  zip: number;
  wasm: number;
}

function watchTraffic(page: Page): Traffic {
  const traffic: Traffic = { zip: 0, wasm: 0 };
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (/lindera-ipadic-.*\.zip$/.test(pathname)) traffic.zip += 1;
    if (pathname.endsWith('.wasm')) traffic.wasm += 1;
  });
  return traffic;
}

async function openAnalyzer(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await waitForHydration(page);
  await expect(page.locator('.context-bar button.text-chip')).toBeEnabled({ timeout: 10_000 });
}

async function setText(page: Page, text: string): Promise<void> {
  const panel = await openTextChip(page);
  await panel.getByLabel('テキスト', { exact: true }).fill(text);
  await expect(page.locator('.context-bar button.text-chip .text-chip-count')).toHaveText(`${[...text].length}字`, { timeout: 10_000 });
  await page.keyboard.press('Escape');
}

const flowStatus = (page: Page) => page.locator('.flow-status');
const readingLoading = (page: Page) => page.locator('[data-pane-reading="loading"]');
const readingFailed = (page: Page) => page.locator('[data-pane-reading="failed"]');
const flowBody = (page: Page) => page.locator('[data-react-feature="bigram-flow"]');

// 辞書に無い漢字（𠮷）を1文字入れて、読みに直せなかった漢字の内訳を出す
const KANJI_TEXT = '今日は良い天気です。𠮷';

test('漢字を含まない日本語と英語のテキストでは、辞書もwasmも取得しない', async ({ page }) => {
  const traffic = watchTraffic(page);
  await openAnalyzer(page, '/analyzer/bigram-flow');
  await expect(flowBody(page)).toBeVisible({ timeout: 10_000 });
  // 既定の日本語のテキスト
  await setText(page, 'あいうえおかきくけこ');
  await expect(flowBody(page)).toBeVisible();
  // 英語のテキスト。漢字だけを含み、かなを含まないテキストも英語として扱うので読みに直さない
  await setText(page, 'hello world 漢字');
  await expect(flowBody(page)).toBeVisible();
  await expect(readingLoading(page)).toHaveCount(0);
  await expect(readingFailed(page)).toHaveCount(0);
  expect(traffic).toEqual({ zip: 0, wasm: 0 });
});

test('漢字を含む日本語のテキストでは、辞書を取得して読みに直した数値を出し、条件の要約に辞書の名前と版を出す', async ({ page }) => {
  const traffic = watchTraffic(page);
  await openAnalyzer(page, '/analyzer/bigram-flow');
  await setText(page, KANJI_TEXT);

  await expect(flowBody(page)).toBeVisible({ timeout: 20_000 });
  expect(traffic.zip).toBe(1);
  // 読みに直せなかった漢字は、内訳つきで出る。直せた漢字は打てない文字に数えない
  await expect(flowStatus(page)).toHaveText('打てずに飛ばした文字 1（読みに直せなかった漢字 1）');
  await expect(readingLoading(page)).toHaveCount(0);
  await expect(readingFailed(page)).toHaveCount(0);

  // 条件の要約に、画面に出す名前と版だけを出す（解析器の名前は出さない）
  const summary = page.locator('.pane-condition-summary');
  await expect(summary).toContainText('読みの辞書: IPADIC（6.2.0）');
  await expect(summary).not.toContainText(/lindera/i);
  await summary.getByRole('button').click();
  const modal = page.getByRole('dialog', { name: '条件' });
  await expect(modal.getByRole('region', { name: '数値の出どころ' })).toContainText('IPADIC（6.2.0）');
  await expect(modal).not.toContainText(/lindera/i);
});

test('辞書の読み込み中は、暫定の数値を出さず、読み込み中だけをペインに出す', async ({ page }) => {
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(ZIP_PATTERN, async (route: Route) => {
    await held;
    await route.continue();
  });
  await openAnalyzer(page, '/analyzer/bigram-flow');
  await setText(page, KANJI_TEXT);

  await expect(readingLoading(page)).toBeVisible({ timeout: 10_000 });
  await expect(readingLoading(page)).toHaveText('読みの辞書を読み込み中…');
  // 漢字を打てない文字に数えた暫定の数値と内訳は出ない
  await expect(flowBody(page)).toHaveCount(0);
  await expect(flowStatus(page)).toHaveCount(0);

  release?.();
  await expect(flowBody(page)).toBeVisible({ timeout: 20_000 });
  await expect(readingLoading(page)).toHaveCount(0);
  await expect(flowStatus(page)).toHaveText('打てずに飛ばした文字 1（読みに直せなかった漢字 1）');
});

test('辞書を読み込めなかった時は、失敗を知らせ、漢字を打てない文字に数えた数値を出す', async ({ page }) => {
  await page.route(ZIP_PATTERN, (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }));
  await openAnalyzer(page, '/analyzer/bigram-flow');
  await setText(page, KANJI_TEXT);

  await expect(readingFailed(page)).toBeVisible({ timeout: 20_000 });
  await expect(readingFailed(page)).toContainText('読みの辞書を読み込めませんでした');
  await expect(flowBody(page)).toBeVisible();
  // 漢字は今と同じく打てない文字に数える（今・日・良・天・気・𠮷の6文字）
  await expect(flowStatus(page)).toHaveText('打てずに飛ばした文字 6（読みに直せなかった漢字 6）');
  await expect(page.locator('.pane-condition-summary')).toContainText('読み込めず、漢字は読みに直していません');
});

test('打鍵再生には、漢字ではなく読みが出る', async ({ page }) => {
  await openAnalyzer(page, '/analyzer/playback?romajiInput=false');
  await setText(page, '今日は雨');
  const row = page.locator('[data-react-feature="playback"] [data-playback-history]');
  // 行は幅に収まる分だけ出る。読みの先頭が見えれば、漢字ではなく読みで並んでいる
  await expect(row).toContainText('きょうは', { timeout: 20_000 });
  await expect(row).not.toContainText('今日');
});

test('Workspaceのペインも、漢字を含むテキストを読みに直した数値を出し、読み込み中は全ペインが数値を出さない', async ({ page }) => {
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(ZIP_PATTERN, async (route: Route) => {
    await held;
    await route.continue();
  });
  const traffic = watchTraffic(page);
  const layoutTarget = (layoutId: string) => ({ kind: 'layout', layoutId });
  const workspace = {
    id: 'reading',
    name: '読みの確認',
    text: { ref: { kind: 'user', id: 'kanji-text' } },
    groups: [{ id: 'g1', target: { single: layoutTarget('qwerty') } }],
    panes: [
      { id: 'a', analyzerId: 'bigram-flow', binding: { mode: 'follow', group: 'g1' } },
      { id: 'b', analyzerId: 'bigram-flow', binding: { mode: 'fixed', target: { kind: 'single', target: layoutTarget('dvorak') } } },
    ],
    grid: [
      { id: 'a', x: 0, y: 0, w: 12, h: 16 },
      { id: 'b', x: 12, y: 0, w: 12, h: 16 },
    ],
  };
  await page.addInitScript(
    ({ workspaceValue, text }) => {
      if (localStorage.getItem('keydist:workspaces') === null) {
        localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 4, workspaces: [workspaceValue] }));
        localStorage.setItem('keydist:text-library', JSON.stringify({ version: 1, texts: [{ id: 'kanji-text', name: '漢字', text }] }));
      }
    },
    { workspaceValue: workspace, text: KANJI_TEXT },
  );
  await page.goto('/workspace/reading');
  await waitForHydration(page);

  const panes = page.locator('.pane-frame');
  await expect(panes).toHaveCount(2);
  await expect(readingLoading(page)).toHaveCount(2, { timeout: 15_000 });
  await expect(flowBody(page)).toHaveCount(0);
  // 辞書の取得は、ペインの数によらず1回
  release?.();
  await expect(flowBody(page)).toHaveCount(2, { timeout: 20_000 });
  await expect(flowStatus(page)).toHaveText(['打てずに飛ばした文字 1（読みに直せなかった漢字 1）', '打てずに飛ばした文字 1（読みに直せなかった漢字 1）']);
  // Workspaceのペインは条件を小さいchipで出すので、辞書の名前と版はhoverの説明と条件のモーダルで読む
  const summary = page.locator('.pane-condition-summary').first();
  await expect(summary.getByRole('button')).toHaveAttribute('title', /読みの辞書: IPADIC（6\.2\.0）/);
  await summary.getByRole('button').click();
  await expect(page.getByRole('dialog', { name: '条件' }).getByRole('region', { name: '数値の出どころ' })).toContainText('IPADIC（6.2.0）');
  expect(traffic.zip).toBe(1);
});
