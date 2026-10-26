import { expect, test, type Page } from './fixtures.ts';
import { waitForHydration } from './hydration-helper.ts';

/**
 * 指の割り当ての画面のE2E。割り当ての書き換えの分岐と数値の一致はunit testが持つので、
 * ここでは画面の配線を見る: サイドバーから開ける、作る・名前を変える・キーと列を編集する・既定へ戻す、
 * 保存先に反映される、条件のモーダルで選べる、/assetsの一覧から削除できる。
 */

const STORAGE_KEY = 'keydist:finger-assignments';

const keyLegend = (page: Page, keyId: string) => page.locator(`.physical-keyboard-key[data-key-id="${keyId}"] .physical-keyboard-legend`);

test('割り当てを作り、キーと列を編集し、既定へ戻せる。条件のモーダルで選べて、/assetsから削除できる', async ({ page }) => {
  await page.goto('/analyzer/bigram-flow');
  await waitForHydration(page);
  await page.locator('#app-sidebar').getByRole('link', { name: '指の割り当て', exact: true }).click();
  await expect(page).toHaveURL(/\/finger-assignment$/);

  await page.locator('[data-finger-assignment-create]').click();
  await expect(page.getByLabel('割り当てを選ぶ')).toHaveValue(/finger-/);
  const name = page.getByLabel('名前', { exact: true });
  await expect(name).toHaveValue('新しい指の割り当て');
  await name.fill('私の運指');
  await name.press('Enter');
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toContain('私の運指');

  // 新規作成の元は、選んでいる物理配列（ANSI）の既定の割り当て
  await expect(keyLegend(page, 'q')).toHaveText('左小');

  // キー単位: Qを右小指だけの担当にする（右小指を足してから、前の左小指を外す）
  await page.locator('.physical-keyboard-key[data-key-id="q"]').click();
  await page.getByRole('checkbox', { name: '右小指', exact: true }).check();
  await page.getByRole('checkbox', { name: '左小指', exact: true }).uncheck();
  await expect(keyLegend(page, 'q')).toHaveText('右小');

  // 列の一括: 2列目（W・S・Xの列）を左小指にする
  await page.getByLabel('列を選ぶ', { exact: true }).selectOption({ index: 1 });
  await page.getByLabel('列の指').selectOption('LP');
  for (const id of ['2', 'w', 's', 'x']) await expect(keyLegend(page, id)).toHaveText('左小');

  // 既定へ戻す: 全てのキーが既定に戻る
  await page.locator('[data-finger-assignment-reset]').click();
  await expect(keyLegend(page, 'q')).toHaveText('左小');
  await expect(keyLegend(page, 'w')).toHaveText('左薬');

  // 元に戻すで、既定へ戻す前に戻る
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(keyLegend(page, 'w')).toHaveText('左小');

  // 条件のモーダルで選べる
  await page.locator('#app-sidebar').getByRole('link', { name: 'Bigram Flow', exact: true }).click();
  await expect(page.locator('.pane-frame')).toHaveAttribute('data-pane-status', 'ready', { timeout: 10_000 });
  await page.locator('.pane-frame .pane-condition-trigger').click();
  const modal = page.getByRole('dialog', { name: '条件' });
  await expect(modal.getByLabel('指の割当', { exact: true }).locator('option', { hasText: '私の運指' })).toHaveCount(1);
  await page.keyboard.press('Escape');

  // /assetsの一覧から削除できる
  await page.goto('/assets');
  await waitForHydration(page);
  const section = page.locator('[data-user-assets-section="finger-assignment"]');
  await expect(section.locator('[data-user-asset-row]')).toHaveCount(1);
  await expect(section).toContainText('削除すると、この割り当てを選んでいる場所は既定の割り当てで測ります');
  await section.getByRole('button', { name: '「私の運指」を削除' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '削除する' }).click();
  await expect(section.locator('[data-user-asset-row]')).toHaveCount(0);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).not.toContain('私の運指');
});

test('割り当てが1つも無い間も物理配列を選べて、選んだ物理配列の既定から作れる', async ({ page }) => {
  await page.goto('/finger-assignment');
  await waitForHydration(page);
  await page.getByLabel('物理配列を選ぶ').selectOption('jis-row-staggered');
  await page.locator('[data-finger-assignment-create]').click();
  // JISの物理配列にだけあるキーが、JIS既定の指で描かれる
  await expect(keyLegend(page, 'r0c12')).toHaveText('右小');
});

