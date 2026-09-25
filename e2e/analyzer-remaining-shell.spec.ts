import { expect, test } from '@playwright/test';
import { gotoAnalyzer } from './analyzer-helper.ts';

test('remaining Analyzer controls are React-owned and detail selection restores from AppState', async ({ page }) => {
  await gotoAnalyzer(page);

  const sidebar = page.locator('[data-react-feature="sidebar-controls"]');
  const geometryPanel = page.locator('#geometry-panel');
  const geometry = page.locator('[data-react-feature="geometry-controls"]');
  await expect(sidebar).toBeVisible();

  if (!(await geometryPanel.getAttribute('open'))) {
    await geometryPanel.locator(':scope > summary').click();
  }
  await expect(geometry).toBeVisible();

  const detail = sidebar.locator('#detail-layout');
  const optionCount = await detail.locator('option').count();
  expect(optionCount).toBeGreaterThan(0);

  const target = await detail.locator('option').nth(Math.min(1, optionCount - 1)).getAttribute('value');
  expect(target).toBeTruthy();
  await detail.selectOption(target!);

  await expect.poll(async () => page.evaluate(() => {
    const raw = localStorage.getItem('keydist:app-state');
    return raw ? JSON.parse(raw).analyzer?.layouts?.detailByMode?.ja ?? null : null;
  })).toBe(target);

  await page.reload();
  await expect(page.locator('[data-react-feature="sidebar-controls"] #detail-layout')).toHaveValue(target!);
});

test('How and Conditions dialog shells are React-owned', async ({ page }) => {
  await gotoAnalyzer(page);

  await page.locator('#how-open').click();
  await expect(page.locator('#how-dialog')).toHaveAttribute('open', '');
  await expect(page.locator('[data-react-feature="how-dialog"]')).toBeVisible();
  await page.locator('[data-react-feature="how-dialog"] #how-close').click();

  await page.locator('#conditions-open').click();
  await expect(page.locator('#conditions-dialog')).toHaveAttribute('open', '');
  await expect(page.locator('[data-react-feature="conditions-dialog"]')).toBeVisible();
  await expect(page.locator('[data-react-feature="conditions"]')).toBeVisible();
  await page.locator('[data-react-feature="conditions-dialog"] #conditions-close').click();
});

test('legacy panel open state is coordinated by React and restores through AppState', async ({ page }) => {
  await gotoAnalyzer(page);

  const textPanel = page.locator('#text-panel');
  await expect(textPanel).toHaveAttribute('data-react-feature', 'panel-text');
  await expect(textPanel).toHaveAttribute('open', '');

  await textPanel.locator('summary').click();
  await expect(textPanel).not.toHaveAttribute('open', '');

  await expect.poll(async () => page.evaluate(() => {
    const raw = localStorage.getItem('keydist:app-state');
    return raw ? JSON.parse(raw).analyzer?.panels?.text ?? null : null;
  })).toBe(false);

  await page.reload();
  await expect(page.locator('#text-panel')).not.toHaveAttribute('open', '');
});

test('layout selection persists and drives analysis across reloads', async ({ page }) => {
  await gotoAnalyzer(page);

  const sidebar = page.locator('[data-react-feature="sidebar-controls"]');
  await expect(sidebar).toBeVisible();

  const detail = sidebar.locator('#detail-layout');
  const initialCount = await detail.locator('option').count();
  expect(initialCount).toBeGreaterThan(1);
  await expect(page.locator('#compare tbody tr')).toHaveCount(initialCount);

  const targetOption = detail.locator('option').first();
  const targetId = await targetOption.getAttribute('value');
  const targetName = (await targetOption.textContent())?.trim();
  expect(targetId).toBeTruthy();
  expect(targetName).toBeTruthy();

  const targetToggle = sidebar
    .locator('#layout-picker label')
    .filter({ hasText: targetName! })
    .first()
    .locator('input[type="checkbox"]');
  await expect(targetToggle).toBeChecked();

  await targetToggle.uncheck();
  await expect(detail.locator('option')).toHaveCount(initialCount - 1);
  await expect(page.locator('#compare tbody tr')).toHaveCount(initialCount - 1);
  await expect.poll(async () => page.evaluate((layoutId) => {
    const raw = localStorage.getItem('keydist:app-state');
    if (!raw) return null;
    return JSON.parse(raw).analyzer?.layouts?.selectedByMode?.ja?.includes(layoutId) ?? null;
  }, targetId)).toBe(false);

  await page.reload();

  const reloadedSidebar = page.locator('[data-react-feature="sidebar-controls"]');
  const reloadedToggle = reloadedSidebar
    .locator('#layout-picker label')
    .filter({ hasText: targetName! })
    .first()
    .locator('input[type="checkbox"]');
  await expect(reloadedToggle).not.toBeChecked();
  await expect(page.locator('#compare tbody tr')).toHaveCount(initialCount - 1);

  await reloadedToggle.check();
  await expect(page.locator('#compare tbody tr')).toHaveCount(initialCount);
  await expect.poll(async () => page.evaluate((layoutId) => {
    const raw = localStorage.getItem('keydist:app-state');
    if (!raw) return null;
    return JSON.parse(raw).analyzer?.layouts?.selectedByMode?.ja?.includes(layoutId) ?? null;
  }, targetId)).toBe(true);

  await page.reload();
  await expect(
    page.locator('[data-react-feature="sidebar-controls"] #layout-picker label')
      .filter({ hasText: targetName! })
      .first()
      .locator('input[type="checkbox"]'),
  ).toBeChecked();
  await expect(page.locator('#compare tbody tr')).toHaveCount(initialCount);
});


test('theme controls are React-owned and restore through AppState', async ({ page }) => {
  await gotoAnalyzer(page);

  const controls = page.locator('[data-react-feature="theme-controls"]');
  await expect(controls).toBeVisible();
  await controls.locator('[data-theme-set="dark"]').click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(controls.locator('[data-theme-set="dark"]')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => page.evaluate(() => {
    const raw = localStorage.getItem('keydist:app-state');
    return raw ? JSON.parse(raw).appearance?.theme ?? null : null;
  })).toBe('dark');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(
    page.locator('[data-react-feature="theme-controls"] [data-theme-set="dark"]'),
  ).toHaveAttribute('aria-pressed', 'true');
});
