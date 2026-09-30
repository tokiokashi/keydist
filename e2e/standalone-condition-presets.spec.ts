import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * 条件のモーダルのプリセットの節（保存・流し込み・名前の変更・削除・元に戻す）のE2E。
 * 条件の行そのものの編集は`standalone-bigram-flow.spec.ts`が見る。ここはプリセットの操作と、
 * 3つの個別画面・Workspaceのペインに同じ節が出ること（配線）を見る。
 */

const PRESET_LIBRARY_KEY = 'keydist:presets';

async function openConditionModal(page: Page, pane: Locator = page.locator('.pane-frame')): Promise<Locator> {
  await pane.locator('.pane-condition-trigger').click();
  const modal = page.getByRole('dialog', { name: '条件' });
  await expect(modal).toBeVisible();
  return modal;
}

async function openBigramFlowModal(page: Page): Promise<Locator> {
  await page.goto('/standalone/bigram-flow');
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });
  return openConditionModal(page);
}

/** プリセットの節を開いて返す（開いていればそのまま返す）。 */
async function openPresets(modal: Locator): Promise<Locator> {
  const section = modal.locator('[data-condition-presets]');
  if ((await section.getAttribute('open')) === null) await section.locator('summary').click();
  await expect(section).toHaveAttribute('open', '');
  return section;
}

/** 先読みNを、既定（3）から2つ上げて5にする。 */
async function raiseWindowSize(modal: Locator) {
  const up = modal.getByRole('button', { name: '先読みNを1増やす' });
  await up.click();
  await up.click();
  await expect(modal.locator('[data-item="windowSize"] output')).toHaveText('5');
}

async function savePreset(section: Locator, name: string) {
  await section.getByLabel('プリセットの名前').fill(name);
  await section.getByRole('button', { name: '今の全体の値を保存' }).click();
}

function rowOf(section: Locator, name: string | RegExp): Locator {
  return section.locator('.condition-preset-row').filter({ hasText: name });
}

test('プリセット: 閉じたまま開き、件数が見出しに出る。空や空白だけの名前は保存できない', async ({ page }) => {
  const modal = await openBigramFlowModal(page);
  const section = modal.locator('[data-condition-presets]');
  await expect(section).not.toHaveAttribute('open', '');
  await expect(section.locator('summary')).toHaveText('プリセット（0）');

  await openPresets(modal);
  const save = section.getByRole('button', { name: '今の全体の値を保存' });
  await expect(save).toBeDisabled();
  await section.getByLabel('プリセットの名前').fill('   ');
  await expect(save).toBeDisabled();
  await section.getByLabel('プリセットの名前').press('Enter');
  await expect(section.locator('summary')).toHaveText('プリセット（0）');
});

test('プリセット: 今の全体の値を保存すると一覧に加わり、今の値と同じ印が付く。値を変えると印が消える', async ({ page }) => {
  const modal = await openBigramFlowModal(page);
  await raiseWindowSize(modal);
  const section = await openPresets(modal);

  await savePreset(section, ' 厳しめ ');
  await expect(section.locator('summary')).toHaveText('プリセット（1）');
  const row = rowOf(section, '厳しめ');
  await expect(row).toContainText('今の値と同じ');
  await expect(section.locator('[data-preset-result]')).toContainText('「厳しめ」として今の全体の値を保存した');
  await expect(section.getByLabel('プリセットの名前')).toHaveValue('');

  // 保存の中身は、その時の全体の上書き（既定から変えた項目だけ）
  const stored = await page.evaluate((key) => localStorage.getItem(key), PRESET_LIBRARY_KEY);
  expect(JSON.parse(stored ?? '{}').presets[0]).toMatchObject({ name: '厳しめ', values: { windowSize: 5 } });

  await modal.getByRole('button', { name: '先読みNを1増やす' }).click();
  await expect(row).not.toContainText('今の値と同じ');
  // 別の操作の後に、古い結果の元に戻すが残らない
  await expect(section.locator('[data-preset-result]')).toHaveCount(0);
});

