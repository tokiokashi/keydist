import { expect, test, type Locator, type Page } from '@playwright/test';
import { openFigureSettings } from './bigram-flow-figure-helper.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * Keyboard Flow の連打の回数バッジを出す・出さないの切り替え。
 * 表示だけの設定なので、線・凡例・ホバー時の行き先の件数は変わらないことも確かめる。
 */

const LABEL = '同じキーの連打の回数を表示する';
const OPTIONS_KEY = 'keydist:standalone-analyzer-options';

/** 図の見た目の要点。バッジの個数以外が動かないことを比べる。 */
async function snapshot(flow: Locator) {
  return {
    edges: await flow.locator('[data-flow-edge="true"]').evaluateAll((els) =>
      els.map((el) => `${el.getAttribute('data-flow-weight')}:${el.getAttribute('stroke-width')}`)),
    legend: await flow.locator('.flow-legend').innerText(),
  };
}

async function expectToggleCycle(flow: Locator, settings: () => Promise<Locator>): Promise<void> {
  const repeatBadges = flow.locator('.flow-repeat-badge');
  await expect(repeatBadges.first()).toBeAttached();
  const shown = await repeatBadges.count();
  expect(shown).toBeGreaterThan(0);
  await expect(flow).toHaveAttribute('data-repeat-badge', 'true');

  const toggle = (await settings()).getByRole('checkbox', { name: LABEL });
  await expect(toggle).toBeChecked();
  // 設定の欄を開くと図の大きさが変わり線の太さも動くので、開いた後に比べの基準を取る。
  const before = await snapshot(flow);
  await toggle.uncheck();
  await expect(flow).toHaveAttribute('data-repeat-badge', 'false');
  await expect(repeatBadges).toHaveCount(0);
  await expect(flow.locator('.flow-key-badge')).toHaveCount(0);
  expect(await snapshot(flow)).toEqual(before);

  // ホバー中: ホバー元自身の連打の回数は出ず、行き先の件数は今までどおり出る。
  await flow.locator('.flow-key[data-key-id="a"]').hover({ force: true });
  await expect(flow.locator('.flow-key-badge').first()).toBeAttached();
  await expect(repeatBadges).toHaveCount(0);

  await toggle.check();
  await expect(flow).toHaveAttribute('data-repeat-badge', 'true');
  await expect(repeatBadges).toHaveCount(shown);
}

test('個別画面: 連打の回数バッジを消せて、戻せる。線と凡例は変わらない', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });
  await expectToggleCycle(flow, () => openFigureSettings(page, 'Keyboard Flow'));
});

test('個別画面: 消した設定は再読み込みで保たれ、項目の既定値へ戻すで出る', async ({ page }) => {
  await page.goto('/standalone/bigram-flow');
  const flow = page.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible({ timeout: 10_000 });
  const figure = await openFigureSettings(page, 'Keyboard Flow');
  await expect(figure.locator('[data-option-reset="true"]')).toHaveCount(0);
  await figure.getByRole('checkbox', { name: LABEL }).uncheck();
  await expect(figure.locator('[data-option-reset="true"]')).toHaveCount(1);
  await expect
    .poll(async () => page.evaluate((key) => localStorage.getItem(key), OPTIONS_KEY))
    .toContain('"repeatBadge":false');

  await page.reload();
  await expect(flow).toBeVisible({ timeout: 10_000 });
  await expect(flow).toHaveAttribute('data-repeat-badge', 'false');
  await expect(flow.locator('.flow-repeat-badge')).toHaveCount(0);

  const reopened = await openFigureSettings(page, 'Keyboard Flow');
  await expect(reopened.getByRole('checkbox', { name: LABEL })).not.toBeChecked();
  await reopened.getByRole('button', { name: '同じキーの連打の回数を表示するを既定値へ戻す' }).click();
  await expect(reopened.getByRole('checkbox', { name: LABEL })).toBeChecked();
  await expect(flow.locator('.flow-repeat-badge').first()).toBeAttached();
});

test('Workspace のペイン: 連打の回数バッジを消せて、戻せる。線と凡例は変わらない', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    if (localStorage.getItem('keydist:workspaces') === null) {
      localStorage.setItem('keydist:workspaces', JSON.stringify({
        version: 3,
        workspaces: [{
          id: 'badge',
          name: 'バッジ',
          text: { ref: { kind: 'builtin', id: 'builtin:ja.legacy' } },
          panes: [{
            id: 'a',
            analyzerId: 'bigram-flow',
            binding: { mode: 'fixed', target: { kind: 'single', target: { kind: 'layout', layoutId: 'qwerty' } } },
          }],
          grid: [{ id: 'a', x: 0, y: 0, w: 12, h: 20 }],
        }],
      }));
    }
  });
  await page.goto('/workspace/badge');
  await waitForHydration(page);
  const pane = page.locator('.workspace-grid-item[data-pane-id="a"]');
  await expect(pane.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 20_000 });
  const flow = pane.locator('[data-react-feature="bigram-flow"]');
  await expect(flow).toBeVisible();
  await expectToggleCycle(flow, async () => {
    const panel = pane.getByRole('group', { name: 'Keyboard Flowの表示' });
    if (!(await panel.isVisible())) await pane.getByRole('button', { name: 'Keyboard Flowの表示', exact: true }).click();
    await expect(panel).toBeVisible();
    return panel;
  });
});
