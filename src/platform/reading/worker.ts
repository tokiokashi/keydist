import init, * as lindera from 'lindera-wasm';
import { createReadingAnalyzer, type ReadingAnalyzer } from './analyzer.ts';
import { loadDictionary } from './dictionary-store.ts';
import type { ReadingWorkerRequest, ReadingWorkerResponse } from './protocol.ts';

/**
 * 読みの解析Workerの入口（`client.ts` が最初の読み込みの依頼で起動する）。
 *
 * 辞書を読み込んだ後のwasmのメモリは約97MBあり、Workerを終えるまで解放されない。
 * メインスレッドに置くと解析の間は画面が止まるので、wasm・辞書の取得と保存・解析はすべてここで行う。
 */
let analyzer: Promise<{ analyzer: ReadingAnalyzer; source: 'cache' | 'network'; stored: boolean }> | undefined;

async function load(request: Extract<ReadingWorkerRequest, { op: 'load' }>) {
  const [loaded] = await Promise.all([
    loadDictionary({
      url: request.dictionary.url,
      version: request.dictionary.version,
      fetchImpl: (url) => fetch(url),
      cacheStorage: typeof caches === 'undefined' ? undefined : caches,
    }),
    init(),
  ]);
  return { analyzer: createReadingAnalyzer(lindera as never, loaded.files), source: loaded.source, stored: loaded.stored };
}

function respond(response: ReadingWorkerResponse): void {
  self.postMessage(response);
}

self.onmessage = async (event: MessageEvent<ReadingWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.op === 'load') {
      analyzer ??= load(request);
      const loaded = await analyzer;
      respond({ id: request.id, ok: true, op: 'load', source: loaded.source, stored: loaded.stored });
      return;
    }
    if (analyzer === undefined) throw new Error('辞書を読み込む前に解析を依頼した');
    const tokens = (await analyzer).analyzer.tokenize(request.text);
    respond({ id: request.id, ok: true, op: 'tokenize', tokens });
  } catch (error) {
    if (request.op === 'load') analyzer = undefined;
    respond({ id: request.id, ok: false, message: error instanceof Error ? error.message : String(error) });
  }
};
