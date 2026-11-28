// ビルドの後に、同梱する文節の読みの表（`src/input/text/ngram/*.json`）が、JavaScriptに入らず、独立したファイルとして公開物に入っているかを確かめる。
//
// 表は表を使う解析が現れた時にだけ取得する（`src/platform/ngram/table-loader.ts`）。取得の経路が `?url` から `?inline` や `?raw`、
// JSONのimportに変わると、表がJavaScriptに入って全ページの初期読み込みと計算用Workerが増えるが、表示は壊れないので、e2eでは気づけない。
// そのためビルドの後に検査する。
//
// 見るのは次の2点。
// - 各表の、文節の読みの並びの断片が、公開物のどの `.js` にも含まれない
// - 各表と同じ内容のファイルが、公開物の `assets/` にある
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const PUBLIC_DIR = resolve('.output/public');
const TABLES_DIR = resolve('src/input/text/ngram');
/** 表から取り出す断片の数。 */
const FRAGMENT_COUNT = 8;
/** 偶然の一致を避けるため、断片に求める長さ。 */
const MIN_FRAGMENT_LENGTH = 8;

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => (entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)])));
  return nested.flat();
}

/** 表（JSON）の鍵のうち、最も長い読みの並びをいくつか取る。長い読みの並びが、JavaScriptの別の文字列に偶然現れることは無い。 */
function fragmentsOf(text: string): string[] {
  const keys = (JSON.parse(text) as { tables: { keys: string[] }[] }).tables[0]?.keys ?? [];
  return [...keys].sort((a, b) => b.length - a.length).slice(0, FRAGMENT_COUNT);
}

const tableNames = (await readdir(TABLES_DIR)).filter((name) => name.endsWith('.json')).sort();
const tables = new Map<string, string>();
for (const name of tableNames) tables.set(name, await readFile(join(TABLES_DIR, name), 'utf8'));

const publicFiles = await filesUnder(PUBLIC_DIR);
const scripts = await Promise.all(publicFiles.filter((path) => path.endsWith('.js')).map(async (path) => ({ path, text: await readFile(path, 'utf8') })));
const assetTexts = await Promise.all(publicFiles.filter((path) => path.endsWith('.json')).map((path) => readFile(path, 'utf8')));

const problems: string[] = [];
for (const [name, text] of tables) {
  const fragments = fragmentsOf(text);
  if (fragments.length < FRAGMENT_COUNT || fragments.some((fragment) => fragment.length < MIN_FRAGMENT_LENGTH))
    problems.push(`${name}: 照合に使う断片を取れない`);
  for (const fragment of fragments) {
    for (const script of scripts) {
      if (script.text.includes(fragment)) problems.push(`${name}: 表の一部（${fragment}）が ${script.path} に入っている`);
    }
  }
  if (!assetTexts.includes(text)) problems.push(`${name}: 同じ内容の独立したファイルが公開物に無い`);
}
if (tableNames.length === 0) problems.push('同梱の文節の表が1本も無い');

if (problems.length > 0) {
  for (const problem of problems) console.error(`[ngram-table-assets] ${problem}`);
  process.exit(1);
}
console.log(`同梱の文節の表${tableNames.length}本は、JavaScriptに入らず、独立したファイルとして公開物に入っている`);
