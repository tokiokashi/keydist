import { expect, test, type Locator, type Page } from '@playwright/test';
import { waitForHydration } from './hydration-helper.ts';

/**
 * Workspaceで、同じAnalyzerのペインどうしの解析設定を共有できる。共有に従うペインの設定を変えると、同じ共有に従う
 * 他のペインも変わり、元に戻す1回で全部戻る。「このペインだけ」にしたペインと、違うAnalyzerのペインは変わらない。
 * 持ち方の切り替えは解析設定の小窓の中にある。
 */

const layout = (layoutId: string) => ({ kind: 'layout', layoutId });
const fixed = (layoutId: string) => ({ mode: 'fixed', target: { kind: 'single', target: layout(layoutId) } });
const SHARED = (set: string) => ({ mode: 'shared', set });
const OWN = { mode: 'own' };

/** a・bは共有に従うBigram Flow、cは「このペインだけ」のBigram Flow、fは共有に従う指ごとの距離。 */
const panes = [
  { id: 'a', analyzerId: 'bigram-flow', optionsBinding: SHARED('bigram-flow-1'), binding: fixed('qwerty') },
  { id: 'b', analyzerId: 'bigram-flow', optionsBinding: SHARED('bigram-flow-1'), binding: fixed('dvorak') },
  { id: 'c', analyzerId: 'bigram-flow', optionsBinding: OWN, binding: fixed('oonishi') },
  { id: 'f', analyzerId: 'finger-distance', optionsBinding: SHARED('finger-distance-1'), binding: fixed('qwerty') },
];

async function openWorkspace(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.addInitScript((value) => {
    if (localStorage.getItem('keydist:workspaces') === null) {
      localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 4, workspaces: [value] }));
    }
  }, {
    id: 's',
    name: '共有',
    text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } },
    optionSets: [
      { id: 'bigram-flow-1', analyzerId: 'bigram-flow' },
      { id: 'finger-distance-1', analyzerId: 'finger-distance' },
    ],
    panes,
    grid: panes.map((pane, i) => ({ id: pane.id, x: (i % 2) * 12, y: Math.floor(i / 2) * 20, w: 12, h: 20 })),
  });
  await page.goto('/workspace/s');
  await waitForHydration(page);
  await expect(page.locator('.workspace-grid-item')).toHaveCount(panes.length);
  await expect(page.locator('.pane-frame[data-pane-status="ready"]')).toHaveCount(panes.length, { timeout: 30_000 });
}

const pane = (page: Page, id: string): Locator => page.locator(`.workspace-grid-item[data-pane-id="${id}"]`);
const settingsWindow = (page: Page): Locator => page.locator('[data-settings-window="true"]');

async function openSettings(page: Page, id: string): Promise<Locator> {
  await pane(page, id).getByRole('button', { name: '解析設定', exact: true }).click();
  const settings = settingsWindow(page);
  await expect(settings).toBeVisible();
  return settings;
}

async function closeSettings(page: Page): Promise<void> {
  await settingsWindow(page).getByRole('button', { name: '解析設定を閉じる' }).click();
  await expect(settingsWindow(page)).toHaveCount(0);
}

/** そのペインの2打鍵の取り方が Within-hand か（小窓を開いて読み、閉じる）。 */
async function isWithinHand(page: Page, id: string): Promise<boolean> {
  const settings = await openSettings(page, id);
  const pressed = await settings.getByRole('button', { name: 'Within-hand' }).getAttribute('aria-pressed');
  await closeSettings(page);
  return pressed === 'true';
}

async function expectWithinHand(page: Page, expected: Record<string, boolean>): Promise<void> {
  await expect.poll(async () => {
    const actual: Record<string, boolean> = {};
    for (const id of Object.keys(expected)) actual[id] = await isWithinHand(page, id);
    return actual;
  }).toEqual(expected);
}

async function setWithinHand(page: Page, id: string): Promise<void> {
  const settings = await openSettings(page, id);
  await settings.getByRole('button', { name: 'Within-hand' }).click();
  await closeSettings(page);
}

