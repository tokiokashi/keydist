/**
 * 利用者が選んだ時に読み込む組み込みテキストの本文（`corpus/` の `*.txt`）の置き場。
 *
 * 本文を最初の表示に含めないため、`samples.ts` は本文を持たず、ここに読み込んだ本文を置く。
 * 読み込む手段（ブラウザではファイルの取得）は `app` が渡す。この層はブラウザのAPIを知らない。
 * 読み込み前の本文は空として扱う。同期の呼び出し側（解決・コマンド）は、本文が空のまま使われないよう、
 * 画面側が読み込みを待ってから描く（`hosts/shared/use-resolved-text-selection.ts`）。
 */

/** ファイル名から本文を取る。 */
export type CorpusBodyLoader = (fileName: string) => Promise<string>;

const bodies = new Map<string, string>();
const inFlight = new Map<string, Promise<void>>();
const failed = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function notify(): void {
  version++;
  for (const listener of listeners) listener();
}

/** 評価に渡す前処理（空白の畳み込み）は、組み込みの日本語サンプルと同じ。 */
function preprocess(raw: string): string {
  return raw.replace(/\s+/g, '');
}

/** 読み込んだ本文を置く。ブラウザ以外（検査・テスト）が本文を直接置く時にも使う。 */
export function setCorpusBody(sampleId: string, raw: string): void {
  bodies.set(sampleId, preprocess(raw));
  failed.delete(sampleId);
  notify();
}

/** 読み込み済みの本文。まだなら `undefined`。 */
export function corpusBody(sampleId: string): string | undefined {
  return bodies.get(sampleId);
}

export type CorpusBodyStatus = 'loaded' | 'loading' | 'failed' | 'idle';

export function corpusBodyStatus(sampleId: string): CorpusBodyStatus {
  if (bodies.has(sampleId)) return 'loaded';
  if (inFlight.has(sampleId)) return 'loading';
  if (failed.has(sampleId)) return 'failed';
  return 'idle';
}

/**
 * 本文を読み込む。読み込み済みか読み込み中なら何もしない。失敗は `failed` に記録し、例外は投げない
 * （再び選ばれた時に、もう一度試す）。
 */
export function requestCorpusBody(sampleId: string, fileName: string, loader: CorpusBodyLoader): Promise<void> {
  if (bodies.has(sampleId)) return Promise.resolve();
  const running = inFlight.get(sampleId);
  if (running !== undefined) return running;
  failed.delete(sampleId);
  const task = loader(fileName).then(
    (raw) => {
      inFlight.delete(sampleId);
      bodies.set(sampleId, preprocess(raw));
      notify();
    },
    () => {
      inFlight.delete(sampleId);
      failed.add(sampleId);
      notify();
    },
  );
  inFlight.set(sampleId, task);
  notify();
  return task;
}

/** 読み込みの状態が変わるたびに呼ばれる。`useSyncExternalStore` 向け。 */
export function subscribeCorpusBodies(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 読み込みの状態が変わるたびに増える数。`useSyncExternalStore` の値に使う。 */
export function corpusBodiesVersion(): number {
  return version;
}
