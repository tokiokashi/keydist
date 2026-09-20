import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYOUTS, LAYOUTS_JA } from '../src/layouts/index.ts';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'src');

async function tsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
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
    for (const match of source.matchAll(pattern)) specs.add(match[1]);
  }
  return [...specs];
}

async function structuralAnalysisSources() {
  const paths = (await tsFiles(SRC))
    .filter((path) => /^analysis-.*\.ts$/.test(path.split(/[\\/]/).at(-1) ?? ''));
  return Promise.all(paths.map(async (path) => ({
    path,
    source: await readFile(path, 'utf8'),
  })));
}

test('structural analysisのimport先をsemantic / structural layerへ限定する', async () => {
  const allowedModule = (specifier: string) =>
    specifier === './geometry.ts'
    || specifier === './evaluate.ts'
    || specifier === './trigger-realization.ts'
    || specifier === './core/semantic-input/action-realization.ts'
    || /^\.\/analysis-[^/]+\.ts$/.test(specifier);

  for (const { path, source } of await structuralAnalysisSources()) {
    for (const specifier of moduleSpecifiers(source)) {
      assert.equal(
        allowedModule(specifier),
        true,
        `${relative(ROOT, path)} imports outside the allowed analysis dependency layer: ${specifier}`,
      );
    }
  }
});

test('Face semanticをpresentation roleやtrigger数から推測しない', async () => {
  const layoutTypes = await readFile(join(SRC, 'layouts', 'types.ts'), 'utf8');
  const layers = await readFile(join(SRC, 'layers.ts'), 'utf8');

  assert.doesNotMatch(
    layoutTypes,
    /inputRole\s*\?\?/,
    'fromFaces must not infer canonical inputRole from presentation metadata',
  );
  assert.doesNotMatch(
    layoutTypes,
    /trigger\.length\s*>\s*1[^\n]*composition/,
    'fromFaces must not infer composition from trigger count',
  );
  assert.doesNotMatch(
    layers,
    /inputRole[^\n]*\|\|[^\n]*trigger\.length\s*>\s*1/,
    'presentation grouping must not infer combo from trigger count',
  );
});

test('evaluate realized factはFace authoring metadataへ依存しない', async () => {
  const source = await readFile(join(SRC, 'evaluate.ts'), 'utf8');

  assert.doesNotMatch(
    source,
    /layout\.faces\b/,
    'evaluate.ts must not derive realized facts from Layout.faces',
  );
  assert.doesNotMatch(
    source,
    /\bfaceLayerIds\b/,
    'evaluate.ts must not derive realized facts from presentation faceLayerIds',
  );
});

