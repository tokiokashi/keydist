// ビルドの後に、同梱のテキストの本文（`src/input/text/corpus/*.txt`）が、JavaScriptに入らず、独立したファイルとして公開物に入っているかを確かめる。
//
// 本文は選んだ時にだけ取得する（`src/platform/corpus/corpus-loader.ts`）。取得の経路が `?url` から `?inline` や `?raw` に変わると、
// 本文がJavaScriptに入って全ページの初期読み込みが増えるが、表示は壊れないので、e2eでは気づけない。そのためビルドの後に検査する。
//
// 見るのは次の2点。
// - 各本文の、最も長い行の先頭の一部が、公開物のどの `.js` にも含まれない
// - 各本文と同じ内容のファイルが、公開物の `assets/` にある
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const PUBLIC_DIR = resolve('.output/public');
const CORPUS_DIR = resolve('src/input/text/corpus');
/** 偶然の一致を避けるため、本文から取り出す断片の長さ。 */
const FRAGMENT_LENGTH = 24;

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => (entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)])));
  return nested.flat();
}

function fragmentOf(body: string): string {
  const longest = body.split('\n').reduce((best, line) => (line.length > best.length ? line : best), '');
  return longest.slice(0, FRAGMENT_LENGTH);
}

const corpusNames = (await readdir(CORPUS_DIR)).filter((name) => name.endsWith('.txt')).sort();
const bodies = new Map<string, string>();
for (const name of corpusNames) bodies.set(name, await readFile(join(CORPUS_DIR, name), 'utf8'));

const publicFiles = await filesUnder(PUBLIC_DIR);
const scripts = await Promise.all(publicFiles.filter((path) => path.endsWith('.js')).map(async (path) => ({ path, text: await readFile(path, 'utf8') })));
const assetTexts = await Promise.all(publicFiles.filter((path) => path.endsWith('.txt')).map((path) => readFile(path, 'utf8')));

const problems: string[] = [];
for (const [name, body] of bodies) {
  const fragment = fragmentOf(body);
  if (fragment.length < FRAGMENT_LENGTH) problems.push(`${name}: 照合に使う断片を取れない`);
  for (const script of scripts) {
    if (script.text.includes(fragment)) problems.push(`${name}: 本文の一部が ${script.path} に入っている`);
  }
  if (!assetTexts.includes(body)) problems.push(`${name}: 同じ内容の独立したファイルが公開物に無い`);
}
if (corpusNames.length === 0) problems.push('同梱のテキストが1本も無い');

if (problems.length > 0) {
  for (const problem of problems) console.error(`[corpus-assets] ${problem}`);
  process.exit(1);
}
console.log(`同梱のテキスト${corpusNames.length}本は、JavaScriptに入らず、独立したファイルとして公開物に入っている`);
