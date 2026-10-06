import type { Page } from '@playwright/test';

/**
 * 実時間で待たずに、画面が落ち着くのを待つ部品。
 * 待ち時間を決め打ちすると、遅い環境では足りず、速い環境では無駄になる。ここでは描画のフレームと、
 * 実際に動いているCSSのtransitionを見て、答えを持つ側（ブラウザ）から読む。
 */

/** 描画のフレームを `count` 回進める。ResizeObserverの通知とその後の再描画を待つ時に使う。 */
export const afterFrames = (page: Page, count = 3): Promise<void> => page.evaluate((frames) => new Promise<void>((resolve) => {
  let left = frames;
  const tick = () => {
    left -= 1;
    if (left <= 0) resolve();
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}), count);

/**
 * macrotaskを `count` 回進める。`page.clock` でタイマーと描画のフレームを止めている間は
 * `requestAnimationFrame` が進まないので、フレームの代わりにこちらを使う。
 * Reactの描画はMessageChannelのtaskで流れるので、同じ経路のtaskを後ろに積めば、先に積まれた描画が済む。
 */
export const afterTasks = (page: Page, count = 5): Promise<void> => page.evaluate((rounds) => new Promise<void>((resolve) => {
  let left = rounds;
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    left -= 1;
    if (left <= 0) resolve();
    else channel.port2.postMessage(0);
  };
  channel.port2.postMessage(0);
}), count);

/** 動いているCSSのtransition（格子の配置の動き200ms等）が無くなるまでの確認。 */
const hasRunningTransition = (page: Page): Promise<boolean> => page.evaluate(() => document.getAnimations()
  .some((animation) => animation instanceof CSSTransition && animation.playState === 'running'));

/** `settleBy` が落ち着きを待つ確認の回数の上限。1回はフレーム3つぶんなので、約10秒分に当たる。 */
const SETTLE_MAX_CHECKS = 200;

/**
 * `read` が返す寸法の記録が、`stableChecks` 回続けて同じで、動いているtransitionも無くなるまで待つ。
 * 1回の確認ごとにフレームを3つ進める。時間では待たない。
 * 上限の回数を確認しても落ち着かなければ、テストの時間切れを待たずに、最後の記録を添えて落ちる。
 */
export async function settleBy(page: Page, read: () => Promise<string>, stableChecks = 4): Promise<void> {
  let last = await read();
  const history = [last];
  let stable = 0;
  for (let checks = 0; stable < stableChecks; checks += 1) {
    if (checks >= SETTLE_MAX_CHECKS) {
      throw new Error(`落ち着かなかった（${SETTLE_MAX_CHECKS}回確認）。最後の12回の値:\n${history.slice(-12).join('\n')}`);
    }
    await afterFrames(page);
    const now = await read();
    const animating = await hasRunningTransition(page);
    stable = now === last && !animating ? stable + 1 : 0;
    last = now;
    history.push(`${now}${animating ? ' (transition中)' : ''}`);
  }
}

/**
 * 浮かせたパネル（入力コンバータのカンペ等）のspring（ドラッグ解除後の拡大の戻りと配置の動き）が収まるまで待つ。
 * ドラッグ中の印と、描かれた矩形・transformが続けて変わらなくなったことを見る。
 */
export function settlePanels(page: Page): Promise<void> {
  return settleBy(page, () => page.locator('section[data-floating="true"]').evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect();
    return [el.getAttribute('data-dragging') ?? '', getComputedStyle(el).transform, r.x.toFixed(2), r.y.toFixed(2), r.width.toFixed(2), r.height.toFixed(2)].join(',');
  }).join('|')));
}

/** Workspaceの全ペインの位置・大きさが落ち着くまで待つ（格子の配置の動き200msの後）。 */
export function settleGrid(page: Page): Promise<void> {
  return settleBy(page, () => page.locator('.workspace-grid-item').evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect();
    return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`;
  }).join('|')));
}

/**
 * `page.clock` でタイマーの進みを止める。`page.clock.install()` の後にページを開き、検査の対象の部品が出てから呼ぶ。
 * 以後、タイマーは `advance` で進めた分しか進まない。debounceが切れる時刻を、実時間の経過や環境の遅さに任せず検査が決められる。
 */
export async function freezeClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 60_000);
}

/** 描画の反映を待ってから、止めたタイマーを `ms` だけ進める。進めた後の描画が済むのも待つ。 */
export async function advance(page: Page, ms: number): Promise<void> {
  await afterTasks(page);
  await page.clock.runFor(ms);
  await afterTasks(page);
}
