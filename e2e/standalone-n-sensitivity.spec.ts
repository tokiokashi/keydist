import { expect, test } from '@playwright/test';
import { enabledValues, recordControlStates } from './options-draft-recorder.ts';
import { expectTargetNames, openSettings, openTargetSelection, targetNames, toggleTarget } from './pane-helper.ts';

/**
 * N感度単体ページのE2E。
 * `e2e/standalone-comparison.spec.ts`と同じ形。
 *
 * 対象は配列かSetupの**集合**で、比較表と同じ1つの集合を共有する
 * （`keydist:multi-target-selection`。`engine/multi-target-selection.ts`参照）。
 */

const MULTI_TARGET_SELECTION_KEY = 'keydist:multi-target-selection';

const STANDALONE_ANALYZER_OPTIONS_KEY = 'keydist:standalone-analyzer-options';

function seedTwoSetups() {
  return () => {
    localStorage.setItem(
      'keydist:setup-library',
      JSON.stringify({
        version: 1,
        setups: [
          { id: 'fixed-a', layoutId: 'qwerty', shapeId: 'row-staggered' },
          { id: 'fixed-b', layoutId: 'colemak-dh', shapeId: 'row-staggered' },
        ],
        overrides: {},
      }),
    );
  };
}

const LAYOUT_IDS_8 = ['qwerty', 'dvorak', 'colemak', 'colemak-dh', 'workman', 'oonishi', 'naginata-v18', 'nicola'];

/** 選択（配列）を直接書いて、リロード無しで最初から出す。 */
function seedLayouts(page: import('@playwright/test').Page, layoutIds: readonly string[]) {
  return page.addInitScript((ids) => {
    localStorage.setItem(
      'keydist:multi-target-selection',
      JSON.stringify({ version: 1, targets: ids.map((layoutId) => ({ kind: 'layout', layoutId })) }),
    );
  }, layoutIds);
}

/**
 * 凡例の枠と、線・点の位置関係を画面の座標で測る。
 * 線は`getPointAtLength`で1pxおきに辿り、点は円の外接矩形で見る（枠に触れたら重なりとする）。
 */
async function measureLegend(page: import('@playwright/test').Page, svgSelector = '.n-sensitivity-svg') {
  return page.locator(svgSelector).first().evaluate((svg) => {
    const svgRect = svg.getBoundingClientRect();
    const frame = svg.querySelector('.n-sensitivity-legend-frame')!.getBoundingClientRect();
    const touches = (x: number, y: number) => x >= frame.left && x <= frame.right && y >= frame.top && y <= frame.bottom;
    let linePointsInside = 0;
    for (const path of svg.querySelectorAll<SVGPathElement>('[data-n-sensitivity-series] .n-sensitivity-line')) {
      const matrix = path.getScreenCTM()!;
      const length = path.getTotalLength();
      for (let at = 0; at <= length; at += 1) {
        const point = path.getPointAtLength(at).matrixTransform(matrix);
        if (touches(point.x, point.y)) linePointsInside += 1;
      }
    }
    let dotsInside = 0;
    for (const circle of svg.querySelectorAll('.n-sensitivity-point')) {
      const r = circle.getBoundingClientRect();
      if (r.right >= frame.left && r.left <= frame.right && r.bottom >= frame.top && r.top <= frame.bottom) dotsInside += 1;
    }
    return {
      insideSvg: frame.left >= svgRect.left && frame.right <= svgRect.right && frame.top >= svgRect.top && frame.bottom <= svgRect.bottom,
      corner: svg.querySelector('[data-n-sensitivity-legend]')!.getAttribute('data-n-sensitivity-legend'),
      linePointsInside,
      dotsInside,
      names: [...svg.querySelectorAll('.n-sensitivity-legend-label')].map((el) => el.textContent),
      labelsInsideFrame: [...svg.querySelectorAll('.n-sensitivity-legend-label')].every((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= frame.left && r.right <= frame.right && r.top >= frame.top && r.bottom <= frame.bottom;
      }),
    };
  });
}

/** 対象を加える（対象の選択でチェックを付ける。付けた瞬間に反映される）。 */
async function addTarget(page: import('@playwright/test').Page, key: string) {
  await toggleTarget(page, key);
}

test('新規プロファイルで、配列を2つ直接選ぶだけでSetupを作らずに2本の折れ線が出る', async ({ page }) => {
  await page.goto('/standalone/n-sensitivity');
  // ページの見出し(h1)とAnalyzer自身の見出し(h2)は同じ文字列。h2は計算が済むと現れるので、
  // 名前だけで探すと一致が1件か2件かが描画の速さで変わる。見出しの段まで指定する。
  await expect(page.getByRole('heading', { name: 'N感度', exact: true, level: 1 })).toBeVisible();

  await addTarget(page, 'layout:qwerty');
  await addTarget(page, 'layout:colemak-dh');

  const chart = page.locator('.n-sensitivity-svg');
  await expect(chart).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(2, { timeout: 10_000 });

  const stored = await page.evaluate(() => localStorage.getItem('keydist:setup-library'));
  expect(stored).toBeNull();
});

