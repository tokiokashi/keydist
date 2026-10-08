import type { Page } from '@playwright/test';

/**
 * 計算のWorkerへの依頼を、テストが放すまで届けない道具。
 * 計算の時間（速さ）で「計算中」を作ると、環境の遅さで計算が先に終わって状態が消える。
 * ここでは依頼を保留している間は計算が終わらないので、計算中の状態が時間に依らず続く。
 * 放すと、保留していた依頼を順に届ける（計算はそこから普通に走る）。
 */

interface WorkerHold {
  on: boolean;
  release(): void;
}

/**
 * ページの読み込み前に呼ぶ。`startHeld` が真なら、読み込み直後の依頼から保留する（初回の計算中を作る時）。
 */
export async function installWorkerHold(page: Page, startHeld = false): Promise<void> {
  await page.addInitScript((held) => {
    const NativeWorker = window.Worker;
    const queue: { worker: Worker; args: unknown[] }[] = [];
    const hold: WorkerHold = {
      on: held,
      release() {
        hold.on = false;
        for (const { worker, args } of queue.splice(0)) {
          (NativeWorker.prototype.postMessage as (...a: unknown[]) => void).apply(worker, args);
        }
      },
    };
    (window as unknown as { __workerHold: WorkerHold }).__workerHold = hold;
    class HoldingWorker extends NativeWorker {
      override postMessage(...args: unknown[]): void {
        if (hold.on) queue.push({ worker: this, args });
        else (NativeWorker.prototype.postMessage as (...a: unknown[]) => void).apply(this, args);
      }
    }
    window.Worker = HoldingWorker;
  }, startHeld);
}

/** 以後の依頼を保留する（すでに届いた依頼は止めない）。 */
export async function holdWorker(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __workerHold: WorkerHold }).__workerHold.on = true;
  });
}

/** 保留を解いて、溜まった依頼を届ける。 */
export async function releaseWorker(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __workerHold: WorkerHold }).__workerHold.release();
  });
}
