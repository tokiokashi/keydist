import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const VIEW_DIR = join(ROOT, 'src', 'features', 'analyzer-next', 'views');

async function viewFiles(dir = VIEW_DIR): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return viewFiles(path);
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

test('Analyzer Next View components do not own storage, routing, Dockview or evaluation', async () => {
  const paths = await viewFiles();
  assert.ok(paths.length > 0, 'Analyzer Next views boundary must contain inspectable source files');

  for (const path of paths) {
    const source = await readFile(path, 'utf8');
    for (const forbidden of [
      'localStorage',
      'sessionStorage',
      '@tanstack/react-router',
      'dockview-react',
      'resolveConditions',
      "from '../../../evaluate.ts'",
      "from '../../evaluate.ts'",
    ]) {
      assert.equal(
        source.includes(forbidden),
        false,
        `${path} must not depend on ${forbidden}`,
      );
    }
  }
});
