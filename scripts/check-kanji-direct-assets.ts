// ビルドの後に、漢直の配列の表（`src/input/layouts/tables/*.json`）が、JavaScriptに入らず、独立したファイルとして公開物に入っているかを確かめる。
//
// 表は配列が使われる時にだけ取得する（`src/platform/layouts/kanji-direct-loader.ts`）。取得の経路が `?url` から `?inline` や `?raw`、
// JSONのimportに変わると、表がJavaScriptに入って全ページの初期読み込みと計算用Workerが増えるが、表示は壊れないので、e2eでは気づけない。
// そのためビルドの後に検査する。
//
// 見るのは次の2点。
// - 各表の、欄を並べた字列の断片が、公開物のどの `.js` にも含まれない
// - 各表と同じ内容のファイルが、公開物の `assets/` にある
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const PUBLIC_DIR = resolve('.output/public');
const TABLES_DIR = resolve('src/input/layouts/tables');
/** 偶然の一致を避けるため、表から取り出す断片の長さ。 */
const FRAGMENT_LENGTH = 4;

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => (entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)])));
  return nested.flat();
}

/**
 * 表（JSON）の中の、漢字が続く並びから、断片を取る。かなと記号の並びは、JavaScriptの別の表にも現れるので使わない。
 * 表の欄は字の頻度順に並んでいて、語にならないので、同じ並びが偶然JavaScriptに現れることは無い。
 */
function fragmentsOf(value: unknown, found: string[] = []): string[] {
  if (typeof value === 'string') {
    for (const run of value.match(/\p{Script=Han}+/gu) ?? []) if (run.length >= FRAGMENT_LENGTH) found.push(run.slice(0, FRAGMENT_LENGTH));
  } else if (Array.isArray(value)) {
    for (const item of value) fragmentsOf(item, found);
  } else if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) fragmentsOf(item, found);
  }
  return found;
}

const tableNames = (await readdir(TABLES_DIR)).filter((name) => name.endsWith('.json')).sort();
const tables = new Map<string, string>();
for (const name of tableNames) tables.set(name, await readFile(join(TABLES_DIR, name), 'utf8'));

const publicFiles = await filesUnder(PUBLIC_DIR);
const scripts = await Promise.all(publicFiles.filter((path) => path.endsWith('.js')).map(async (path) => ({ path, text: await readFile(path, 'utf8') })));
const assetTexts = await Promise.all(publicFiles.filter((path) => path.endsWith('.json')).map((path) => readFile(path, 'utf8')));

const problems: string[] = [];
for (const [name, text] of tables) {
  const fragments = fragmentsOf(JSON.parse(text));
  if (fragments.length === 0) problems.push(`${name}: 照合に使う断片を取れない`);
  for (const fragment of fragments) {
    for (const script of scripts) {
      if (script.text.includes(fragment)) problems.push(`${name}: 表の一部（${fragment}）が ${script.path} に入っている`);
    }
  }
  if (!assetTexts.includes(text)) problems.push(`${name}: 同じ内容の独立したファイルが公開物に無い`);
}
if (tableNames.length === 0) problems.push('漢直の表が1本も無い');

if (problems.length > 0) {
  for (const problem of problems) console.error(`[kanji-direct-assets] ${problem}`);
  process.exit(1);
}
console.log(`漢直の表${tableNames.length}本は、JavaScriptに入らず、独立したファイルとして公開物に入っている`);
