// ビルドの後に、事前描画したHTMLに描画中の例外の跡が無いかを確かめる（判定は `prerender-render-error.ts`）。
//
// 描画中に例外を投げたページも、フレームワークは200で本文の無いHTMLを書き出し、ビルドは成功する。
// prerenderのエラー処理は投げた例外を待たないため、`failOnError` では止まらない。
// ここで見つけたページがあれば、一覧を出して終了コードを1にし、CIのbuildで止める。
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { renderErrorPages } from './prerender-render-error.ts';

const PUBLIC_DIR = resolve('.output/public');

async function htmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name.endsWith('.html') ? [path] : [];
  }));
  return nested.flat();
}

const pages = await Promise.all((await htmlFiles(PUBLIC_DIR)).map(async (file) => ({
  path: relative(PUBLIC_DIR, file),
  html: await readFile(file, 'utf8'),
})));

const failed = renderErrorPages(pages);
if (failed.length > 0) {
  console.error(`描画中に例外が起きたため、本文の無いHTMLが書き出された（${failed.length}件）:`);
  for (const path of failed) console.error(`  ${path}`);
  console.error('ログの「Error in renderToReadableStream」の例外を確かめて直すこと。');
  process.exit(1);
}
