/// <reference types="vite/client" />

/**
 * 同梱する文節の読みの表（`input/text/ngram/` の `*.json`）を取得する。
 * 表はJavaScriptに含めず、公開物では独立したファイルとして配る。ここが持つのはファイルの場所だけで、取得は表を使う解析が現れた時に行う。
 */
const TABLES_PREFIX = '../../input/text/ngram/';

/** 公開物でのファイルの場所。 */
const FILE_URLS = import.meta.glob<string>('../../input/text/ngram/*.json', { query: '?url', import: 'default', eager: true });

/**
 * 開発サーバーは、取得の経路にある `/src/…` のファイルを静的に配らない。開発の間だけ、表を読み込む関数（使われる時に呼ぶ）で受ける。
 * 公開物のビルドでは `import.meta.env.DEV` が偽になるので、この分岐は含まれない。
 */
const DEV_LOADERS = import.meta.env.DEV ? import.meta.glob<string>('../../input/text/ngram/*.json', { query: '?raw', import: 'default' }) : {};

/** 表のファイルを取得して、JSONとして読み込む。 */
export async function fetchNgramTableFile(fileName: string): Promise<unknown> {
  const key = `${TABLES_PREFIX}${fileName}`;
  const devLoader = DEV_LOADERS[key];
  if (devLoader !== undefined) return JSON.parse(await devLoader()) as unknown;
  const url = FILE_URLS[key];
  if (url === undefined) throw new Error(`同梱の表のファイルが無い: ${fileName}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`同梱の表を取得できなかった: ${url}（応答 ${response.status}）`);
  return (await response.json()) as unknown;
}
