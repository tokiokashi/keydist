/**
 * 依頼された計算を「今すぐではなく、後で1回」実行するための注入可能なスケジューラ
 * （#544 §8-1「engineのAPIを非同期にする」）。
 *
 * 計算そのものは同期（`pipeline.ts`）で一瞬なので、ここで担うのは実行タイミングの制御だけ。
 * 既定は`queueMicrotask`で、同じタスクを2つ以上ため込まない（マイクロタスク1個で足りる）。
 *
 * Worker移行の継ぎ目: 重くなったら、この`EngineScheduler`の実装を「WorkerへpostMessageし、
 * 返信で`task`相当のコールバックを呼ぶ」ものに差し替えるだけでよい。`request.ts`側は
 * スケジューラの中身がマイクロタスクかWorkerかを知らない。
 */
export interface EngineScheduler {
  /**
   * `task`を後で1回実行する。戻り値の関数を呼ぶと、まだ実行前なら打ち切れる
   * （呼び出し済みなら何もしない）。
   */
  schedule(task: () => void): () => void;
}

/** 既定のスケジューラ。テストでは決定的に進められる注入用スケジューラに差し替える。 */
export const microtaskScheduler: EngineScheduler = {
  schedule(task) {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) task();
    });
    return () => {
      cancelled = true;
    };
  },
};
