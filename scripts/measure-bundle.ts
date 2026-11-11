// `npm run build`の出力（`.output/public`）のサイズを測る。結果はJSONで書き出し、上限との比較と差分の表は`perf-report.ts`が作る。
//
// 使い方: node --experimental-strip-types scripts/measure-bundle.ts --out <json> [--dir <公開物のディレクトリ>]
//
// 測るもの（どれも圧縮前`raw`とgzipのbyte数）。ファイル名のハッシュは版ごとに変わるので、ファイル単位でなく次のまとまりで持つ。
// - ページの初期読み込み: 事前描画したHTMLが最初に読み込むJavaScript（`<script type="module">`とmodulepreload）とCSS（`<link rel="stylesheet">`）の合計。
//   トップ`/`、Workspace `/workspace/_`（保存したWorkspaceを開く画面の殻）、個別画面の代表`/analyzer/heatmap/`の3ページ
// - 計算用Worker: `engine-worker-<hash>.js`
// - 公開物のJavaScript全体・CSS全体（遅延読み込みのチャンクを含む）
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';

export interface Size {
  readonly raw: number;
  readonly gzip: number;
}

const PAGES: readonly (readonly [string, string])[] = [
  ['トップ', 'index.html'],
  ['Workspace', 'workspace/_/index.html'],
  ['個別画面（ヒートマップ）', 'analyzer/heatmap/index.html'],
];

function sizeOf(bytes: Uint8Array): Size {
  return { raw: bytes.length, gzip: gzipSync(bytes).length };
}

function sum(sizes: readonly Size[]): Size {
  return { raw: sizes.reduce((a, s) => a + s.raw, 0), gzip: sizes.reduce((a, s) => a + s.gzip, 0) };
}

/** 公開パス（`/keydist/assets/x.js`等）を、出力の`assets/x.js`に寄せる。base pathに依らないため。 */
function assetPath(url: string): string | undefined {
  const index = url.lastIndexOf('/assets/');
  return index === -1 ? undefined : url.slice(index + 1);
}

function attributeValues(html: string, tagPattern: RegExp, attribute: string): string[] {
  const values: string[] = [];
  for (const tag of html.matchAll(tagPattern)) {
    const value = new RegExp(`\\s${attribute}="([^"]*)"`).exec(tag[0])?.[1];
    if (value !== undefined) values.push(value);
  }
  return values;
}

export async function measureBundle(publicDir: string): Promise<Record<string, Size>> {
  const cache = new Map<string, Promise<Size>>();
  const sizeOfAsset = (path: string): Promise<Size> => {
    let size = cache.get(path);
    if (size === undefined) {
      size = readFile(join(publicDir, path)).then(sizeOf);
      cache.set(path, size);
    }
    return size;
  };

  const result: Record<string, Size> = {};
  for (const [label, htmlPath] of PAGES) {
    const html = await readFile(join(publicDir, htmlPath), 'utf8');
    const scripts = [
      ...attributeValues(html, /<script[^>]*type="module"[^>]*>/g, 'src'),
      ...attributeValues(html, /<link[^>]*rel="modulepreload"[^>]*>/g, 'href'),
    ];
    const styles = attributeValues(html, /<link[^>]*rel="stylesheet"[^>]*>/g, 'href');
    const jsPaths = [...new Set(scripts.map(assetPath).filter((path): path is string => path !== undefined))];
    const cssPaths = [...new Set(styles.map(assetPath).filter((path): path is string => path !== undefined))];
    if (jsPaths.length === 0) throw new Error(`${htmlPath} から読み込むJavaScriptを取れない`);
    result[`初期読み込みJS: ${label}`] = sum(await Promise.all(jsPaths.map(sizeOfAsset)));
    result[`初期読み込みCSS: ${label}`] = sum(await Promise.all(cssPaths.map(sizeOfAsset)));
  }

  const assets = (await readdir(join(publicDir, 'assets'))).sort();
  const worker = assets.filter((name) => /^engine-worker-.*\.js$/.test(name));
  if (worker.length !== 1) throw new Error(`engine-workerのチャンクが ${worker.length} 件ある（1件のはず）`);
  result['計算用Worker'] = await sizeOfAsset(`assets/${worker[0]}`);
  result['JavaScript全体'] = sum(await Promise.all(assets.filter((name) => name.endsWith('.js')).map((name) => sizeOfAsset(`assets/${name}`))));
  result.CSS全体 = sum(await Promise.all(assets.filter((name) => name.endsWith('.css')).map((name) => sizeOfAsset(`assets/${name}`))));
  return result;
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { out: { type: 'string' }, dir: { type: 'string', default: '.output/public' } } });
  if (values.out === undefined) throw new Error('--outが要る');
  const sizes = await measureBundle(resolve(values.dir));
  const { writeFile } = await import('node:fs/promises');
  await writeFile(values.out, `${JSON.stringify({ sizes }, null, 2)}\n`);
  for (const [name, size] of Object.entries(sizes)) console.log(`${String(size.gzip).padStart(9)} gzip ${String(size.raw).padStart(9)} raw  ${name}`);
}
