import type { Plugin } from 'vite';
import { readDictionaryNotice } from '../src/platform/reading/dictionary-files.ts';
import { DICTIONARY_SPEC } from '../src/platform/reading/dictionary-spec.ts';
import { ensureDictionaryZip } from './dictionary-fetch.ts';

/**
 * 辞書のzipと告知文を、devサーバーと公開物の同じURL（`<base>lindera-ipadic-6.2.0.zip` など）で配る。
 * zipは `scripts/dictionary-fetch.ts` が版とハッシュを固定して取る。リポジトリには置かない。
 * `vite preview` は公開物のディレクトリをそのまま配るので、ビルドの出力に入れれば足りる。
 */
export function dictionaryPlugin(): Plugin {
  let zip: Promise<Uint8Array> | undefined;
  const getZip = () => {
    zip ??= ensureDictionaryZip();
    return zip;
  };
  let base = '/';

  return {
    name: 'keydist-dictionary',
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      // 取得を先に始める。失敗してもサーバーは止めず、zipを求められた時に失敗を返す
      getZip().catch(() => undefined);
      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0] ?? '';
        const name = [DICTIONARY_SPEC.fileName, DICTIONARY_SPEC.noticeFileName].find((file) => pathname === `${base}${file}` || pathname === `/${file}`);
        if (req.method !== 'GET' || name === undefined) {
          next();
          return;
        }
        try {
          const bytes = await getZip();
          const body = name === DICTIONARY_SPEC.fileName ? bytes : await readDictionaryNotice(bytes);
          if (body === undefined) throw new Error('辞書のzipに告知文が無い');
          res.setHeader('Content-Type', name === DICTIONARY_SPEC.fileName ? 'application/zip' : 'text/plain; charset=utf-8');
          res.setHeader('Content-Length', String(body.length));
          res.end(body);
        } catch (error) {
          zip = undefined;
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(error instanceof Error ? error.message : String(error));
        }
      });
    },
    async generateBundle() {
      // クライアントの出力にだけ入れる（サーバー側のビルドには要らない）
      if (this.environment.name !== 'client') return;
      const bytes = await getZip();
      const notice = await readDictionaryNotice(bytes);
      if (notice === undefined) throw new Error('辞書のzipに告知文（NOTICE.txt）が無い');
      this.emitFile({ type: 'asset', fileName: DICTIONARY_SPEC.fileName, source: bytes });
      this.emitFile({ type: 'asset', fileName: DICTIONARY_SPEC.noticeFileName, source: notice });
    },
  };
}
