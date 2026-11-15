import { createRecordHandler } from './record-handler.ts';
import type { RecordWorkerRequest, RecordWorkerResponse } from './record-worker-protocol.ts';

/**
 * 打鍵の記録の計算用Workerの入口（Viteが別チャンクとして切り出す。`record-computer.ts`が起動する）。
 * 全文の打鍵の列を作る計算は長いテキストで数秒かかるので、メインスレッドの入力とスクロールを止めないために、ここで走らせる。
 */
const handle = createRecordHandler();

// このファイルはWorkerとして動く。DOMの型のままだと`self`が`Window`になるので、使う分だけ型を当てる。
const scope = self as unknown as {
  onmessage: ((event: { readonly data: RecordWorkerRequest }) => void) | null;
  postMessage(message: RecordWorkerResponse): void;
};

scope.onmessage = (event) => {
  scope.postMessage(handle(event.data));
};