test('色は加えた順に配り、1つ外しても他の線の色は変わらず、空いた色を次に加えた対象が使う', async ({ page }) => {
  await page.goto('/standalone/n-sensitivity');
  const strokeOf = (key: string) => page.locator(`[data-n-sensitivity-series="${key}"] .n-sensitivity-line`).evaluate((path) => getComputedStyle(path).stroke);

  await addTarget(page, 'layout:qwerty');
  await addTarget(page, 'layout:colemak-dh');
  await addTarget(page, 'layout:dvorak');
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(3, { timeout: 10_000 });
  const [first, second, third] = [await strokeOf('layout:qwerty'), await strokeOf('layout:colemak-dh'), await strokeOf('layout:dvorak')];
  expect(new Set([first, second, third]).size).toBe(3);

  // 対象の選択の色見本も線と同じ色。
  const selection = await openTargetSelection(page);
  await expect(selection.locator('label:has(input[value="layout:colemak-dh"]) .target-selection-swatch path'))
    .toHaveCSS('fill', second!);
  await toggleTarget(page, 'layout:qwerty');
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(2, { timeout: 10_000 });
  expect(await strokeOf('layout:colemak-dh')).toBe(second);
  expect(await strokeOf('layout:dvorak')).toBe(third);

  await addTarget(page, 'layout:workman');
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(3, { timeout: 10_000 });
  expect(await strokeOf('layout:workman')).toBe(first);
});

test('色を除いても、線は点の形と線種で区別でき、凡例の見本が図の線と対応する（7件で線種も使う）', async ({ page }) => {
  await seedLayouts(page, LAYOUT_IDS_8.slice(0, 7));
  await page.goto('/standalone/n-sensitivity');
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(7, { timeout: 15_000 });

  const read = () => page.locator('.n-sensitivity-svg').evaluate((svg) => {
    const marks = (root: Element, line: string, point: string) => {
      const dash = root.querySelector(line)?.getAttribute('stroke-dasharray') ?? 'solid';
      return `${root.querySelector(point)?.getAttribute('data-mark')}/${dash}`;
    };
    return {
      series: [...svg.querySelectorAll('[data-n-sensitivity-series]')].map((g) => marks(g, '.n-sensitivity-line', '.n-sensitivity-point')),
      legend: [...svg.querySelectorAll('[data-n-sensitivity-row]')].map((g) => marks(g, '.n-sensitivity-line', '.n-sensitivity-legend-mark')),
    };
  });
  const { series, legend } = await read();
  // 色を見ずに、形と線種の組だけで7本が全部違う
  expect(new Set(series).size).toBe(7);
  // 先頭6本は実線、7本目は破線で、凡例の見本も同じ組
  expect(series.slice(0, 6).every((mark) => mark.endsWith('/solid'))).toBe(true);
  expect(series[6]).toMatch(/\/5 3$/);
  expect(legend).toEqual(series);

  // 色を全部同じにしても、形と線種の組の数は変わらない（色に頼っていない）。
  // 色は`var(--target-color-N)`をstyleで渡しているので、変数の値を揃える。
  const slots = Array.from({ length: 12 }, (_, i) => `--target-color-${i}: #888 !important;`).join(' ');
  await page.addStyleTag({ content: `:root, :root * { ${slots} }` });
  const strokes = await page.locator('[data-n-sensitivity-series] .n-sensitivity-line').evaluateAll(
    (lines) => lines.map((line) => getComputedStyle(line).stroke),
  );
  expect(strokes).toHaveLength(7);
  expect(new Set(strokes).size).toBe(1);
  expect(new Set((await read()).series).size).toBe(7);
});

test('Setupを2件選ぶと2本の折れ線が表示される', async ({ page }) => {
  await page.addInitScript(seedTwoSetups());
  await page.goto('/standalone/n-sensitivity');

  await expect(page.getByRole('heading', { name: 'N感度', exact: true, level: 1 })).toBeVisible();

  await addTarget(page, 'setup:fixed-a');
  await addTarget(page, 'setup:fixed-b');

  const chart = page.locator('.n-sensitivity-svg');
  await expect(chart).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(2, { timeout: 10_000 });

  // 凡例・条件併記もSetupの数だけ出る（優劣を示す色付け・強調は無い、系列ごとの
  // 条件表示だけがある。`AGENTS.md`「優劣の判定をしない」の確認）。
  await expect(page.locator('[data-n-sensitivity-row="ok"]')).toHaveCount(2);

  // 表（相対表示中も実測値[u]を確認できる）にも2行、N=0〜10の11列が出る。
  const table = page.locator('.n-sensitivity-table');
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table.locator('thead th[scope="col"]')).toHaveCount(12); // "Setup"列 + N=0..10の11列
});

