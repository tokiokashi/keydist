import { expect, type Page } from '@playwright/test';

export async function gotoAnalyzer(page: Page): Promise<void> {
  await page.goto('/analyzer');
  await expect(page.locator('#analyzer-react-shell')).toHaveAttribute(
    'data-analyzer-react-shell',
    'mounted',
    { timeout: 15_000 },
  );
}
