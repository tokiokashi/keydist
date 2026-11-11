// `bench-engine.ts`と`measure-bundle.ts`の結果から、ベースとheadの差分の表（Markdown）を標準出力へ出す。
//
// 使い方:
//   node --experimental-strip-types scripts/perf-report.ts --budget scripts/bundle-budget.json \
//     --bundle-head <json> [--bundle-base <json>] --bench-head <json>... [--bench-base <json>...]
//
// - ベンチマークは報告だけで、結果によって失敗にしない。ベースかheadを複数回測った時は、計測名ごとに最小値を取る
//   （遅れは時間を伸ばす向きにしか乱れないため）
// - バンドルは、headのgzipサイズが`bundle-budget.json`の上限を超えた計測名があれば、標準エラーに`::error::`を出して終了コード1で終わる
// - ベースの結果が無い（ベースの版に測定の対象が無い等）時は、headの値だけを出す
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

interface BenchFile {
  readonly node: string;
  readonly texts: readonly { readonly id: string; readonly chars: number }[];
  readonly ms: Readonly<Record<string, { readonly min: number; readonly median: number }>>;
}

interface BundleFile {
  readonly sizes: Readonly<Record<string, { readonly raw: number; readonly gzip: number }>>;
}

interface Budget {
  readonly gzip: Readonly<Record<string, number>>;
}

const { values } = parseArgs({
  options: {
    budget: { type: 'string' },
    'bundle-base': { type: 'string' },
    'bundle-head': { type: 'string' },
    'bench-base': { type: 'string', multiple: true, default: [] },
    'bench-head': { type: 'string', multiple: true, default: [] },
  },
});

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function signed(value: number, digits: number, unit: string): string {
  const text = value.toFixed(digits);
  return `${value > 0 ? '+' : ''}${text}${unit}`;
}

function percent(base: number, head: number): string {
  return base === 0 ? '-' : signed(((head - base) / base) * 100, 1, '%');
}

/** 複数回の測定ファイルを、計測名ごとの最小値にまとめる。 */
function mergeBench(paths: readonly string[]): { readonly files: readonly BenchFile[]; readonly min: Map<string, number> } {
  const files = paths.map((path) => readJson<BenchFile>(path));
  const min = new Map<string, number>();
  for (const file of files) {
    for (const [name, value] of Object.entries(file.ms)) min.set(name, Math.min(min.get(name) ?? Number.POSITIVE_INFINITY, value.min));
  }
  return { files, min };
}

function benchSection(basePaths: readonly string[], headPaths: readonly string[]): string[] {
  if (headPaths.length === 0) return [];
  const head = mergeBench(headPaths);
  const base = basePaths.length > 0 ? mergeBench(basePaths) : undefined;
  const first = head.files[0]!;
  const lines = [
    '### 計算の時間',
    '',
    `Node ${first.node}。テキスト: ${first.texts.map((text) => `${text.id}（${text.chars}字）`).join('、')}。` +
      `${head.files.length}回の測定の最小値（ms）。報告だけで、差分の大きさで失敗にはしません。`,
    '',
  ];
  if (base === undefined) lines.push('ベースの測定が無いので、headの値だけを示します。', '');
  lines.push(
    base === undefined ? '| 計測 | head |' : '| 計測 | base | head | 差 |',
    base === undefined ? '| --- | ---: |' : '| --- | ---: | ---: | ---: |',
  );
  for (const [name, headMs] of head.min) {
    const baseMs = base?.min.get(name);
    if (base === undefined) lines.push(`| ${name} | ${headMs.toFixed(1)} |`);
    else if (baseMs === undefined) lines.push(`| ${name} | - | ${headMs.toFixed(1)} | - |`);
    else lines.push(`| ${name} | ${baseMs.toFixed(1)} | ${headMs.toFixed(1)} | ${signed(headMs - baseMs, 1, ' ms')} (${percent(baseMs, headMs)}) |`);
  }
  lines.push('');
  return lines;
}

function kib(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

/** バンドルの表と、上限を超えた計測名の一覧を返す。 */
function bundleSection(budgetPath: string, basePath: string | undefined, headPath: string): { readonly lines: string[]; readonly over: string[] } {
  const budget = readJson<Budget>(budgetPath);
  const head = readJson<BundleFile>(headPath).sizes;
  const base = basePath === undefined ? undefined : readJson<BundleFile>(basePath).sizes;
  const lines = ['### バンドルサイズ（gzip）', ''];
  if (base === undefined) lines.push('ベースの測定が無いので、headの値だけを示します。', '');
  lines.push('| 計測 | base | head | 差 | 上限 | 上限に対する割合 |', '| --- | ---: | ---: | ---: | ---: | ---: |');
  const over: string[] = [];
  for (const [name, size] of Object.entries(head)) {
    const limit = budget.gzip[name];
    const baseSize = base?.[name]?.gzip;
    const diff = baseSize === undefined ? '-' : `${signed(size.gzip - baseSize, 0, ' B')} (${percent(baseSize, size.gzip)})`;
    const exceeded = limit !== undefined && size.gzip > limit;
    if (exceeded) over.push(`${name}: ${size.gzip}Bが上限の${limit}Bを超えた`);
    const ratio = limit === undefined ? '上限なし' : `${exceeded ? '超過 ' : ''}${((size.gzip / limit) * 100).toFixed(1)}%`;
    lines.push(
      `| ${name} | ${baseSize === undefined ? '-' : kib(baseSize)} | ${kib(size.gzip)} | ${diff} | ${limit === undefined ? '-' : kib(limit)} | ${ratio} |`,
    );
  }
  lines.push('');
  if (over.length > 0)
    lines.push(
      `上限を超えた計測が ${over.length} 件あります。上限は \`scripts/bundle-budget.json\` で、意図した増加なら同じPRで引き上げてください。`,
      '',
    );
  return { lines, over };
}

if (values.budget === undefined || values['bundle-head'] === undefined) throw new Error('--budgetと--bundle-headの指定が要る');
const bundle = bundleSection(values.budget, values['bundle-base'], values['bundle-head']);
console.log(['## 性能の予算', '', ...bundle.lines, ...benchSection(values['bench-base'], values['bench-head'])].join('\n'));
for (const message of bundle.over) console.error(`::error title=バンドルサイズの上限::${message}`);
if (bundle.over.length > 0) process.exitCode = 1;
