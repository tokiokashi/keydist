import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const VIEW_DIR = join(ROOT, 'src', 'features', 'analyzer-next', 'views');

async function viewFiles(): Promise<string[]> {
  try {
    return (await readdir(VIEW_DIR))
      .filter((name) => /\.tsx?$/.test(name))
      .map((name) => join(VIEW_DIR, name));
  } catch {
    return [];
  }
}

test('Analyzer Next View components do not own storage, routing, Dockview or evaluation', async () => {
  for (const path of await viewFiles()) {
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
