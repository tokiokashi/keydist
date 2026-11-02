// ビルドの後に、公開物（`.output`）へpackage.jsonの欄が入っていないかを確かめる。
//
// `vite.config.ts`の`packageJsonBudouxOnly`は、`src/platform/bunsetsu/info.ts`が取り込むpackage.jsonを
// budouxの版だけの形に置き換える。そのプラグインはimportの対象のパスが一致しない時（リポジトリを
// シンボリックリンク越しの場所に置いた場合など）は何もしないため、package.jsonの全体が公開物に入る。
// その時はビルドも表示も正常に見えるので、ここで見つける。
//
// 見るのはpackage.jsonのscripts・devDependencies・engines・devEngines・packageManager・importsの中の、
// 十分に長い文字列（コマンドの文・パッケージ名・版の指定）。一般的な語（`module`など）は他の出力と
// 偶然に一致するため見ない。package.jsonのversionとnameは画面に出る値と重なるので見ない。
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const OUTPUT_DIR = resolve('.output');
const PACKAGE_JSON = resolve('package.json');

// 偶然の一致を避けるため、これより短い文字列は見ない。
const MIN_LENGTH = 8;

type PackageJson = Record<string, unknown>;

function stringLeaves(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringLeaves);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(stringLeaves);
  return [];
}

function forbiddenFragments(pkg: PackageJson): string[] {
  const devDependencyNames = Object.keys((pkg.devDependencies ?? {}) as Record<string, unknown>);
  const fragments = [
    ...stringLeaves(pkg.scripts),
    ...stringLeaves(pkg.engines),
    ...stringLeaves(pkg.devEngines),
    ...stringLeaves(pkg.packageManager),
    ...stringLeaves(pkg.imports),
    ...devDependencyNames,
  ];
  return [...new Set(fragments)].filter((fragment) => fragment.length >= MIN_LENGTH);
}

async function allFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? allFiles(path) : [path];
    }),
  );
  return nested.flat();
}

const pkg = JSON.parse(await readFile(PACKAGE_JSON, 'utf8')) as PackageJson;
const fragments = forbiddenFragments(pkg);
if (fragments.length === 0) {
  // 検査する文字列が無いと、何も見ないまま通ってしまう。
  console.error('package.jsonから検査する文字列を取れなかった。');
  process.exit(1);
}

const files = await allFiles(OUTPUT_DIR);
const hits: { file: string; fragment: string }[] = [];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const fragment of fragments) {
    if (text.includes(fragment)) hits.push({ file: relative(OUTPUT_DIR, file), fragment });
  }
}

if (hits.length > 0) {
  console.error(`公開物にpackage.jsonの欄が入っていた（${hits.length}件）:`);
  for (const { file, fragment } of hits) {
    console.error(`  ${file}: ${JSON.stringify(fragment.slice(0, 60))}`);
  }
  console.error('vite.config.tsのpackageJsonBudouxOnlyが効いているかを確かめること。');
  process.exit(1);
}
console.log(`公開物にpackage.jsonの欄は入っていない（${files.length}ファイル・${fragments.length}文字列を検査）`);