test('縦軸（相対/実測値）の切り替えはリロードしても残る', async ({ page }) => {
  await page.addInitScript(seedTwoSetups());
  await page.goto('/standalone/n-sensitivity');

  await addTarget(page, 'setup:fixed-a');
  await expect(page.locator('.n-sensitivity-svg')).toBeVisible({ timeout: 10_000 });

  const relative = (await openSettings(page)).getByRole('radio', { name: '相対（N=0を100%）' });
  const absolute = (await openSettings(page)).getByRole('radio', { name: '実測値 [u]' });
  await expect(relative).toBeChecked();

  await absolute.check();
  await expect(absolute).toBeChecked();

  // 資産への反映はdebounceされる（`use-debounced-commit.ts`）ので、storageに実際に
  // 書き込まれるまで待ってからリロードする。
  await expect
    .poll(async () => page.evaluate((key) => localStorage.getItem(key), STANDALONE_ANALYZER_OPTIONS_KEY))
    .toContain('absolute');

  await page.reload();
  await expect(page.locator('.n-sensitivity-svg')).toBeVisible({ timeout: 10_000 });
  await expect((await openSettings(page)).getByRole('radio', { name: '実測値 [u]' })).toBeChecked();
  await expect((await openSettings(page)).getByRole('radio', { name: '相対（N=0を100%）' })).not.toBeChecked();
});

test('選択はリロードしても残り、資産の読み込み前に上書きされない。並びは付けた順によらず一覧の順', async ({ page }) => {
  await page.addInitScript(seedTwoSetups());
  await page.goto('/standalone/n-sensitivity');

  await addTarget(page, 'setup:fixed-b');
  await addTarget(page, 'setup:fixed-a');
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(2, { timeout: 10_000 });
  await expectTargetNames(page, ['QWERTY', 'Colemak-DH']);

  await expect
    .poll(async () => page.evaluate((key) => localStorage.getItem(key), MULTI_TARGET_SELECTION_KEY))
    .toContain('fixed-a');

  // 資産の読み込み前に空の初期値へ巻き戻る競合が無いことの回帰確認: リロード直後に
  // 2件→1件に減ったり、選択が消えたりしない。
  await page.reload();
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(2, { timeout: 10_000 });
  await expectTargetNames(page, ['QWERTY', 'Colemak-DH']);

  const storedAfterReload = await page.evaluate(
    (key) => localStorage.getItem(key),
    MULTI_TARGET_SELECTION_KEY,
  );
  const parsed = JSON.parse(storedAfterReload ?? '{}') as {
    targets: { kind: string; setupId?: string }[];
    baseline?: { kind: string; setupId?: string };
  };
  expect(parsed.targets.map((t) => t.setupId)).toEqual(['fixed-b', 'fixed-a']);

  // setup-libraryはユーザーが足していない限り2件のまま（誤って1件へ巻き戻っていない）。
  const setupLibraryRaw = await page.evaluate(() => localStorage.getItem('keydist:setup-library'));
  const setupLibrary = JSON.parse(setupLibraryRaw ?? '{}') as { setups: unknown[] };
  expect(setupLibrary.setups).toHaveLength(2);
});

test('集合に存在しないSetup idが混ざっていても消えず「削除された」と表示される（部分失敗）', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'keydist:setup-library',
      JSON.stringify({
        version: 1,
        setups: [{ id: 'fixed-a', layoutId: 'qwerty', shapeId: 'row-staggered' }],
        overrides: {},
      }),
    );
    localStorage.setItem(
      'keydist:multi-target-selection',
      JSON.stringify({
        version: 1,
        targets: [{ kind: 'setup', setupId: 'fixed-a' }, { kind: 'setup', setupId: 'deleted-setup' }],
      }),
    );
  });
  await page.goto('/standalone/n-sensitivity');

  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(1, { timeout: 10_000 });

  const failedRow = page.locator('[data-n-sensitivity-row="failed"]');
  await expect(failedRow).toHaveCount(1);
  await expect(failedRow).toContainText('削除された');

  await expect.poll(async () => (await targetNames(page)).length).toBe(2);
});

test('条件の要約は先読みNを出さず、対象ごとの差にもNを出さない（掃引軸）', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'keydist:setup-library',
      JSON.stringify({
        version: 1,
        setups: [
          { id: 'fixed-a', layoutId: 'qwerty', shapeId: 'row-staggered' },
          { id: 'fixed-b', layoutId: 'colemak-dh', shapeId: 'row-staggered' },
        ],
        // 全体のsfbHomeCost=falseは共通の条件に出る。windowSizeは掃引軸なので、
        // 全体でも対象ごとでも出ない。fixed-aだけのsfbHomeCostは差になる。
        overrides: {
          global: { sfbHomeCost: false, windowSize: 7 },
          setup: { 'fixed-a': { windowSize: 2, sfbHomeCost: true } },
        },
      }),
    );
    localStorage.setItem(
      'keydist:multi-target-selection',
      JSON.stringify({ version: 1, targets: [{ kind: 'setup', setupId: 'fixed-a' }, { kind: 'setup', setupId: 'fixed-b' }] }),
    );
  });
  await page.goto('/standalone/n-sensitivity');

  const summary = page.locator('.pane-condition-summary');
  await expect(summary).toBeVisible({ timeout: 10_000 });
  // 共通の行は画面の値（全体のOFF）。fixed-aだけがONで、差に出る
  await expect(summary.locator('.pane-condition-trigger')).toContainText('同指連続のホーム復帰距離');
  await expect(summary.locator('.pane-condition-trigger')).toContainText('対象ごとに差あり');
  await expect(summary.locator('.pane-condition-trigger')).not.toContainText('先読みN');
  await summary.locator('.pane-condition-trigger').click();
  const diffs = summary.getByRole('region', { name: '対象ごとの差' });
  await expect(diffs.locator('.pane-condition-diff')).toHaveCount(1);
  await expect(diffs.locator('.pane-condition-diff')).toContainText('同指連続のホーム復帰距離=ON');
  await expect(summary).not.toContainText('先読みN');
});

