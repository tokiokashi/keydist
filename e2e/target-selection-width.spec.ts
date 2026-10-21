import { expect, test } from './fixtures.ts';
import { waitForHydration } from './hydration-helper.ts';
import { openTargetSelection } from './pane-helper.ts';

/**
 * 対象の選択（パソコン幅のポップオーバー）は、差し込まれた項目に長い候補名があっても、中身がパネルの幅に収まる。
 * 比較表の「基準にする対象」の候補名は、名前が重なった対象どうしの条件の違いを含むと長くなる。selectの幅が候補名に合わせて
 * 広がると、パネルの背景を残して絞り込み欄・一覧・ボタンが横へはみ出す。
 */

const LONG_NAME = 'QWERTY · ロウスタッガード（ANSI） · 先読みN: 5 · シフト系キーの押し続け: する · ローマ字規則: 標準（j / sh / ch）';

test('長い基準の候補名があっても、対象の選択の中身はパネルの幅に収まる', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto('/analyzer/comparison');
  await waitForHydration(page);
  const panel = await openTargetSelection(page);
  const select = panel.getByRole('combobox', { name: '基準' });
  // 条件の違う対象を揃えずに長い候補名を作るため、候補を1つ足す（幅の計算はselectの候補名だけで決まる）。
  await select.evaluate((element, name) => {
    const option = document.createElement('option');
    option.textContent = name;
    element.append(option);
  }, LONG_NAME);

  const panelBox = await panel.boundingBox();
  if (panelBox === null) throw new Error('対象の選択が表示されていません');
  for (const part of [panel.getByRole('searchbox', { name: '配列・Setupを名前で絞り込む' }), select, panel.getByRole('button', { name: '閉じる' })]) {
    const box = await part.boundingBox();
    if (box === null) throw new Error('対象の選択の中身が表示されていません');
    expect(box.x + box.width).toBeLessThanOrEqual(panelBox.x + panelBox.width);
  }
});
