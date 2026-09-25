import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'src');
const VIEW_DIR = join(SRC, 'features', 'analyzer-next', 'views');
const FORBIDDEN_APP_MODULES = new Set([
  join(SRC, 'evaluate.ts'),
  join(SRC, 'condition-resolution.ts'),
  join(SRC, 'analyzer-ui-state-owner.ts'),
]);
const FORBIDDEN_PACKAGE_MODULES = new Set([
  '@tanstack/react-router',
  'dockview-react',
]);

async function viewFiles(dir = VIEW_DIR): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return viewFiles(path);
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

function moduleSpecifiers(source: string): readonly string[] {
  const specs = new Set<string>();
  for (const pattern of [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]) {
    for (const match of source.matchAll(pattern)) specs.add(match[1]!);
  }
  return [...specs];
}

function resolvesTo(importer: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  return resolve(dirname(importer), specifier);
}

function forbiddenReason(importer: string, specifier: string): string | undefined {
  if (FORBIDDEN_PACKAGE_MODULES.has(specifier)) return specifier;
  if (specifier === '@tanstack/react-router' || specifier.startsWith('@tanstack/react-router/')) {
    return 'TanStack Router';
  }
  if (specifier === 'dockview-react' || specifier.startsWith('dockview-react/')) {
    return 'Dockview';
  }

  const target = resolvesTo(importer, specifier);
  if (!target) return undefined;
  if (FORBIDDEN_APP_MODULES.has(target)) return relative(ROOT, target);
  if (target.includes(`${join('src', 'persistence')}${String.raw`/`}`)
    || target.includes(`${join('src', 'persistence')}\\`)) {
    return 'src/persistence';
  }
  if (/analyzer-ui-state-owner\.tsx?$/.test(target)) return 'AnalyzerUiStateOwner';
  return undefined;
}

test('Analyzer Next View components do not own storage, routing, Dockview or evaluation', async () => {
  const paths = await viewFiles();
  assert.ok(paths.length > 0, 'Analyzer Next views boundary must contain inspectable source files');

  for (const path of paths) {
    const source = await readFile(path, 'utf8');
    assert.doesNotMatch(
      source,
      /\b(?:localStorage|sessionStorage)\b/,
      `${relative(ROOT, path)} must not access browser storage directly`,
    );

    for (const specifier of moduleSpecifiers(source)) {
      const reason = forbiddenReason(path, specifier);
      assert.equal(
        reason,
        undefined,
        `${relative(ROOT, path)} must not import ${reason ?? specifier}: ${specifier}`,
      );
    }

    assert.doesNotMatch(
      source,
      /\b(?:resolveConditions|evaluate)\s*\(/,
      `${relative(ROOT, path)} must consume host-resolved snapshots`,
    );
  }
});
