/**
 * 依頼された計算を「今すぐではなく、後で1回」実行するための注入可能なスケジューラ
 * （#544 §8-1「engineのAPIを非同期にする」）。
 *
 * 計算そのものは同期（`pipeline.ts`）で一瞬なので、ここで担うのは実行タイミングの制御だけ。
 * 既定は`queueMicrotask`で、同じタスクを2つ以上ため込まない（マイクロタスク1個で足りる）。
 * `schedule`は`task`を同期に（呼び出しの中で）実行してはならない前提を置く
 * （`request.ts`側の再入対策が、scheduleの戻り値でまだ`cancelScheduled`を
 * 更新し終わる前にtaskが走らないことに依存している）。
 *
 * 重要: **これだけではWorkerへ移せない。** ここで打ち切っているのは「メインスレッド上での
 * 実行タイミング」だけで、`task`の中身（`request.ts`が渡すクロージャ）は`compute`を
 * メインスレッドで同期に呼ぶ。`EngineScheduler`の実装を差し替えても、計算自体は
 * メインスレッドに残ったまま。実際にWorkerへ移すには、こことは別に最低限次の2つが要る:
 *
 * 1. **`compute`自体を非同期にする**: シリアライズ可能な入力（`ResolvedInput`）を
 *    Workerへ送り、結果をメッセージで受け取る形へ`request.ts`の`compute`引数の型を変える
 * 2. **キー単位でin-flightの依頼を重複排除する**: 今`cache.test.ts`等が見ている「共有」は、
 *    同期計算1回がマイクロタスクのFIFOでたまたま1回で済んでいるだけ（先に計算した側が
 *    キャッシュへ積み、後続はそれを読むだけになる）。計算が非同期になり複数の依頼が
 *    同じキーの計算完了を跨いで重なると、「同じキーへ2回Workerへ送ってしまう」を
 *    防ぐ仕組み（同じキーの依頼をWorkerからの返信1件にまとめて配る）が別途要る
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
