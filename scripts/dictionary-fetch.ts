import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DICTIONARY_SPEC } from '../src/platform/reading/dictionary-spec.ts';

/** 取ったzipを置く場所（gitの追跡外）。`npm run dev` と `npm run build` が同じ場所を使う。 */
export const DICTIONARY_CACHE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.cache', 'dictionary');

export interface DictionaryFetchOptions {
  dir?: string;
  url?: string;
  sha256?: string;
  fetchImpl?: (url: string) => Promise<Response>;
}

function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * 辞書のzipを返す。置き場にsha256の合うzipがあれば、それを使って取り直さない。
 * 無い・合わない時は取得し、sha256が合わなければ例外を投げる（ビルドを止める）。合ったzipだけを置き場に書く。
 */
export async function ensureDictionaryZip(options: DictionaryFetchOptions = {}): Promise<Uint8Array> {
  const dir = options.dir ?? DICTIONARY_CACHE_DIR;
  const url = options.url ?? DICTIONARY_SPEC.upstreamUrl;
  const expected = options.sha256 ?? DICTIONARY_SPEC.sha256;
  const fetchImpl = options.fetchImpl ?? ((target: string) => fetch(target));
  const path = join(dir, DICTIONARY_SPEC.fileName);

  const stored = await readFile(path).catch(() => undefined);
  if (stored !== undefined && sha256Of(stored) === expected) return stored;

  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`辞書のzipを取得できなかった: ${url}（応答 ${response.status}）`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = sha256Of(bytes);
  if (actual !== expected) {
    throw new Error(`辞書のzipのsha256が固定した値と違う: ${url}\n  期待 ${expected}\n  実際 ${actual}`);
  }
  await mkdir(dir, { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
  return bytes;
}

// `node --experimental-strip-types scripts/dictionary-fetch.ts` で単独に取得する（CIのキャッシュの確認などに使う）
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bytes = await ensureDictionaryZip();
  console.log(`[dictionary] ${DICTIONARY_SPEC.fileName} ${bytes.length}バイト、sha256は固定した値と一致`);
}