const keyBox = (page: Page, keyId: string) => page.locator(`.physical-keyboard-key[data-key-id="${keyId}"]`);

test('組み込みの割り当ては同じ図で担当と基本の指を見られて、編集はできない。複製すると編集できる', async ({ page }) => {
  await page.goto('/finger-assignment');
  await waitForHydration(page);
  await page.getByLabel('割り当てを選ぶ').selectOption({ label: 'QWERTY最適化' });
  await expect(page.locator('[data-finger-assignment-readonly]')).toBeVisible();
  await expect(page.locator('[data-finger-assignment-reset]')).toHaveCount(0);

  // kは右中指が基本で、右人差し指と右薬指も担当する: 全体は右中指の色、帯は左端と右端に1本ずつ
  await expect(keyLegend(page, 'k')).toHaveText('右中');
  await expect(keyBox(page, 'k')).toHaveAttribute('data-fill-tone', '6');
  await expect(keyBox(page, 'k').locator('.physical-keyboard-band')).toHaveCount(2);
  await expect(keyBox(page, 'k').locator('.physical-keyboard-band[data-band-edge="left"]')).toHaveAttribute('data-band-tone', '5');
  await expect(keyBox(page, 'k').locator('.physical-keyboard-band[data-band-edge="right"]')).toHaveAttribute('data-band-tone', '7');
  // 1本の指だけが担当するキーは帯を持たない
  await expect(keyBox(page, 'q').locator('.physical-keyboard-band')).toHaveCount(0);
  // 右親指が担当するmは下端の帯
  await expect(keyBox(page, 'm').locator('.physical-keyboard-band[data-band-edge="bottom"]')).toHaveCount(1);

  await keyBox(page, 'k').click();
  const panel = page.locator('[data-finger-assignment-key-panel]');
  await expect(panel).toContainText('基本の指: 右中指');
  await expect(panel).toContainText('担当する指: 右人差し指、右中指、右薬指');
  await expect(page.getByLabel('選んだキーの基本の指')).toHaveCount(0);

  await page.locator('[data-finger-assignment-duplicate]').click();
  await expect(page.getByLabel('名前', { exact: true })).toHaveValue('QWERTY最適化のコピー');
  await expect(page.locator('[data-finger-assignment-readonly]')).toHaveCount(0);
  await expect(keyBox(page, 'k').locator('.physical-keyboard-band')).toHaveCount(2);
});

test('指ごとに担当するキーを足す・外せ、キーごとに基本の指を選べる。保存先に担当と基本の指が残る', async ({ page }) => {
  await page.goto('/finger-assignment');
  await waitForHydration(page);
  await page.locator('[data-finger-assignment-create]').click();

  // キー単位: fを右中指も担当させる
  await keyBox(page, 'f').click();
  await page.getByRole('checkbox', { name: '右中指', exact: true }).check();
  await expect(keyBox(page, 'f').locator('.physical-keyboard-band[data-band-edge="right"]')).toHaveCount(1);
  // 基本の指を選ぶ欄は、担当する親指以外の指が2本の間だけ出て、その2本から選べる。選び直しで担当は変わらない
  await page.getByLabel('選んだキーの基本の指').selectOption('RM');
  await expect(keyLegend(page, 'f')).toHaveText('右中');
  await expect(keyBox(page, 'f').locator('.physical-keyboard-band[data-band-edge="left"]')).toHaveCount(1);
  await page.getByLabel('選んだキーの基本の指').selectOption('LI');
  await expect(keyLegend(page, 'f')).toHaveText('左人');
  // 基本の指のチェックも外せる。残った右中指が基本の指になり、欄は消える
  await page.getByRole('checkbox', { name: '左人差し指', exact: true }).uncheck();
  await expect(keyLegend(page, 'f')).toHaveText('右中');
  await expect(keyBox(page, 'f').locator('.physical-keyboard-band')).toHaveCount(0);
  await expect(page.getByLabel('選んだキーの基本の指')).toHaveCount(0);
  // 親指以外の最後の担当は外せず、そばに理由が出る
  await expect(page.getByRole('checkbox', { name: '右中指', exact: true })).toBeDisabled();
  await expect(page.locator('[data-finger-assignment-owner-hint]')).toContainText('別の指にチェックを入れてから外せます');

  // 指単位: 右親指を選んで、図のキーを押して担当に足す・外す
  await page.getByLabel('担当を編集する指').selectOption('RT');
  await keyBox(page, 'n').click();
  await keyBox(page, 'm').click();
  await expect(page.locator('[data-finger-assignment-finger-keys]')).toContainText('N M');
  await expect(keyBox(page, 'n').locator('.physical-keyboard-band[data-band-edge="bottom"]')).toHaveCount(1);
  await keyBox(page, 'n').click();
  await expect(page.locator('[data-finger-assignment-finger-keys]')).toContainText('M');
  await expect(keyBox(page, 'n').locator('.physical-keyboard-band')).toHaveCount(0);

  // 親指以外の最後の担当のキーを押しても外れず、指単位の欄に理由が出る。指を選び直すと消える
  await page.getByLabel('担当を編集する指').selectOption('RM');
  await keyBox(page, 'f').click();
  await expect(page.locator('[data-finger-assignment-notice]')).toContainText('右中指は親指以外の最後の担当です');
  await expect(keyBox(page, 'f').locator('.physical-keyboard-band')).toHaveCount(0);
  await page.getByLabel('担当を編集する指').selectOption('RI');
  await expect(page.locator('[data-finger-assignment-notice]')).toHaveCount(0);

  const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  const assignment = JSON.parse(stored!).assignments[0];
  expect(assignment.baseFinger.f).toBe('RM');
  expect(assignment.fingerKeys.RT).toContain('m');
  expect(assignment.fingerKeys.RT).not.toContain('n');
  expect(assignment.fingerKeys.RM).toContain('f');
  expect(assignment.fingerKeys.LI).not.toContain('f');
});

