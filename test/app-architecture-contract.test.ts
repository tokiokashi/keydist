import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CORE = join(ROOT, 'src', 'core');

const bannedImports = [
  /from\s+['"]react(?:\/|['"])/,
  /from\s+['"]react-dom(?:\/|['"])/,
  /from\s+['"]@tanstack\//,
  /from\s+['"]@cloudflare\//,
  /from\s+['"]cloudflare:/,
  /import\s+['"]react(?:\/|['"])/,
  /import\s+['"]react-dom(?:\/|['"])/,
  /import\s+['"]@tanstack\//,
  /import\s+['"]@cloudflare\//,
  /import\s+['"]cloudflare:/,
];

const bannedBrowserSymbols = [
  /\bwindow\s*\./,
  /\bdocument\s*\./,
  /\bHTMLElement\b/,
  /\bKeyboardEvent\b/,
  /\blocalStorage\b/,
];

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

test('core does not depend on app/framework/browser boundaries', async () => {
  const violations: string[] = [];

  for (const path of await sourceFiles(CORE)) {
    const source = await readFile(path, 'utf8');
    for (const pattern of [...bannedImports, ...bannedBrowserSymbols]) {
      if (pattern.test(source)) {
        violations.push(`${path.slice(ROOT.length + 1)}: ${pattern}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
