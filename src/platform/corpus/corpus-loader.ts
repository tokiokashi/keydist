/// <reference types="vite/client" />

/**
 * 組み込みテキストの本文（`input/text/corpus/` の `*.txt`）を取得する。
 * 本文はJavaScriptに含めず、公開物では独立したファイルとして配る。ここが持つのはファイルの場所だけで、取得は選ばれた時に行う。
 */
const CORPUS_PREFIX = '../../input/text/corpus/';

/** 公開物でのファイルの場所。 */
const FILE_URLS = import.meta.glob<string>('../../input/text/corpus/*.txt', { query: '?url', import: 'default', eager: true });

/**
 * 開発サーバーは、取得の経路にある `/src/…` のファイルを静的に配らない。開発の間だけ、本文を読み込む関数（選ばれた時に呼ぶ）で受ける。
 * 公開物のビルドでは `import.meta.env.DEV` が偽になるので、この分岐は含まれない。
 */
const DEV_LOADERS = import.meta.env.DEV ? import.meta.glob<string>('../../input/text/corpus/*.txt', { query: '?raw', import: 'default' }) : {};

export async function fetchCorpusBody(fileName: string): Promise<string> {
  const key = `${CORPUS_PREFIX}${fileName}`;
  const devLoader = DEV_LOADERS[key];
  if (devLoader !== undefined) return devLoader();
  const url = FILE_URLS[key];
  if (url === undefined) throw new Error(`組み込みテキストのファイルが無い: ${fileName}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} を取得できなかった（応答 ${response.status}）`);
  return response.text();
}
