import { type DictionaryFiles, readDictionaryZip } from './dictionary-files.ts';

/** Cache APIのうち使う部分。テストで差し替えられるように狭くしてある。 */
export interface DictionaryCache {
  match(request: string): Promise<Response | undefined>;
  put(request: string, response: Response): Promise<void>;
  delete(request: string): Promise<boolean>;
}

export interface DictionaryCacheStorage {
  open(name: string): Promise<DictionaryCache>;
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
}

export interface DictionaryLoadRequest {
  /** 辞書のzipのURL */
  url: string;
  /** 辞書の版。保存の名前に含める */
  version: string;
  fetchImpl: (url: string) => Promise<Response>;
  /** 保存先。無い環境では保存せずに取得だけする */
  cacheStorage: DictionaryCacheStorage | undefined;
}

export interface LoadedDictionary {
  files: DictionaryFiles;
  /** 辞書を取った元。`cache` は通信せずに保存したものを使った */
  source: 'cache' | 'network';
  /** 取得したzipを保存できたか（`cache` から読んだ時はtrue） */
  stored: boolean;
}

export const DICTIONARY_CACHE_PREFIX = 'keydist-reading-dictionary-';

export function dictionaryCacheName(version: string): string {
  return `${DICTIONARY_CACHE_PREFIX}${version}`;
}

/** 保存先が使えない（プライベートウィンドウなど）時は、保存せずに取得して読み込む。 */
async function openCache(request: DictionaryLoadRequest): Promise<DictionaryCache | undefined> {
  if (request.cacheStorage === undefined) return undefined;
  try {
    return await request.cacheStorage.open(dictionaryCacheName(request.version));
  } catch {
    return undefined;
  }
}

/** 今の版以外の保存を消す。消せなくても読み込みは続ける。 */
async function removeOtherVersions(request: DictionaryLoadRequest): Promise<void> {
  const storage = request.cacheStorage;
  if (storage === undefined) return;
  try {
    const current = dictionaryCacheName(request.version);
    for (const name of await storage.keys()) {
      if (name.startsWith(DICTIONARY_CACHE_PREFIX) && name !== current) await storage.delete(name);
    }
  } catch {
    // 古い版が残るだけで、読み込みには影響しない
  }
}

async function readStored(cache: DictionaryCache, request: DictionaryLoadRequest): Promise<DictionaryFiles | undefined> {
  try {
    const response = await cache.match(request.url);
    if (response === undefined || !response.ok) return undefined;
    return await readDictionaryZip(await response.arrayBuffer());
  } catch {
    // 壊れた保存は使わない。取り直した後に上書きする
    await cache.delete(request.url).catch(() => false);
    return undefined;
  }
}

/**
 * 辞書を読み込む。保存したzipがあればそれを使い（通信しない）、無ければ取得して保存する。
 * 取得した応答は、状態が正常で、辞書として読めるzipの時だけ保存する。
 * 取得に失敗した時と、辞書として読めない時は例外を投げる。
 */
export async function loadDictionary(request: DictionaryLoadRequest): Promise<LoadedDictionary> {
  await removeOtherVersions(request);
  const cache = await openCache(request);
  if (cache !== undefined) {
    const files = await readStored(cache, request);
    if (files !== undefined) return { files, source: 'cache', stored: true };
  }

  const response = await request.fetchImpl(request.url);
  if (!response.ok) throw new Error(`辞書を取得できませんでした（応答 ${response.status}）`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const files = await readDictionaryZip(bytes);

  let stored = false;
  if (cache !== undefined) {
    try {
      await cache.put(request.url, new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/zip' } }));
      stored = true;
    } catch {
      // 容量不足など。保存できなくても、読み込んだ辞書はこの回の解析に使える
    }
  }
  return { files, source: 'network', stored };
}
