/**
 * 依頼された計算を「今すぐではなく、後で1回」実行するための注入可能なスケジューラ。
 *
 * 計算そのものは同期（`pipeline.ts`）で一瞬なので、ここで担うのは実行タイミングの制御だけ。
 * 既定は`queueMicrotask`で、同じタスクを2つ以上ため込まない（マイクロタスク1個で足りる）。
 * `schedule`は`task`を同期に（呼び出しの中で）実行してはならない前提を置く
 * （`request.ts`側の再入対策が、scheduleの戻り値でまだ`cancelScheduled`を
 * 更新し終わる前にtaskが走らないことに依存している）。
 *
 * 重要: **これだけではWorkerへ移せない。** ここで打ち切っているのは「メインスレッド上での
 * 実行タイミング」だけで、`task`の中身（`request.ts`が渡すクロージャ）が`compute`を
 * 呼ぶ場所は変わらない。計算をWorkerへ移す仕組みは別にある:
 * `computer.ts`の`EngineComputer`（Promiseを返してよい窓口）と、`worker-client.ts`
 * （待ちの依頼を1件ずつWorkerへ送り、古い依頼はWorkerごと止める）。
 * 同じキーの依頼の重複は、Workerに1度に1件しか送らないことと、Worker内の`EngineCache`が
 * 先の依頼の結果を持っていることで、二重に計算しない。
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
