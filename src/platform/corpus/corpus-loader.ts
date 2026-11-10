/// <reference types="vite/client" />

/**
 * 組み込みテキストの本文（`input/text/corpus/` の `*.txt`）を取得する。
 * 本文はJavaScriptに含めず、独立したファイルとして配る。ここが持つのはファイルの場所だけで、取得は選ばれた時に行う。
 */
const FILE_URLS = import.meta.glob<string>('../../input/text/corpus/*.txt', { query: '?url', import: 'default', eager: true });

export async function fetchCorpusBody(fileName: string): Promise<string> {
  const url = FILE_URLS[`../../input/text/corpus/${fileName}`];
  if (url === undefined) throw new Error(`組み込みテキストのファイルが無い: ${fileName}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} を取得できなかった（応答 ${response.status}）`);
  return response.text();
}