async function storedWorkspace(page: Page): Promise<{ optionSets: { id: string; options?: unknown }[]; panes: { id: string; options?: unknown; optionsBinding: { mode: string } }[] }> {
  const raw = await page.evaluate(() => localStorage.getItem('keydist:workspaces'));
  return (JSON.parse(raw!) as { workspaces: never[] }).workspaces[0]!;
}

test('共有に従う2つ: 片方を変えるともう片方も変わり、元に戻す1回で両方が戻る。このペインだけのペインと違うAnalyzerは変わらない', async ({ page }) => {
  await openWorkspace(page);
  await expectWithinHand(page, { a: false, b: false, c: false });

  await setWithinHand(page, 'a');
  await expectWithinHand(page, { a: true, b: true, c: false });
  await expect.poll(async () => (await storedWorkspace(page)).optionSets.find((set) => set.id === 'bigram-flow-1')?.options).toEqual(expect.objectContaining({ source: 'within-hand' }));
  const stored = await storedWorkspace(page);
  // 共有の設定だけが書き換わり、ペインの欄・違うAnalyzerの共有の設定は変わらない
  expect(stored.optionSets.find((set) => set.id === 'finger-distance-1')?.options).toBeUndefined();
  expect(stored.panes.every((candidate) => candidate.options === undefined)).toBe(true);

  await page.locator('.context-bar').getByRole('button', { name: '元に戻す' }).click();
  await expectWithinHand(page, { a: false, b: false, c: false });
});

test('「このペインだけ」にしたペインは、他のペインの変更で変わらない。共有に戻すと共有の設定になる', async ({ page }) => {
  await openWorkspace(page);
  await setWithinHand(page, 'a');
  await expectWithinHand(page, { a: true, b: true, c: false });

  // このペインだけにすると、押した瞬間の見た目は変わらない
  let settings = await openSettings(page, 'b');
  await expect(settings.getByRole('radio', { name: '共有に従う' })).toHaveAttribute('aria-checked', 'true');
  await settings.getByRole('radio', { name: 'このペインだけ' }).click();
  await expect(settings.getByRole('radio', { name: 'このペインだけ' })).toHaveAttribute('aria-checked', 'true');
  await expect(settings.getByRole('button', { name: 'Within-hand' })).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.getByRole('button', { name: 'Actual' })).toHaveAttribute('aria-pressed', 'false');
  // 小窓の中でこのペインだけの設定を変えても、共有に従うaは変わらない
  await settings.getByRole('button', { name: 'Actual' }).click();
  await closeSettings(page);
  await expectWithinHand(page, { a: true, b: false, c: false });

  // 共有の設定を変えても、このペインだけのbは変わらない
  const settingsA = await openSettings(page, 'a');
  await settingsA.getByRole('button', { name: 'Actual' }).click();
  await closeSettings(page);
  await setWithinHand(page, 'b');
  await expectWithinHand(page, { a: false, b: true, c: false });

  // 共有に戻すと、共有の設定を読む
  settings = await openSettings(page, 'b');
  await settings.getByRole('radio', { name: '共有に従う' }).click();
  await closeSettings(page);
  await expectWithinHand(page, { a: false, b: false, c: false });
});

test('「解析設定を初期値に戻す」は、共有に従うペインでは共有の設定を戻す。説明にそのことが書いてある', async ({ page }) => {
  await openWorkspace(page);
  await setWithinHand(page, 'a');
  await expectWithinHand(page, { a: true, b: true, c: false });

  // 小窓のボタンのtitleと、⋯のメニューの説明
  const settings = await openSettings(page, 'b');
  await expect(settings.getByRole('button', { name: 'すべて初期値に戻す' })).toHaveAttribute('title', /共有の設定を戻す/);
  await closeSettings(page);
  await pane(page, 'b').locator('.pane-frame-menu').getByRole('button', { name: /の操作$/ }).click();
  const item = page.getByRole('menuitem', { name: /解析設定を初期値に戻す/ });
  await expect(item).toContainText('共有の設定を戻す');
  await item.click();
  await expectWithinHand(page, { a: false, b: false, c: false });

  // このペインだけのペインの説明に、共有の話は出ない
  const own = await openSettings(page, 'c');
  await expect(own.getByRole('button', { name: 'すべて初期値に戻す' })).toHaveAttribute('title', '対象と条件は変わらない');
  await closeSettings(page);
});
