// サブエージェントのtranscriptから、入力側の使用量と金額を集計して1行ずつ出す。
// 使い方: node --experimental-strip-types scripts/agent-usage.ts <agent-id>...
// 出力tokensは、transcriptに各リクエストの最初の数tokens分しか記録されず実際より少なく出るので、金額に入れない。
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { extractRequests, formatSummary, summarize } from './agent-usage-core.ts';

function findTranscript(id: string): string | null {
  const projects = join(homedir(), '.claude', 'projects');
  if (!existsSync(projects)) return null;
  for (const project of readdirSync(projects)) {
    const sessions = join(projects, project);
    for (const session of readdirSync(sessions, { withFileTypes: true })) {
      if (!session.isDirectory()) continue;
      const file = join(sessions, session.name, 'subagents', `agent-${id}.jsonl`);
      if (existsSync(file)) return file;
    }
  }
  return null;
}

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error('使い方: node --experimental-strip-types scripts/agent-usage.ts <agent-id>...');
  process.exit(2);
}
let failed = false;
for (const id of ids) {
  const file = findTranscript(id);
  if (file === null) {
    console.error(`${id}: transcriptが見つからない（~/.claude/projects/*/*/subagents/agent-${id}.jsonl）`);
    failed = true;
    continue;
  }
  console.log(`${id}: ${formatSummary(summarize(extractRequests(readFileSync(file, 'utf8'))))}`);
}
if (failed) process.exit(1);
