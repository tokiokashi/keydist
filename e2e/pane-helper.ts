import { expect, type Locator, type Page } from '@playwright/test';

/**
 * ペインの見出しの「解析設定」から小窓を開き、その小窓を返す（開いていればそのまま返す）。
 * 解析設定の入力はペインの本体ではなく小窓にある（docs/architecture.md「ペイン」）。
 */
export async function openSettings(page: Page): Promise<Locator> {
  const window = page.locator('[data-settings-window="true"]');
  if (!(await window.isVisible())) {
    await page.getByRole('button', { name: '解析設定', exact: true }).click();
  }
  await expect(window).toBeVisible();
  return window;
}

/** 見出しの「対象」ボタン。読み上げ名は「対象: 名前、名前…」（集合に対して計算した表示名）。 */
export function targetButton(page: Page): Locator {
  return page.getByRole('button', { name: /^対象: / });
}

/** 対象の選択（見出しの「対象」から開く）を開いて返す（開いていればそのまま返す）。 */
export async function openTargetSelection(page: Page): Promise<Locator> {
  const panel = page.getByRole('dialog', { name: '対象の選択' });
  if (!(await panel.isVisible())) {
    await targetButton(page).click();
  }
  await expect(panel).toBeVisible();
  return panel;
}

/** 対象の選択の中の、1つの候補（チェックボックスかラジオ）。`key`は`layout:qwerty`・`setup:<id>`。 */
export async function targetChoice(page: Page, key: string): Promise<Locator> {
  return (await openTargetSelection(page)).locator(`input[value="${key}"]`);
}

/**
 * 対象を切り替える（集合ならチェックを付け外し、1つだけ選ぶAnalyzerならその対象を選ぶ）。
 * ページ本体はハイドレーション完了まで操作を無効化しているので、Playwrightのactionability待ちに任せてよい。
 */
export async function toggleTarget(page: Page, key: string): Promise<void> {
  await (await targetChoice(page, key)).click();
}

/** 見出しに出ている対象の表示名（並びは表示順）。畳んだ見た目ではなく読み上げ名から読む。 */
export async function targetNames(page: Page): Promise<readonly string[]> {
  const label = (await targetButton(page).getAttribute('aria-label')) ?? '';
  const names = label.replace(/^対象: /, '');
  return names === '未選択' ? [] : names.split('、');
}

/** 見出しの対象の表示名が`expected`になるまで待つ。 */
export async function expectTargetNames(page: Page, expected: readonly string[]): Promise<void> {
  await expect.poll(async () => targetNames(page)).toEqual(expected);
}

/** 1つだけ選ぶAnalyzerで、`key`が選ばれていることを確かめて、対象の選択を閉じる。 */
export async function expectChosenTarget(page: Page, key: string): Promise<void> {
  const choice = await targetChoice(page, key);
  await expect(choice).toHaveAttribute('type', 'radio');
  await expect(choice).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '対象の選択' })).toHaveCount(0);
}