test('画面の文言に開発の内部（issue番号・Phase・ファイル名・開発用の語）が出ない', async ({ page }) => {
  await page.goto('/standalone/n-sensitivity');
  await addTarget(page, 'layout:qwerty');
  await addTarget(page, 'layout:colemak');
  await expect(page.locator('.n-sensitivity-svg')).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveTitle('N感度 | keydist');
  const description = await page.locator('meta[name="description"]').getAttribute('content');
  expect(description).not.toMatch(/#\d|Phase|standalone|単体ページ|個別画面/);
  const body = page.locator('body');
  await expect(body).not.toContainText(/#\d{3}|Phase|standalone|単体ページ|個別画面|\.ts\b|Vector lab|connections|N sensitivity|Setup comparison|baseline|言語判定: /);
});

test('保存済みの縦軸は、操作可能になった瞬間から表示されている（既定値のまま操作できる瞬間が無い）', async ({ page }) => {
  await recordControlStates(
    page,
    {
      storageKey: STANDALONE_ANALYZER_OPTIONS_KEY,
      storageValue: JSON.stringify({ version: 1, 'n-sensitivity': { scale: 'absolute' } }),
    },
    // 縦軸は解析設定の小窓にあり、小窓を開くボタンは読み込みが済むまで押せない。
    { selector: '[data-settings-window="true"] input[type="radio"][value="absolute"]', read: 'checked' },
  );
  await page.goto('/standalone/n-sensitivity');
  const absolute = (await openSettings(page)).getByRole('radio', { name: '実測値 [u]' });
  await expect(absolute).toBeEnabled({ timeout: 10_000 });
  await expect(absolute).toBeChecked();
  expect(await enabledValues(page)).toEqual(['true']);
});

test('対象が空の時はペインに選ぶボタンを出し、全メンバーが失敗した時は失敗の行だけが残る', async ({ page }) => {
  await page.goto('/standalone/n-sensitivity');
  await expect(page.locator('[data-pane-empty="true"]').getByRole('button', { name: '配列・Setupを選ぶ' })).toBeVisible();

  await page.addInitScript(() => {
    localStorage.setItem(
      'keydist:multi-target-selection',
      JSON.stringify({
        version: 1,
        targets: [{ kind: 'setup', setupId: 'deleted-setup' }],
      }),
    );
  });
  await page.reload();
  await expect(page.locator('[data-n-sensitivity-row="failed"]')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.locator('[data-pane-empty="true"]')).toHaveCount(0);
  await expect(page.locator('.pane-body')).not.toContainText('配列・Setupを選ぶ');
  await expect(page.locator('.n-sensitivity-svg')).toHaveCount(0);
});

test('「共有」でコピーしたURLを新しいページで開くと、解析設定（縦軸）がその値で開く', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/standalone/n-sensitivity');
  await addTarget(page, 'layout:qwerty');
  await expect(page.locator('.n-sensitivity-svg')).toBeVisible({ timeout: 10_000 });

  await (await openSettings(page)).getByRole('radio', { name: '実測値 [u]' }).check();

  await page.getByRole('button', { name: '共有', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'URLをコピーした' })).toBeVisible();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toContain('scale=absolute');

  // 保存値の無い新しいコンテキストで開く。URLの値で開き、取り込み後はURLから消える。
  const other = await context.browser()!.newContext();
  try {
    const opened = await other.newPage();
    await opened.goto(url);
    // 対象もURLで届くので、選び直さなくても図が出る。
    await expect(opened.locator('.n-sensitivity-svg')).toBeVisible({ timeout: 10_000 });
    await expect((await openSettings(opened)).getByRole('radio', { name: '実測値 [u]' })).toBeChecked();
    await expect(opened).toHaveURL(/\/standalone\/n-sensitivity$/);
  } finally {
    await other.close();
  }
});

