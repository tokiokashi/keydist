import type { NgramTableSource } from '#hosts/shared/ngram-table.ts';
import { parseNgramTableFile, type NgramTableFile } from '#interpretation/ngram-table-asset.ts';
import { fetchNgramTableFile } from '#platform/ngram/table-loader.ts';

/** 標準のコーパスの表のファイル名。 */
export const STANDARD_TABLE_FILE = 'standard-corpus-bunsetsu.json';

/**
 * 同梱の表の入口を、最初に呼ばれた時に取得する形で包む。表を使う解析が現れるまで取得しない。
 * 取得できなかった時は、次の呼び出しで取得し直す。
 */
export function createLazyNgramTableSource(fetchFile: () => Promise<unknown>): NgramTableSource {
  let loading: Promise<NgramTableFile> | undefined;
  return {
    load() {
      if (loading === undefined) {
        const attempt = fetchFile().then(parseNgramTableFile);
        attempt.catch(() => {
          if (loading === attempt) loading = undefined;
        });
        loading = attempt;
      }
      return loading;
    },
  };
}

/** 画面が共有する、標準のコーパスの表の入口。 */
export const sharedNgramTableSource: NgramTableSource = createLazyNgramTableSource(() => fetchNgramTableFile(STANDARD_TABLE_FILE));