test('results viewはFaceからaggregation layerIdを再推測しない', async () => {
  const source = await readFile(join(SRC, 'results-view.ts'), 'utf8');

  assert.doesNotMatch(
    source,
    /face\.inputRole\s*===\s*['"]composition['"]/,
    'results-view must use faceLayerIds instead of inputRole to derive aggregation layerId',
  );
  assert.doesNotMatch(
    source,
    /face\.layer\s*===\s*undefined\s*\?\s*`face:/,
    'results-view must not reconstruct face:<index> aggregation ids',
  );
});

test('Strokeはlegacy Face semanticを再投影しない', async () => {
  const path = join(SRC, 'evaluate.ts');
  const source = await readFile(path, 'utf8');

  for (const symbol of ['InputRole', 'inputRole', 'TriggerPersistence', 'triggerPersistence']) {
    assert.equal(
      source.includes(symbol),
      false,
      `evaluate.ts must not project legacy Face semantic onto Stroke: ${symbol}`,
    );
  }
});

test('Metricsはlegacy inputRoleへ依存しない', async () => {
  const path = join(SRC, 'metrics.ts');
  const source = await readFile(path, 'utf8');

  assert.doesNotMatch(
    source,
    /\binputRole\b/,
    'metrics.ts must use canonical / realized facts instead of legacy inputRole',
  );
});

test('PlaybackCalibrationはstructural analysisへ依存しない', async () => {
  const path = join(SRC, 'playback-calibration.ts');
  const source = await readFile(path, 'utf8');
  const structuralImports = moduleSpecifiers(source)
    .filter((specifier) => /(?:^|\/)analysis-/.test(specifier));

  assert.deepEqual(structuralImports, []);
});

test('structural analysisはbuilt-in layoutのID/nameへ依存しない', async () => {
  const builtInLayoutLiterals = new Set(
    [...LAYOUTS, ...LAYOUTS_JA]
      .flatMap((layout) => [layout.id, layout.name]),
  );

  for (const { path, source } of await structuralAnalysisSources()) {
    for (const specifier of moduleSpecifiers(source)) {
      assert.equal(
        specifier.startsWith('./layouts/'),
        false,
        `${relative(ROOT, path)} must not import layout authoring modules: ${specifier}`,
      );
    }

    assert.doesNotMatch(
      source,
      /\binputRole\b/,
      `${relative(ROOT, path)} must not depend on legacy inputRole`,
    );

    assert.doesNotMatch(
      source,
      /\blayout(?:Id|Name)\b|\blayout\s*\.\s*(?:id|name)\b/,
      `${relative(ROOT, path)} must not branch on layout ID/name`,
    );

    const stringLiterals = new Set([
      ...source.matchAll(/'([^'\r\n]+)'/g),
      ...source.matchAll(/"([^"\r\n]+)"/g),
      ...source.matchAll(/`([^`\r\n]+)`/g),
    ].map((match) => match[1]));
    for (const literal of builtInLayoutLiterals) {
      assert.equal(
        stringLiterals.has(literal),
        false,
        `${relative(ROOT, path)} must not hard-code built-in layout ID/name: ${literal}`,
      );
    }
  }
});

test('廃止済み#200 legacy symbol / production helperをsrcへ再導入しない', async () => {
  const forbiddenEverywhere = [
    'leadDelayMs',
    'playbackArpeggioSpans',
    'ARPEGGIO_PRESETS',
    'TriggerBehavior',
    'chord-trigger',
    'one-shot-trigger',
    'minHorizontalSpread',
    'maxRowReversal',
    'maxRowStep',
    'HoldStartActionPolicy',
    'holdStartAction',
    'countAsSeparateStep',
  ] as const;
  const migrationOnly = [
    'arpeggioEnabled',
    'arpeggioDelayMode',
  ] as const;

  for (const path of await tsFiles(SRC)) {
    const source = await readFile(path, 'utf8');
    const relativePath = relative(SRC, path).replaceAll('\\', '/');

    for (const symbol of forbiddenEverywhere) {
      assert.equal(
        source.includes(symbol),
        false,
        `${relative(ROOT, path)} reintroduced legacy symbol: ${symbol}`,
      );
    }

    if (relativePath !== 'ui-state.ts') {
      for (const symbol of migrationOnly) {
        assert.equal(
          source.includes(symbol),
          false,
          `${relative(ROOT, path)} reintroduced migration-only symbol: ${symbol}`,
        );
      }
    }
  }

  const uiState = await readFile(join(SRC, 'ui-state.ts'), 'utf8');
  for (const symbol of migrationOnly) {
    const occurrencePattern = new RegExp(symbol, 'g');
    const detectionPattern = new RegExp(
      `['"]${symbol}['"]\\s+in\\s+(?:override)?playback\\b`,
      'gi',
    );
    const allowedRanges = [...uiState.matchAll(detectionPattern)].map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
    }));

    for (const occurrence of uiState.matchAll(occurrencePattern)) {
      const index = occurrence.index;
      assert.equal(
        allowedRanges.some((range) => range.start <= index && index < range.end),
        true,
        `ui-state.ts may reference ${symbol} only as legacy state detection`,
      );
    }
  }

  const sourcePaths = (await tsFiles(SRC)).map((path) => relative(SRC, path).replaceAll('\\', '/'));
  assert.equal(sourcePaths.includes('playback-arpeggio.ts'), false);
  assert.equal(sourcePaths.includes('hold-start-action.ts'), false);
});