test('狭い画面（390）でもチャートは置かれた領域の幅で描かれ、横あふれせず、目盛り文字は10pxのまま', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/standalone/n-sensitivity');
  await addTarget(page, 'layout:qwerty');
  await addTarget(page, 'layout:colemak-dh');

  const svg = page.locator('.n-sensitivity-svg');
  await expect(svg).toBeVisible({ timeout: 10_000 });
  // 幅を測って描き直した後の値で確かめる（viewBoxの幅が本体の幅と一致するまで待つ）。
  await expect.poll(async () => {
    const box = await svg.boundingBox();
    const viewBox = await svg.getAttribute('viewBox');
    return box !== null && viewBox !== null && Number(viewBox.split(' ')[2]) === Math.floor(box.width);
  }).toBe(true);

  const body = await page.locator('.pane-body').boundingBox();
  const box = await svg.boundingBox();
  expect(Math.abs(box!.width - body!.width)).toBeLessThan(1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);

  // 表示と座標系が等倍なので、文字はCSSの指定どおり10pxで出る。
  const fontSize = await page.locator('.n-sensitivity-axis-label').first().evaluate((el) => getComputedStyle(el).fontSize);
  expect(fontSize).toBe('10px');
  const scale = await svg.evaluate((el) => (el as SVGSVGElement).getBoundingClientRect().width / (el as SVGSVGElement).viewBox.baseVal.width);
  expect(scale).toBeCloseTo(1, 1);
});

test('上書きありのSetupを1件だけ選ぶと、条件の要約の「対象ごとの差」にその条件が出る', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('keydist:setup-library', JSON.stringify({
      version: 1,
      setups: [{ id: 'fixed-a', layoutId: 'qwerty', shapeId: 'row-staggered' }],
      overrides: { setup: { 'fixed-a': { sfbHomeCost: false } } },
    }));
    localStorage.setItem('keydist:multi-target-selection', JSON.stringify({ version: 1, targets: [{ kind: 'setup', setupId: 'fixed-a' }] }));
  });
  await page.goto('/standalone/n-sensitivity');
  const summary = page.locator('.pane-condition-summary');
  await expect(summary.locator('.pane-condition-trigger')).toContainText('対象ごとに差あり', { timeout: 10_000 });
  await summary.locator('.pane-condition-trigger').click();
  await expect(summary.getByRole('region', { name: '対象ごとの差' })).toContainText('同指連続のホーム復帰距離=OFF');
});

test('手持ちの集合が空で共有リンクの対象を1つも引けない時も、対象の選択を自動で開かない', async ({ page }) => {
  await page.goto('/standalone/n-sensitivity?targets=setup%3A%E6%B6%88%E3%81%88%E3%81%9FSetup');
  await expect(page.locator('[data-pane-link-notice="true"]')).toContainText('Setup「消えたSetup」');
  await expect(page).toHaveURL(/\/standalone\/n-sensitivity$/);
  // URLからパラメータが消えた後の再描画でも、開く判断へ戻らない
  // 「後から自動で開かない」ことが検査の中身なので、猶予の分は実時間で待つ
  await page.waitForTimeout(800);
  await expect(page.getByRole('dialog', { name: '対象の選択' })).toHaveCount(0);
});

/** 幅を測って描き直した後（viewBoxの幅が本体の幅と一致した後）の座標で確かめるための待ち。 */
async function waitForMeasuredWidth(svg: import('@playwright/test').Locator) {
  await expect.poll(async () => {
    const box = await svg.boundingBox();
    const viewBox = await svg.getAttribute('viewBox');
    return box !== null && viewBox !== null && Math.abs(Number(viewBox.split(' ')[2]) - box.width) < 1.5 && Number(viewBox.split(' ')[2]) !== 640;
  }).toBe(true);
}

for (const scale of ['relative', 'absolute'] as const) {
  for (const { count, width } of [{ count: 3, width: 1440 }, { count: 8, width: 1440 }, { count: 3, width: 390 }, { count: 8, width: 390 }]) {
    test(`凡例は図の中の枠にあり、線にも点にも重ならない（${scale}・対象${count}件・${width}px）`, async ({ page }) => {
      const ids = LAYOUT_IDS_8.slice(0, count);
      await page.addInitScript((value) => {
        localStorage.setItem('keydist:standalone-analyzer-options', JSON.stringify({ version: 1, 'n-sensitivity': { scale: value } }));
      }, scale);
      await seedLayouts(page, ids);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/standalone/n-sensitivity');
      await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(count, { timeout: 20_000 });
      await waitForMeasuredWidth(page.locator('.n-sensitivity-svg'));

      const legend = await measureLegend(page);
      expect(legend.insideSvg, '凡例の枠が図の中にある').toBe(true);
      expect(legend.linePointsInside, '凡例の枠の中を線が通らない').toBe(0);
      expect(legend.dotsInside, '凡例の枠に点が触れない').toBe(0);
      expect(legend.labelsInsideFrame, '名前が枠に収まる').toBe(true);
      expect(legend.names, '凡例は対象の数だけ').toHaveLength(count);
      // 図の外に凡例（一覧）が無い。対象の行は図の中にだけある
      await expect(page.locator('ul[aria-label="凡例"]')).toHaveCount(0);
      await expect(page.locator('[data-n-sensitivity-row="ok"]')).toHaveCount(count);
      await expect(page.locator('.n-sensitivity-svg [data-n-sensitivity-row="ok"]')).toHaveCount(count);
    });
  }
}

