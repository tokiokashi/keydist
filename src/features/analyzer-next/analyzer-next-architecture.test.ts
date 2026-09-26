import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = join(ROOT, 'src');
const VIEW_DIR = join(SRC, 'features', 'analyzer-next', 'views');
const FORBIDDEN_APP_MODULES = new Set([
  join(SRC, 'trace', 'evaluate.ts'),
  join(SRC, 'engine', 'condition-resolution.ts'),
  join(SRC, 'legacy', 'analyzer-ui-state-owner.ts'),
]);
const HOST_ONLY_ANALYZER_MODULES = new Set([
  join(SRC, 'features', 'analyzer-next', 'session-store.ts'),
  join(SRC, 'features', 'analyzer-next', 'snapshot-service.ts'),
  join(SRC, 'features', 'analyzer-next', 'resolved-input.ts'),
  join(SRC, 'features', 'analyzer-next', 'snapshot-computation.ts'),
]);
const FORBIDDEN_PACKAGE_MODULES = new Set([
  '@tanstack/react-router',
  'dockview-react',
]);

const ANALYZER_APPLICATION_CORE = [
  join(SRC, 'features', 'analyzer-next', 'session-store.ts'),
  join(SRC, 'features', 'analyzer-next', 'resolved-input.ts'),
  join(SRC, 'features', 'analyzer-next', 'snapshot-service.ts'),
  join(SRC, 'features', 'analyzer-next', 'snapshot-computation.ts'),
  join(SRC, 'features', 'analyzer-next', 'snapshot-reader.ts'),
] as const;

const APPLICATION_FORBIDDEN_IMPORT_PATTERNS = [
  /^react(?:\/|$)/,
  /^react-dom(?:\/|$)/,
  /^@tanstack\/react-router(?:\/|$)/,
  /^dockview-react(?:\/|$)/,
  /(?:^|\/)persistence(?:\/|$)/,
] as const;

const APPLICATION_PLATFORM_GLOBAL_PATTERNS = [
  /\b(?:window|document|navigator|localStorage|sessionStorage)\b/,
  /\b(?:Window|Document|Navigator|HTMLElement|KeyboardEvent|MutationObserver|ResizeObserver)\b/,
] as const;

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
  if (
    specifier === '#trace/evaluate.ts'
    || specifier === '#engine/condition-resolution.ts'
    || specifier === '#legacy/analyzer-ui-state-owner.ts'
  ) return specifier;
  if (specifier.startsWith('#platform/') || specifier === '#app/state/app-state-storage.ts') {
    return 'storage/platform';
  }
  if (specifier === '@tanstack/react-router' || specifier.startsWith('@tanstack/react-router/')) {
    return 'TanStack Router';
  }
  if (specifier === 'dockview-react' || specifier.startsWith('dockview-react/')) {
    return 'Dockview';
  }

  const target = resolvesTo(importer, specifier);
  if (!target) return undefined;
  if (FORBIDDEN_APP_MODULES.has(target)) return relative(ROOT, target);
  const isContractTypeModule = importer === join(VIEW_DIR, 'view-contract.ts');
  if (!isContractTypeModule && HOST_ONLY_ANALYZER_MODULES.has(target)) {
    return relative(ROOT, target);
  }
  if (target.includes(`${join('src', 'platform')}${String.raw`/`}`)
    || target.includes(`${join('src', 'platform')}\\`)) {
    return 'src/platform';
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

test('Analyzer Next application core stays framework, router, storage and browser independent', async () => {
  for (const path of ANALYZER_APPLICATION_CORE) {
    const source = await readFile(path, 'utf8');

    for (const specifier of moduleSpecifiers(source)) {
      assert.equal(
        APPLICATION_FORBIDDEN_IMPORT_PATTERNS.some((pattern) => pattern.test(specifier)),
        false,
        `${relative(ROOT, path)} imports application/platform module: ${specifier}`,
      );
    }

    for (const pattern of APPLICATION_PLATFORM_GLOBAL_PATTERNS) {
      assert.doesNotMatch(
        source,
        pattern,
        `${relative(ROOT, path)} must stay independent from browser/storage globals`,
      );
    }
  }
});
