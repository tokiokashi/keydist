// 事前描画したページの modulepreload が、読み込むモジュールの静的importの推移閉包を覆っているかを確かめる（#596）。
//
// TanStack Start は、ルートのチャンクが直接importするチャンクしか modulepreload に出さない
// （上流の TanStack/router#8511 / #8520）。patches/ のパッチで推移閉包まで出すようにしているが、
// パッチが外れたり上流の実装が変わったりすると、react や集計のチャンクが preload から落ち、
// 読み込みが直列の往復に戻る。表示は壊れないので、e2e では気づけない。そのためビルドの後に検査する。
//
// 見るのは静的import（`import ... from` / `import "..."` / `export ... from`）だけ。
// `import()` は遅延読み込みなので preload に出ていなくてよい。
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const PUBLIC_DIR = resolve('.output/public');

async function htmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'assets' ? [] : htmlFiles(path);
    return entry.name.endsWith('.html') ? [path] : [];
  }));
  return nested.flat();
}

// 公開パス（`/keydist/assets/x.js` 等）を、出力の `assets/x.js` に寄せる。base path に依存させないため。
function assetPath(url: string): string | undefined {
  const index = url.lastIndexOf('/assets/');
  return index === -1 ? undefined : url.slice(index + 1);
}

function attribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

/** ページが最初に読み込むモジュール（`<script type="module" src>`）と modulepreload の組。 */
function pageModules(html: string): { entries: string[]; preloads: Set<string> } {
  const entries: string[] = [];
  const preloads = new Set<string>();
  for (const [tag] of html.matchAll(/<(?:link|script)\b[^>]*>/g)) {
    const isPreload = tag.startsWith('<link') && attribute(tag, 'rel') === 'modulepreload';
    const isModuleScript = tag.startsWith('<script') && attribute(tag, 'type') === 'module';
    const url = isPreload ? attribute(tag, 'href') : isModuleScript ? attribute(tag, 'src') : undefined;
    const path = url === undefined ? undefined : assetPath(url);
    if (path === undefined) continue;
    if (isPreload) preloads.add(path);
    else entries.push(path);
  }
  return { entries, preloads };
}

// ビルド後のチャンクは静的importを先頭にまとめて持つ。先頭から文を順に読み、importが途切れたら止める。
const LEADING_IMPORT = /^\s*(?:import\s*(?:[\w$]+\s*,?\s*)?(?:\{[^}]*\}|\*\s*as\s*[\w$]+)?\s*(?:from\s*)?|export\s*(?:\{[^}]*\}|\*(?:\s*as\s*[\w$]+)?)\s*from\s*)["']([^"']+)["']\s*;?/;

function staticImports(source: string, fromPath: string): string[] {
  const imports: string[] = [];
  let rest = source.replace(/^\s*\/\/[^\n]*\n/, '');
  for (let match = LEADING_IMPORT.exec(rest); match !== null; match = LEADING_IMPORT.exec(rest)) {
    const specifier = match[1]!;
    if (specifier.startsWith('.')) {
      imports.push(relative(PUBLIC_DIR, resolve(PUBLIC_DIR, fromPath, '..', specifier)));
    }
    rest = rest.slice(match[0].length);
  }
  return imports;
}

const importsCache = new Map<string, Promise<string[]>>();
function importsOf(path: string): Promise<string[]> {
  let cached = importsCache.get(path);
  if (cached === undefined) {
    cached = readFile(join(PUBLIC_DIR, path), 'utf8').then((source) => staticImports(source, path));
    importsCache.set(path, cached);
  }
  return cached;
}

async function closure(entries: readonly string[]): Promise<Set<string>> {
  const seen = new Set(entries);
  const queue = [...entries];
  for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
    for (const imported of await importsOf(path)) {
      if (seen.has(imported)) continue;
      seen.add(imported);
      queue.push(imported);
    }
  }
  return seen;
}

const failures: string[] = [];
let checkedPages = 0;
let sawNestedImport = false;

for (const file of (await htmlFiles(PUBLIC_DIR)).sort()) {
  const { entries, preloads } = pageModules(await readFile(file, 'utf8'));
  if (entries.length === 0) continue; // 転送用の legacy.html 等、モジュールを読まないページ
  checkedPages += 1;
  // entry が静的importしない構成になると、この検査は何も見なくなる。黙って通さないよう、
  // どこかのページで「preload されたチャンクがさらに import している」ことを確かめる。
  const roots = new Set([...entries, ...preloads]);
  for (const root of roots) {
    if ((await importsOf(root)).length > 0) sawNestedImport = true;
  }
  const missing = [...await closure([...roots])].filter((path) => !preloads.has(path) && !entries.includes(path));
  if (missing.length > 0) {
    failures.push(`${relative(PUBLIC_DIR, file)}: modulepreload に無い静的import ${missing.join(', ')}`);
  }
}

if (checkedPages === 0) failures.push('モジュールを読み込むページが .output/public に見つからない');
else if (!sawNestedImport) failures.push('静的importを1つも読み取れなかった。チャンクの形が変わった可能性がある');

if (failures.length > 0) {
  console.error('[modulepreload] 推移閉包を覆っていない:');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`[modulepreload] ${checkedPages} ページで静的importの推移閉包を覆っている`);