test('凡例の名前は見出しと同じ表示名で、条件は付かない', async ({ page }) => {
  await seedLayouts(page, ['qwerty', 'colemak-dh']);
  await page.goto('/standalone/n-sensitivity');
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(2, { timeout: 20_000 });
  const legend = await measureLegend(page);
  expect(legend.names).toEqual(['QWERTY', 'Colemak-DH']);
  expect(legend.names).toEqual(await targetNames(page));
  await expect(page.locator('.n-sensitivity-svg')).not.toContainText('指の割当');
});

test('Workspaceの狭いペイン（約500px）に3つ並べても、凡例は図の中で線に重ならない', async ({ page }) => {
  const layouts = ['qwerty', 'dvorak', 'colemak-dh'].map((layoutId) => ({ kind: 'layout', layoutId }));
  await page.addInitScript((targets) => {
    const set = (id: string) => ({ id, analyzerId: 'n-sensitivity', binding: { mode: 'fixed', target: { kind: 'set', selection: { targets } } } });
    localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 4, workspaces: [{
      id: 'legend-panes', name: '凡例の確認', panes: [set('a'), set('b'), set('c')],
      grid: [{ id: 'a', x: 0, y: 0, w: 8, h: 22 }, { id: 'b', x: 8, y: 0, w: 8, h: 22 }, { id: 'c', x: 16, y: 0, w: 8, h: 22 }],
    }] }));
  }, layouts);
  await page.setViewportSize({ width: 1800, height: 900 });
  await page.goto('/workspace/legend-panes');
  await expect(page.locator('.n-sensitivity-svg')).toHaveCount(3, { timeout: 30_000 });
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(9, { timeout: 30_000 });
  for (let i = 0; i < 3; i += 1) {
    const svg = page.locator('.n-sensitivity-svg').nth(i);
    await waitForMeasuredWidth(svg);
    expect((await svg.boundingBox())!.width).toBeLessThan(560);
    const legend = await measureLegend(page, `.n-sensitivity-svg >> nth=${i}`);
    expect(legend.insideSvg).toBe(true);
    expect(legend.linePointsInside).toBe(0);
    expect(legend.dotsInside).toBe(0);
    expect(legend.names).toEqual(['QWERTY', 'Dvorak', 'Colemak-DH']);
  }
});

test('軸の目盛りの文字とNの軸の見出しが重ならない', async ({ page }) => {
  await seedLayouts(page, ['qwerty']);
  await page.goto('/standalone/n-sensitivity');
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(1, { timeout: 20_000 });
  const gap = await page.locator('.n-sensitivity-svg').evaluate((svg) => {
    const ticks = [...svg.querySelectorAll('.n-sensitivity-axis-label')].map((el) => el.getBoundingClientRect()).filter((r) => r.top > svg.getBoundingClientRect().bottom - 60);
    const title = svg.querySelector('.n-sensitivity-axis-title')!.getBoundingClientRect();
    return title.top - Math.max(...ticks.map((r) => r.bottom));
  });
  expect(gap).toBeGreaterThanOrEqual(4);
});

/** 縦軸の目盛りの文字（DOMの順。下から上）。 */
async function yTickTexts(page: import('@playwright/test').Page, nth = 0): Promise<string[]> {
  return page.locator('.n-sensitivity-svg').nth(nth).locator('text[text-anchor="end"]').allTextContents();
}

