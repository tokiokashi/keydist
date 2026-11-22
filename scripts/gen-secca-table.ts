// 雪華の出典の写し（`test/fixtures/sources/secca/`）から、組み込みの表（`src/input/layouts/tables/secca.json`）を作り直す。
// 使い方: node --experimental-strip-types scripts/gen-secca-table.ts [--report]
//   --report: 使わなかった行を理由別に標準出力へ出す。
import { readFileSync, writeFileSync } from 'node:fs';
import { buildSeccaTable, SECCA_COMPOSE_FILES } from './secca-table.ts';

const SOURCES = new URL('../test/fixtures/sources/secca/', import.meta.url);
const OUTPUT = new URL('../src/input/layouts/tables/secca.json', import.meta.url);

export function readSeccaSources(): { config: string; compose: Record<string, string> } {
  const compose: Record<string, string> = {};
  for (const file of SECCA_COMPOSE_FILES) compose[file] = readFileSync(new URL(file, SOURCES), 'utf8');
  return { config: readFileSync(new URL('config.kbd', SOURCES), 'utf8'), compose };
}

if (import.meta.main) {
  const sources = readSeccaSources();
  const { table, skipped, counts } = buildSeccaTable(sources.config, sources.compose);
  writeFileSync(OUTPUT, `${JSON.stringify(table)}\n`);
  console.log(JSON.stringify(counts));
  const byReason = new Map<string, number>();
  for (const { reason } of skipped) byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  console.log([...byReason].map(([reason, count]) => `${reason}: ${count}`).join(', '));
  if (process.argv.includes('--report')) {
    for (const { row, reason } of skipped) console.log(`${reason}\t${row.file}:${row.line}\t${row.symbols.join(' ')}\t${row.output}`);
  }
}
