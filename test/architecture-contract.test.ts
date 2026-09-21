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

test('alternative selectionはpresentation provenanceをpath identityに使わない', async () => {
  const source = await readFile(join(SRC, 'evaluate.ts'), 'utf8');
  const start = source.indexOf('function thumbVariantSignature');
  const end = source.indexOf('function selectInputAlternative', start);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const signatureSource = source.slice(start, end);
  assert.doesNotMatch(
    signatureSource,
    /\bfaceMemberships\b/,
    'thumb alternative selection must ignore Face presentation provenance',
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

test('Face authoring validationはruntime presentation moduleへ依存しない', async () => {
  const validationSource = await readFile(join(SRC, 'layouts/face-authoring-validation.ts'), 'utf8');
  const geometrySource = await readFile(join(SRC, 'layouts/face-geometry.ts'), 'utf8');

  assert.doesNotMatch(
    validationSource,
    /\.\.\/layers\.ts/,
    'authoring validation must depend on neutral Face geometry helpers, not runtime layers.ts',
  );
  assert.match(validationSource, /\.\/face-geometry\.ts/);
  assert.doesNotMatch(
    geometrySource,
    /layers\.ts/,
    'neutral Face geometry helpers must not depend on runtime presentation',
  );
});

test('runtime layers moduleはFace authoring semanticを解釈しない', async () => {
  const source = await readFile(join(SRC, 'layers.ts'), 'utf8');

  for (const pattern of [
    /\binputRole\b/,
    /face\.mode\b/,
    /face\.triggerOrder\b/,
    /face\.layer\b/,
    /face\.role\b/,
    /\bcanFoldFaces\b/,
    /\bclassifyFaces\b/,
    /\bgroupFacesIntoLayers\b/,
  ]) {
    assert.doesNotMatch(
      source,
      pattern,
      'runtime layers.ts must only consume compiled presentation attribution',
    );
  }
  assert.match(
    source,
    /definition\.presentationRole/,
    'runtime layers.ts must consume compiled LayerDefinition.presentationRole',
  );
});

test('layouts barrelはlegacy Face authoring classifierを公開しない', async () => {
  const source = await readFile(join(SRC, 'layouts/index.ts'), 'utf8');

  for (const symbol of ['canFoldFaces', 'classifyFaces', 'groupFacesIntoLayers']) {
    assert.equal(
      source.includes(symbol),
      false,
      `layouts/index.ts must not export legacy authoring classifier: ${symbol}`,
    );
  }
});

test('results viewはFace semantic authoring metadataへ依存しない', async () => {
  const source = await readFile(join(SRC, 'results-view.ts'), 'utf8');

  assert.doesNotMatch(
    source,
    /\binputRole\b/,
    'results-view must not read or synthesize legacy Face inputRole',
  );
  assert.doesNotMatch(
    source,
    /\btriggerPersistence\b/,
    'results-view must not read or synthesize legacy Face triggerPersistence',
  );
  assert.doesNotMatch(
    source,
    /face\.mode\b/,
    'results-view must use compiled layer presentation metadata instead of FaceMode',
  );
  assert.doesNotMatch(
    source,
    /face\.layer\s*===\s*undefined\s*\?\s*`face:/,
    'results-view must not reconstruct face:<index> aggregation ids',
  );
  assert.doesNotMatch(
    source,
    /\bclassifyFaces\b/,
    'results-view must use compiled presentation aggregation instead of authoring Face classification',
  );
  assert.doesNotMatch(
    source,
    /face\.layer\b/,
    'results-view must use layerDefinitions.label instead of Face.layer for aggregation labels',
  );
  assert.doesNotMatch(
    source,
    /\bfaceLayerIds\b|\blayerIdForFace\b/,
    'results-view must consume presentation Layer.id instead of reverse-looking-up Face attribution',
  );
  assert.doesNotMatch(
    source,
    /layer\.faces\.some\([^\n]*face\.trigger\.length\s*===\s*0/,
    'results-view must identify the base aggregation by Layer.id instead of trigger shape',
  );
  assert.doesNotMatch(
    source,
    /from\s+['"]\.\/layouts\/index\.ts['"]/,
    'results-view must not runtime-import the built-in layout registry barrel',
  );
});

test('presentation trigger authoringはnested alternative schemaを使う', async () => {
  const typesSource = await readFile(join(SRC, 'layouts/types.ts'), 'utf8');
  const layersSource = await readFile(join(SRC, 'layers.ts'), 'utf8');

  assert.doesNotMatch(typesSource, /presentationTriggerKeys/);
  assert.doesNotMatch(layersSource, /presentationTriggerKeys/);
  assert.match(
    typesSource,
    /PresentationTriggerChord = readonly \[string, \.\.\.string\[\]\]/,
  );
  assert.match(
    typesSource,
    /presentationTriggerAlternatives\?: PresentationTriggerAlternatives/,
  );
  assert.match(layersSource, /face\.presentationTriggerAlternatives/);
  assert.match(
    layersSource,
    /authored\.length === 0[\s\S]*presentationTriggerAlternativesは空にできない/,
  );
});

test('key pattern pickerの入力成立判定はcanonicalInputsをauthorityにする', async () => {
  const source = await readFile(join(SRC, 'key-pattern-picker.ts'), 'utf8');

  const matrixStart = source.indexOf('export function buildKeyPatternMatrix');
  const matrixEnd = source.indexOf('function exactAllowedByOrder', matrixStart);
  assert.ok(matrixStart >= 0 && matrixEnd > matrixStart, 'key pattern matrix section must remain discoverable');
  const matrixSource = source.slice(matrixStart, matrixEnd);

  assert.doesNotMatch(
    matrixSource,
    /layout\.map\b|layout\.faces\b|face\.mode\b|face\.triggerOrder\b|\bfaceCells\b/,
    'key-pattern matching must use canonicalInputs instead of reconstructing activation from authoring Face/map',
  );
  assert.match(
    matrixSource,
    /layout\.canonicalInputs/,
    'key-pattern matching must read canonicalInputs',
  );

  assert.doesNotMatch(
    source,
    /face\.inputRole\b/,
    'key-pattern picker must not use legacy inputRole for presentation layer membership',
  );
  assert.doesNotMatch(
    source,
    /\bfaceLayerIds\b/,
    'key-pattern picker must consume classifyPresentationFaces instead of raw faceLayerIds',
  );
  assert.doesNotMatch(
    source,
    /face\.trigger(?:\.length)?\b/,
    'active layer presentation attribution must not reinterpret semantic Face.trigger shape',
  );
  assert.match(
    source,
    /matchesDisplayTriggerAlternative\(face, selected\)/,
    'active layer attribution must use the shared presentation trigger matcher',
  );
});

test('presentation consumerはLayer.orderの共通helperを使う', async () => {
  const pickerSource = await readFile(join(SRC, 'key-pattern-picker.ts'), 'utf8');
  const resultsSource = await readFile(join(SRC, 'results-view.ts'), 'utf8');

  assert.match(pickerSource, /orderedPresentationLayers\(groups\)/);
  assert.match(resultsSource, /orderedPresentationLayers\(groups\)/);
  assert.doesNotMatch(
    pickerSource,
    /\[\.\.\.groups\.layers,\s*\.\.\.groups\.modifiers\]/,
    'picker must not give layer-role aggregations implicit priority over modifier-role aggregations',
  );

  const guideStart = resultsSource.indexOf('function pickerGuideColorMap');
  const guideEnd = resultsSource.indexOf('function heatIntensity', guideStart);
  assert.ok(guideStart >= 0 && guideEnd > guideStart, 'picker guide section must remain discoverable');
  const guideSource = resultsSource.slice(guideStart, guideEnd);
  assert.match(
    guideSource,
    /if \(!colors\.has\(key\)\) colors\.set\(key, stroke\)/,
    'picker guide must preserve the first Layer.order attribution for duplicate triggers',
  );
});

test('results presentationはraw Face.trigger textを再構成しない', async () => {
  const source = await readFile(join(SRC, 'results-view.ts'), 'utf8');

  assert.doesNotMatch(
    source,
    /face\.trigger\b/,
    'results presentation must use normalized display trigger alternatives',
  );
  assert.match(source, /displayTriggerText\(layout, face\)/);
});

test('results picker guideは明示presentation trigger / combo variantsを使う', async () => {
  const source = await readFile(join(SRC, 'results-view.ts'), 'utf8');
  const start = source.indexOf('function pickerGuideColorMap');
  const end = source.indexOf('function heatIntensity', start);
  assert.ok(start >= 0 && end > start, 'picker guide section must remain discoverable');
  const section = source.slice(start, end);

  assert.match(section, /displayTriggerKeys\(face\)/);
  assert.match(section, /combo\.keyVariants\s*\?\?\s*\[combo\.keys\]/);
  assert.doesNotMatch(
    section,
    /for \(const trigger of face\.trigger\)/,
    'picker guide must not ignore presentation trigger alternatives',
  );
});

test('key pattern pickerはlayouts registryをruntime importしない', async () => {
  const source = await readFile(join(SRC, 'key-pattern-picker.ts'), 'utf8');

  assert.doesNotMatch(
    source,
    /(?:from|import)\s+['"]\.\/layouts\/index\.ts['"]/,
    'key-pattern-picker must depend on layouts/types.ts instead of the built-in registry barrel',
  );
});

test('playbackはFace classificationからpresentation layer帰属を再構成しない', async () => {
  const source = await readFile(join(SRC, 'playback.ts'), 'utf8');

  assert.doesNotMatch(
    source,
    /\bclassifyFaces\b/,
    'playback must group presentation faces directly by faceLayerIds',
  );
  assert.doesNotMatch(
    source,
    /face\.inputRole\b/,
    'playback must not use legacy inputRole for presentation layer membership',
  );
  assert.doesNotMatch(
    source,
    /\bfaceLayerIds\b/,
    'playback must consume compiled presentation Layer.id instead of raw faceLayerIds',
  );
  assert.doesNotMatch(
    source,
    /face\.trigger\b/,
    'playback presentation matching must not reinterpret raw Face.trigger',
  );
  assert.match(
    source,
    /matchesDisplayTriggerAlternative\(face, triggerKeys\)/,
    'playback must match realized trigger keys through presentation alternatives',
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

test('SandS trigger presentationはlayout IDへ依存しない', async () => {
  const layersSource = await readFile(join(SRC, 'layers.ts'), 'utf8');
  assert.doesNotMatch(
    layersSource,
    /layout\.id\s*===/,
    'layers presentation helper must use explicit Face metadata instead of layout ID',
  );

  const resultsSource = await readFile(join(SRC, 'results-view.ts'), 'utf8');
  const start = resultsSource.indexOf('function displayTriggerText');
  const end = resultsSource.indexOf('interface LayerCell');
  assert.ok(start >= 0 && end > start, 'SandS presentation section must remain discoverable');
  const presentationSection = resultsSource.slice(start, end);
  assert.doesNotMatch(
    presentationSection,
    /naginata-v18|layout\.id/,
    'SandS presentation path must not infer built-in layout identity',
  );
  assert.doesNotMatch(
    presentationSection,
    /isNaginataCenterShift|displayLayerLegend/,
    'legacy SandS presentation inference helpers must not return',
  );
  assert.doesNotMatch(
    resultsSource,
    /naginata-v18|naginataDetail|data-naginata-layer-detail/,
    'results presentation must use explicit layout metadata instead of Naginata-specific branches/state',
  );
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
