/**
 * 利用者が選んだ時に読み込む組み込みテキストの本文（`corpus/` の `*.txt`）の置き場。
 *
 * 本文を最初の表示に含めないため、`samples.ts` は本文を持たず、ここに読み込んだ本文を置く。
 * 読み込む手段（ブラウザではファイルの取得）は `app` が渡す。この層はブラウザのAPIを知らない。
 * 読み込み前の本文は空として扱う。同期の呼び出し側（解決・コマンド）は、本文が空のまま使われないよう、
 * 画面側が読み込みを待ってから描く（`hosts/shared/use-resolved-text-selection.ts`）。
 */

import { isAlphanumericChar } from './evaluation-text.ts';

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

/**
 * 組み込みの日本語の本文の空白の処理。空白と改行はすべて取り除く。ただし、英字と数字どうしに挟まれた、改行を含まない空白は
 * 1つの半角の空白に畳んで残す（`the Internet` を `theInternet` にしない。自作のテキストを英数字を残す条件で評価した時と同じ語の区切りになる）。
 */
export function corpusBodyText(raw: string): string {
  return raw.replace(/\s+/gu, (run, offset: number, whole: string) => {
    if (/[\r\n]/u.test(run)) return '';
    const before = [...whole.slice(Math.max(0, offset - 2), offset)].at(-1);
    const after = [...whole.slice(offset + run.length, offset + run.length + 2)][0];
    return before !== undefined && after !== undefined && isAlphanumericChar(before) && isAlphanumericChar(after) ? ' ' : '';
  });
}

const preprocess = corpusBodyText;

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
 * （呼び出し側が、失敗の後に `requestCorpusBody` をもう一度呼んで試し直す）。
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
