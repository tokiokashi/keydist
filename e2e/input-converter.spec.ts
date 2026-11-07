import { expect, PAGE_TAG, test } from './fixtures.ts';

test('入力欄はお題を薄く表示し正解・誤入力を位置ごとに示す', { tag: PAGE_TAG }, async ({ page }) => {
  await page.goto('/input');

  const feature = page.locator('.input-feature');
  await expect(feature).toHaveAttribute('data-input-ready', 'naginata-v18');

  const lookup = page.getByLabel('打ちたい文字');
  const output = page.getByLabel('自由入力テキスト');
  const target = page.getByTestId('typing-target');

  await lookup.fill('かな');
  await expect(output).not.toHaveAttribute('placeholder');
  await expect(target.locator('.input-output-char-pending')).toHaveText(['か', 'な']);
  await expect(target.locator('.input-output-char-correct')).toHaveCount(0);
  await expect(target.locator('.input-output-char-error')).toHaveCount(0);

  await output.click();
  await page.keyboard.press('f');
  await expect(output).toHaveValue('か');
  await expect(target.locator('.input-output-char-correct')).toHaveText('か');
  await expect(target.locator('.input-output-char-pending')).toHaveText('な');
  await expect(target.locator('.input-output-char-error')).toHaveCount(0);

  await page.keyboard.press('s');
  await expect(output).toHaveValue('かけ');
  await expect(target.locator('.input-output-char-correct')).toHaveText('か');
  await expect(target.locator('.input-output-char-error')).toHaveText('け');
  await expect(target.locator('.input-output-char-pending')).toHaveCount(0);

  await page.keyboard.press('Backspace');
  await expect(output).toHaveValue('か');
  await expect(target.locator('.input-output-char-error')).toHaveCount(0);
  await expect(target.locator('.input-output-char-pending')).toHaveText('な');

  await lookup.fill('');
  await expect(target).toHaveCount(0);
  await expect(output).toHaveAttribute('placeholder', '打った文字が出ます');
  await expect(output).toHaveValue('か');
});