test('ホームキーがその指の担当でない割り当ては警告が出て、警告から担当に戻すと警告が消える', async ({ page }) => {
  await page.goto('/finger-assignment');
  await waitForHydration(page);
  await page.getByLabel('割り当てを選ぶ').selectOption({ label: 'QWERTY最適化' });
  await page.locator('[data-finger-assignment-duplicate]').click();
  await expect(page.locator('[data-finger-assignment-problems]')).toHaveCount(0);

  // jは右人差し指のホームキー。右中指も担当に加えて、右人差し指の担当を外す
  await keyBox(page, 'j').click();
  await page.getByRole('checkbox', { name: '右中指', exact: true }).check();
  await page.getByRole('checkbox', { name: '右人差し指', exact: true }).uncheck();
  const problems = page.locator('[data-finger-assignment-problems]');
  await expect(problems).toContainText('右人差し指のホームキー（J）は、右人差し指の担当ではありません');
  await expect(problems).toContainText('ホームキーを、その指が担当するキーにするまで測れません');

  await page.locator('[data-finger-assignment-fix-home="RI"]').click();
  await expect(problems).toHaveCount(0);
  await expect(keyBox(page, 'j').locator('.physical-keyboard-band')).toHaveCount(1);

  // 別のキーをホームキーにする直し方でも消える: 右人差し指の担当を外し直し、hをホームキーにする
  await page.getByRole('checkbox', { name: '右人差し指', exact: true }).uncheck();
  await expect(problems).toBeVisible();
  await keyBox(page, 'h').click();
  await page.locator('[data-finger-assignment-home="RI"]').click();
  await expect(problems).toHaveCount(0);
});

test('キーを選んだ後に指を選ぶと、選んでいたキーが外れる。指を選ばない時は前のキーを戻さない', async ({ page }) => {
  await page.goto('/finger-assignment');
  await waitForHydration(page);
  await page.locator('[data-finger-assignment-create]').click();

  // キーを選んだ後に指を選ぶ: 「キー単位」の欄は未選択に戻り、図に選んだキーの枠は残らない
  await keyBox(page, 'f').click();
  await expect(page.locator('[data-binding-target]')).toHaveCount(1);
  await page.getByLabel('担当を編集する指').selectOption('RT');
  await expect(page.getByText('選んでいるキー: なし', { exact: true })).toBeVisible();
  await expect(page.locator('[data-binding-target]')).toHaveCount(0);

  // 指を選んでいる間に aria-pressed が付くのは、その指の担当キーだけ
  await keyBox(page, 'm').click();
  await expect(keyBox(page, 'm')).toHaveAttribute('aria-pressed', 'true');
  await expect(keyBox(page, 'f')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-binding-target]')).toHaveCount(0);

  // 指の選択を「選ばない」へ戻しても、外したキーは戻らない
  await page.getByLabel('担当を編集する指').selectOption('');
  await expect(page.getByText('選んでいるキー: なし', { exact: true })).toBeVisible();
  await expect(page.locator('[data-binding-target]')).toHaveCount(0);
});
