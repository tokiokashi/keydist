/// <reference types="vite/client" />

/**
 * 漢直の組み込みの配列の表（`input/layouts/tables/` の `*.json`）を取得する。
 * 表はJavaScriptに含めず、公開物では独立したファイルとして配る。ここが持つのはファイルの場所だけで、取得は配列が計算に使われる時に行う。
 */
const TABLES_PREFIX = '../../input/layouts/tables/';

/** 公開物でのファイルの場所。 */
const FILE_URLS = import.meta.glob<string>('../../input/layouts/tables/*.json', { query: '?url', import: 'default', eager: true });

/**
 * 開発サーバーは、取得の経路にある `/src/…` のファイルを静的に配らない。開発の間だけ、表を読み込む関数（使われる時に呼ぶ）で受ける。
 * 公開物のビルドでは `import.meta.env.DEV` が偽になるので、この分岐は含まれない。
 */
const DEV_LOADERS = import.meta.env.DEV ? import.meta.glob<string>('../../input/layouts/tables/*.json', { query: '?raw', import: 'default' }) : {};

/** 表のファイルを取得して、JSONとして読み込む。 */
export async function fetchKanjiDirectTable(tableFile: string): Promise<unknown> {
  const key = `${TABLES_PREFIX}${tableFile}`;
  const devLoader = DEV_LOADERS[key];
  if (devLoader !== undefined) return JSON.parse(await devLoader()) as unknown;
  const url = FILE_URLS[key];
  if (url === undefined) throw new Error(`漢直の表のファイルが無い: ${tableFile}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`漢直の表を取得できなかった: ${url}（応答 ${response.status}）`);
  return (await response.json()) as unknown;
}