/** 表の実測値と、ツールチップの相対値・実測値（図の値が変わっていないことの確認用）。 */
async function shownValues(page: import('@playwright/test').Page) {
  return page.evaluate(() => ({
    table: [...document.querySelectorAll('.n-sensitivity-table tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent)),
    tips: [...document.querySelectorAll('[data-n-sensitivity-series] .n-sensitivity-point title')].map((t) => t.textContent),
  }));
}

test('縦軸の範囲を切り替えると目盛りが変わり、表とツールチップの値は変わらない。リロードしても残る', async ({ page }) => {
  await seedLayouts(page, ['qwerty', 'dvorak', 'colemak-dh']);
  await page.goto('/standalone/n-sensitivity');
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(3, { timeout: 20_000 });

  const settings = await openSettings(page);
  await expect(settings.getByRole('radio', { name: '0から' })).toBeChecked();
  await expect.poll(() => yTickTexts(page)).toEqual(['0%', '20%', '40%', '60%', '80%', '100%']);
  const base = await shownValues(page);

  await settings.getByRole('radio', { name: '値の範囲' }).check();
  await expect.poll(() => yTickTexts(page)).toEqual(['60%', '70%', '80%', '90%', '100%']);
  expect(await shownValues(page)).toEqual(base);

  await (await openSettings(page)).getByRole('radio', { name: '粗い区切り' }).check();
  await expect.poll(() => yTickTexts(page)).toEqual(['50%', '75%', '100%']);
  expect(await shownValues(page)).toEqual(base);

  await expect
    .poll(async () => page.evaluate((key) => localStorage.getItem(key), STANDALONE_ANALYZER_OPTIONS_KEY))
    .toContain('coarse');
  await page.reload();
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(3, { timeout: 20_000 });
  await expect.poll(() => yTickTexts(page)).toEqual(['50%', '75%', '100%']);
  await expect((await openSettings(page)).getByRole('radio', { name: '粗い区切り' })).toBeChecked();
});

for (const yRange of ['fit', 'coarse'] as const) {
  for (const { count, width } of [{ count: 3, width: 1440 }, { count: 8, width: 390 }]) {
    test(`縦軸の範囲が${yRange}でも、凡例は線にも点にも重ならない（対象${count}件・${width}px）`, async ({ page }) => {
      await page.addInitScript((value) => {
        localStorage.setItem('keydist:standalone-analyzer-options', JSON.stringify({ version: 1, 'n-sensitivity': { yRange: value } }));
      }, yRange);
      await seedLayouts(page, LAYOUT_IDS_8.slice(0, count));
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/standalone/n-sensitivity');
      await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(count, { timeout: 20_000 });
      await waitForMeasuredWidth(page.locator('.n-sensitivity-svg'));
      expect((await yTickTexts(page))[0]).not.toBe('0%');
      const legend = await measureLegend(page);
      expect(legend.insideSvg).toBe(true);
      expect(legend.linePointsInside).toBe(0);
      expect(legend.dotsInside).toBe(0);
    });
  }
}

test('Workspaceのペインでも縦軸の範囲が効き、ペインごとに選べる', async ({ page }) => {
  const layouts = ['qwerty', 'dvorak'].map((layoutId) => ({ kind: 'layout', layoutId }));
  await page.addInitScript((targets) => {
    const set = (id: string, options?: unknown) => ({ id, analyzerId: 'n-sensitivity', options, binding: { mode: 'fixed', target: { kind: 'set', selection: { targets } } } });
    localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 4, workspaces: [{
      id: 'yrange-panes', name: '縦軸の確認', panes: [set('a'), set('b', { yRange: 'fit' })],
      layout: { kind: 'split', direction: 'row', weight: 1, children: [
        { kind: 'group', paneIds: ['a'], weight: 1 }, { kind: 'group', paneIds: ['b'], weight: 1 },
      ] },
    }] }));
  }, layouts);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/workspace/yrange-panes');
  await expect(page.locator('.n-sensitivity-svg')).toHaveCount(2, { timeout: 30_000 });
  await expect.poll(() => yTickTexts(page, 0)).toEqual(['0%', '20%', '40%', '60%', '80%', '100%']);
  await expect.poll(async () => (await yTickTexts(page, 1))[0]).not.toBe('0%');
});

const LAYOUT_IDS_17 = [
  'qwerty', 'dvorak', 'colemak', 'colemak-dh', 'workman', 'oonishi', 'naginata-v18', 'nicola', 'shin-koume', 'asuka',
  'shin-jis-prefix', 'shin-jis-simultaneous', 'shingeta', 'tsuki-2-263', 'kawasemi-kai', 'kawasemi-plus', 'oonishi-custom',
];

for (const { width, yRange, scale } of [
  { width: 320, yRange: 'full', scale: 'relative' }, { width: 390, yRange: 'fit', scale: 'relative' }, { width: 390, yRange: 'fit', scale: 'absolute' },
  { width: 1440, yRange: 'full', scale: 'absolute' }, { width: 1440, yRange: 'fit', scale: 'relative' },
] as const) {
  test(`対象17件でも、凡例は図の幅に収まり線に重ならず、名前は重複しない（${width}px・${scale}・縦軸の範囲${yRange}）`, async ({ page }) => {
    await page.addInitScript(({ range, scaleValue }) => {
      localStorage.setItem('keydist:standalone-analyzer-options', JSON.stringify({ version: 1, 'n-sensitivity': { yRange: range, scale: scaleValue } }));
    }, { range: yRange, scaleValue: scale });
    await seedLayouts(page, LAYOUT_IDS_17);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/standalone/n-sensitivity');
    await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(17, { timeout: 30_000 });
    await waitForMeasuredWidth(page.locator('.n-sensitivity-svg'));
    const legend = await measureLegend(page);
    expect(legend.insideSvg, '枠が図の中に収まる').toBe(true);
    expect(legend.linePointsInside).toBe(0);
    expect(legend.dotsInside).toBe(0);
    expect(legend.labelsInsideFrame, '名前が枠に収まる').toBe(true);
    expect(new Set(legend.names).size, '名前が重複しない').toBe(17);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
  });
}