test('プリセット: 流し込むと全体の値が置き換わり、結果の行の元に戻すで戻る', async ({ page }) => {
  const modal = await openBigramFlowModal(page);
  await raiseWindowSize(modal);
  await modal.getByRole('button', { name: 'OFF' }).first().click();
  const section = await openPresets(modal);
  await savePreset(section, '厳しめ');

  // 全部を既定へ戻してから流し込む
  await modal.getByRole('button', { name: 'すべて既定値に戻す' }).click();
  await expect(modal.locator('[data-changed]')).toHaveCount(0);
  await expect(rowOf(section, '厳しめ')).not.toContainText('今の値と同じ');

  await rowOf(section, '厳しめ').getByRole('button', { name: '「厳しめ」の値を流し込む' }).click();
  const windowRow = modal.locator('[data-item="windowSize"]');
  await expect(windowRow.locator('output')).toHaveText('5');
  await expect(windowRow).toContainText('全体で変更');
  await expect(section.locator('[data-preset-result]')).toContainText('「厳しめ」の値にした（2項目が変わった）');
  await expect(rowOf(section, '厳しめ')).toContainText('今の値と同じ');

  await section.getByRole('button', { name: '元に戻す' }).click();
  await expect(windowRow.locator('output')).toHaveText('3');
  await expect(modal.locator('[data-changed]')).toHaveCount(0);
  await expect(section.locator('[data-preset-result]')).toContainText('元に戻した');
  await expect(section.getByRole('button', { name: '元に戻す' })).toHaveCount(0);

  // モーダルを閉じた要約にも、流し込みの結果が出ている（文脈バーの元に戻すとも同じ履歴）
  await rowOf(section, '厳しめ').getByRole('button', { name: '「厳しめ」の値を流し込む' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.pane-condition-trigger')).toContainText('先読みN: 5');
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(page.locator('.pane-condition-trigger')).toHaveText('条件すべて既定値');
});

test('プリセット: 名前を変更できる。空にはできず、Escapeで入力だけをやめる', async ({ page }) => {
  const modal = await openBigramFlowModal(page);
  const section = await openPresets(modal);
  await savePreset(section, '厳しめ');

  // メニューをEscapeで閉じても、モーダルは閉じない
  await rowOf(section, '厳しめ').getByRole('button', { name: '「厳しめ」の操作' }).click();
  await expect(page.getByRole('menuitem', { name: '削除' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: '削除' })).toHaveCount(0);
  await expect(modal).toBeVisible();

  await rowOf(section, '厳しめ').getByRole('button', { name: '「厳しめ」の操作' }).click();
  await page.getByRole('menuitem', { name: '名前を変更' }).click();
  const input = section.getByLabel('新しい名前');
  await expect(input).toHaveValue('厳しめ');
  await input.fill('');
  await expect(section.getByRole('button', { name: '変更', exact: true })).toBeDisabled();

  // Escapeは名前の入力だけをやめる（モーダルは閉じない）
  await input.press('Escape');
  await expect(input).toHaveCount(0);
  await expect(modal).toBeVisible();
  await expect(rowOf(section, '厳しめ')).toBeVisible();

  await rowOf(section, '厳しめ').getByRole('button', { name: '「厳しめ」の操作' }).click();
  await page.getByRole('menuitem', { name: '名前を変更' }).click();
  await section.getByLabel('新しい名前').fill('ゆるめ');
  await section.getByLabel('新しい名前').press('Enter');
  await expect(rowOf(section, 'ゆるめ')).toBeVisible();
  await expect(section.locator('.condition-preset-row')).toHaveCount(1);
  const stored = await page.evaluate((key) => localStorage.getItem(key), PRESET_LIBRARY_KEY);
  expect(JSON.parse(stored ?? '{}').presets.map((preset: { name: string }) => preset.name)).toEqual(['ゆるめ']);
});

test('プリセット: 削除すると一覧から消え、結果の行の元に戻すで戻る', async ({ page }) => {
  const modal = await openBigramFlowModal(page);
  const section = await openPresets(modal);
  await savePreset(section, '厳しめ');
  await savePreset(section, 'ゆるめ');
  await expect(section.locator('summary')).toHaveText('プリセット（2）');

  await rowOf(section, '厳しめ').getByRole('button', { name: '「厳しめ」の操作' }).click();
  await page.getByRole('menuitem', { name: '削除' }).click();
  await expect(section.locator('summary')).toHaveText('プリセット（1）');
  await expect(rowOf(section, '厳しめ')).toHaveCount(0);
  await expect(section.locator('[data-preset-result]')).toContainText('「厳しめ」を削除した');

  await section.getByRole('button', { name: '元に戻す' }).click();
  await expect(section.locator('summary')).toHaveText('プリセット（2）');
  await expect(rowOf(section, '厳しめ')).toBeVisible();
});

test('プリセット: 名前の変更・削除・元に戻すの後、フォーカスはBODYへ落ちず操作を続けられる所へ移る', async ({ page }) => {
  const modal = await openBigramFlowModal(page);
  const section = await openPresets(modal);
  await savePreset(section, '厳しめ');
  const menuButton = () => rowOf(section, /厳しめ|ゆるめ/).getByRole('button', { name: /の操作$/ });
  const chooseRename = async () => {
    await menuButton().click();
    await page.getByRole('menuitem', { name: '名前を変更' }).click();
  };

  // やめる（Escape・ボタン）と確定の後は、操作を始めた⋯へ戻る
  await chooseRename();
  await section.getByLabel('新しい名前').press('Escape');
  await expect(menuButton()).toBeFocused();
  await chooseRename();
  await section.getByRole('button', { name: 'やめる' }).click();
  await expect(menuButton()).toBeFocused();
  await chooseRename();
  await section.getByLabel('新しい名前').fill('ゆるめ');
  await section.getByLabel('新しい名前').press('Enter');
  await expect(rowOf(section, 'ゆるめ')).toBeVisible();
  await expect(menuButton()).toBeFocused();

  // 削除の後は、消えた行の代わりに結果の行の元に戻す。戻した後は結果の行
  await menuButton().click();
  await page.getByRole('menuitem', { name: '削除' }).click();
  await expect(section.locator('[data-preset-result]').getByRole('button', { name: '元に戻す' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(rowOf(section, 'ゆるめ')).toBeVisible();
  // 元に戻した後は、いつもある節の見出しへ（結果の行はライブリージョンなので、フォーカスは当てない）
  await expect(section.locator('summary')).toBeFocused();
});

test('プリセット: 再読み込みしても残り、流し込める', async ({ page }) => {
  const modal = await openBigramFlowModal(page);
  await raiseWindowSize(modal);
  const section = await openPresets(modal);
  await savePreset(section, '厳しめ');
  await modal.getByRole('button', { name: 'すべて既定値に戻す' }).click();
  await expect.poll(async () => page.evaluate((key) => localStorage.getItem(key), PRESET_LIBRARY_KEY)).toContain('厳しめ');

  await page.reload();
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });
  const again = await openConditionModal(page);
  const reopened = again.locator('[data-condition-presets]');
  await expect(reopened.locator('summary')).toHaveText('プリセット（1）');
  await openPresets(again);
  await rowOf(reopened, '厳しめ').getByRole('button', { name: '「厳しめ」の値を流し込む' }).click();
  await expect(again.locator('[data-item="windowSize"] output')).toHaveText('5');
});

test('プリセット: 比較表とN感度の個別画面のモーダルにも出る', async ({ page }) => {
  // 対象が空のペインには条件の要約が出ないので、配列を2つ選んだ状態にしておく
  await page.addInitScript(() => {
    localStorage.setItem(
      'keydist:multi-target-selection',
      JSON.stringify({
        version: 1,
        targets: [{ kind: 'layout', layoutId: 'qwerty' }, { kind: 'layout', layoutId: 'colemak-dh' }],
      }),
    );
  });
  for (const path of ['/standalone/comparison', '/standalone/n-sensitivity']) {
    await page.goto(path);
    await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 15_000 });
    const modal = await openConditionModal(page);
    const section = await openPresets(modal);
    await savePreset(section, path);
    await expect(rowOf(section, path)).toContainText('今の値と同じ');
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
  }
});

test.describe('スマホ幅', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('プリセット: 下からのシートの中で保存と流し込みができ、横にはみ出さない', async ({ page }) => {
    const modal = await openBigramFlowModal(page);
    await raiseWindowSize(modal);
    const section = await openPresets(modal);
    await savePreset(section, 'とても長い名前のプリセットをスマホ幅で並べる');
    const row = rowOf(section, 'とても長い名前');
    await expect(row.getByRole('button', { name: /を流し込む$/ })).toBeVisible();
    await expect(row.getByRole('button', { name: /の操作$/ })).toBeVisible();

    const overflow = await modal.evaluate((dialog) => {
      const body = dialog.querySelector('.condition-modal-body')!;
      return body.scrollWidth - body.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);

    await modal.getByRole('button', { name: 'すべて既定値に戻す' }).click();
    await row.getByRole('button', { name: /を流し込む$/ }).click();
    await expect(modal.locator('[data-item="windowSize"] output')).toHaveText('5');
  });
  test('プリセット: 削除の後の元に戻すへ移ったフォーカスは、下へスクロールしても画面内に見える', async ({ page }) => {
    const modal = await openBigramFlowModal(page);
    const section = await openPresets(modal);
    for (const name of ['一つ目', '二つ目', '三つ目', '四つ目']) await savePreset(section, name);
    await rowOf(section, '二つ目').getByRole('button', { name: /の操作$/ }).click();
    await page.getByRole('menuitem', { name: '削除' }).click();
    const undo = section.locator('[data-preset-result]').getByRole('button', { name: '元に戻す' });
    await expect(undo).toBeFocused();
    await expect(undo).toBeInViewport({ ratio: 1 });
  });
});