for (const width of [390, 1440]) {
  test(`対象1件でも、名前が凡例の枠からはみ出さない（${width}px）`, async ({ page }) => {
    await seedLayouts(page, ['qwerty']);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/standalone/n-sensitivity');
    await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(1, { timeout: 20_000 });
    await waitForMeasuredWidth(page.locator('.n-sensitivity-svg'));
    // 描画後に実際の字幅で枠を測り直す（フォントの読み込みが済むまで待つ）
    await expect.poll(async () => (await measureLegend(page)).labelsInsideFrame).toBe(true);
    // 名前と枠の右端の間に余白が残る（見積もりが小さいと、ぎりぎりか越える）
    const gap = await page.locator('.n-sensitivity-svg').evaluate((svg) => {
      const frame = svg.querySelector('.n-sensitivity-legend-frame')!.getBoundingClientRect();
      const label = svg.querySelector('.n-sensitivity-legend-label')!.getBoundingClientRect();
      return frame.right - label.right;
    });
    expect(gap).toBeGreaterThanOrEqual(4);
  });
}

test('物理配列だけが違うSetupを4件並べても、凡例の名前が重ならない（省いても区別が残る）', async ({ page }) => {
  await page.addInitScript(() => {
    const shapes = ['row-staggered', 'jis-row-staggered', 'column-staggered', 'jis-column-staggered'];
    const setups = shapes.map((shapeId, i) => ({ id: `nicola-${i}`, layoutId: 'nicola', shapeId }));
    localStorage.setItem('keydist:setup-library', JSON.stringify({ version: 1, setups, overrides: {} }));
    localStorage.setItem('keydist:multi-target-selection', JSON.stringify({ version: 1, targets: setups.map((s) => ({ kind: 'setup', setupId: s.id })) }));
  });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/standalone/n-sensitivity');
    await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(4, { timeout: 30_000 });
    await waitForMeasuredWidth(page.locator('.n-sensitivity-svg'));
    const legend = await measureLegend(page);
    expect(new Set(legend.names).size, `${width}px: 名前が重複しない`).toBe(4);
    // 4件それぞれの名前に、自分の物理配列の語が残る（省いて1文字だけの違いにならない）
    const found = [['ロウ', 'ANSI'], ['ロウ', 'JIS'], ['カラム', 'ANSI'], ['カラム', 'JIS']].map(([kind, size]) =>
      legend.names.find((name) => name!.includes(kind!) && name!.includes(size!)));
    expect(found.every((name) => name !== undefined), `${width}px: ${legend.names.join(' | ')}`).toBe(true);
    expect(new Set(found).size).toBe(4);
    expect(legend.insideSvg, `${width}px: 枠が図の中に収まる`).toBe(true);
    expect(legend.linePointsInside).toBe(0);
    expect(legend.labelsInsideFrame).toBe(true);
  }
});

test('Workspaceの狭い4ペイン（約340px）でも、凡例は図の中に収まり線に重ならない', async ({ page }) => {
  const layouts = ['qwerty', 'dvorak', 'colemak', 'colemak-dh', 'workman', 'oonishi', 'nicola', 'asuka'].map((layoutId) => ({ kind: 'layout', layoutId }));
  await page.addInitScript((targets) => {
    const set = (id: string) => ({ id, analyzerId: 'n-sensitivity', binding: { mode: 'fixed', target: { kind: 'set', selection: { targets } } } });
    localStorage.setItem('keydist:workspaces', JSON.stringify({ version: 4, workspaces: [{
      id: 'four-panes', name: '4ペイン', panes: [set('a'), set('b'), set('c'), set('d')],
      grid: ['a', 'b', 'c', 'd'].map((id, i) => ({ id, x: i * 6, y: 0, w: 6, h: 22 })),
    }] }));
  }, layouts);
  await page.setViewportSize({ width: 1700, height: 900 });
  await page.goto('/workspace/four-panes');
  await expect(page.locator('.n-sensitivity-svg')).toHaveCount(4, { timeout: 30_000 });
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(32, { timeout: 30_000 });
  for (let i = 0; i < 4; i += 1) {
    const svg = page.locator('.n-sensitivity-svg').nth(i);
    await waitForMeasuredWidth(svg);
    expect((await svg.boundingBox())!.width).toBeLessThan(400);
    const legend = await measureLegend(page, `.n-sensitivity-svg >> nth=${i}`);
    expect(legend.insideSvg).toBe(true);
    expect(legend.linePointsInside).toBe(0);
    expect(legend.dotsInside).toBe(0);
    expect(legend.labelsInsideFrame).toBe(true);
  }
});

test('実測値で縦軸の範囲を粗い区切りにすると、目盛りはきりのよい値になる', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('keydist:standalone-analyzer-options', JSON.stringify({ version: 1, 'n-sensitivity': { yRange: 'coarse', scale: 'absolute' } }));
  });
  await seedLayouts(page, ['qwerty', 'dvorak', 'colemak-dh']);
  await page.goto('/standalone/n-sensitivity');
  await expect(page.locator('[data-n-sensitivity-series]')).toHaveCount(3, { timeout: 20_000 });
  expect(await yTickTexts(page)).toEqual(['100 u', '200 u', '300 u', '400 u']);
});
