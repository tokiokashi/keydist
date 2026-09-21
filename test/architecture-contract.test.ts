import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYOUTS, LAYOUTS_JA } from '../src/layouts/index.ts';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'src');

const PLATFORM_GLOBAL_PATTERNS = [
  /\b(?:window|document|navigator|localStorage|sessionStorage)\s*\./,
  /\btypeof\s+(?:window|document|navigator)\b/,
  /\b(?:Window|Document|Navigator|HTMLElement|KeyboardEvent|MutationObserver|ResizeObserver)\b/,
  /\b(?:D1Database|KVNamespace|R2Bucket|DurableObject)\b/,
] as const;

const FRAMEWORK_MODULE_PATTERNS = [
  /^react(?:\/|$)/,
  /^react-dom(?:\/|$)/,
  /^@tanstack\//,
  /^@cloudflare\//,
  /^cloudflare:/,
] as const;

async function tsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  }));
  return nested.flat();
}

async function tsOrTsxFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsOrTsxFiles(path);
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

async function inputConverterCoreSources() {
  const paths = await tsFiles(join(SRC, 'core', 'input-converter'));
  return Promise.all(paths.map(async (path) => ({
    path,
    source: await readFile(path, 'utf8'),
  })));
}

function isAllowedInputConverterCoreModule(specifier: string): boolean {
  return /^\.\/[^/]+\.ts$/.test(specifier)
    || specifier === '../semantic-input/index.ts'
    || specifier === '../../geometry.ts';
}

function isAllowedStructuralAnalysisModule(specifier: string): boolean {
  return specifier === './geometry.ts'
    || specifier === './evaluate.ts'
    || specifier === './core/semantic-input/index.ts'
    || /^\.\/analysis-[^/]+\.ts$/.test(specifier);
}

function isAllowedSemanticCoreModule(specifier: string): boolean {
  return /^\.\/[^/]+\.ts$/.test(specifier)
    || specifier === '../../geometry.ts'
    || specifier === '../../layouts/types.ts';
}

const LEGACY_TRIGGER_REALIZATION_MODULE = join(SRC, 'trigger-realization.ts');
const REALIZATION_INTERNAL_MODULES = new Set([
  join(SRC, 'core', 'semantic-input', 'trigger-realization.ts'),
  join(SRC, 'core', 'semantic-input', 'action-realization.ts'),
]);

function resolveRelativeModule(importerPath: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  return resolve(dirname(importerPath), specifier);
}

function isForbiddenRealizationConsumerImport(
  importerPath: string,
  specifier: string,
): boolean {
  const target = resolveRelativeModule(importerPath, specifier);
  if (target === undefined) return false;
  return target === LEGACY_TRIGGER_REALIZATION_MODULE
    || REALIZATION_INTERNAL_MODULES.has(target);
}

test('core全体はframework / browser / Cloudflare platformへ依存しない', async () => {
  const corePaths = await tsOrTsxFiles(join(SRC, 'core'));
  assert.ok(corePaths.length > 0, 'core source must exist');

  for (const path of corePaths) {
    const source = await readFile(path, 'utf8');
    for (const specifier of moduleSpecifiers(source)) {
      assert.equal(
        FRAMEWORK_MODULE_PATTERNS.some((pattern) => pattern.test(specifier)),
        false,
        `${relative(ROOT, path)} imports app/framework/platform module: ${specifier}`,
      );
    }
    for (const pattern of PLATFORM_GLOBAL_PATTERNS) {
      assert.doesNotMatch(
        source,
        pattern,
        `${relative(ROOT, path)} must stay independent from browser / Cloudflare platform globals`,
      );
    }
  }
});

test('structural analysisのimport先をsemantic / structural layerへ限定する', async () => {
  for (const { path, source } of await structuralAnalysisSources()) {
    for (const specifier of moduleSpecifiers(source)) {
      assert.equal(
        isAllowedStructuralAnalysisModule(specifier),
        true,
        `${relative(ROOT, path)} imports outside the allowed analysis dependency layer: ${specifier}`,
      );
    }
  }
});

test('realization policy consumerはsemantic core public entryをauthorityにする', async () => {
  const rootFiles = await readdir(SRC);
  assert.equal(
    rootFiles.includes('trigger-realization.ts'),
    false,
    'legacy root trigger-realization re-export must not return',
  );

  const nestedConsumer = join(SRC, 'feature', 'nested-consumer.ts');
  assert.equal(
    isForbiddenRealizationConsumerImport(
      nestedConsumer,
      '../core/semantic-input/action-realization.ts',
    ),
    true,
    'nested consumer must not bypass the semantic core public entry',
  );
  assert.equal(
    isForbiddenRealizationConsumerImport(
      nestedConsumer,
      '../core/semantic-input/trigger-realization.ts',
    ),
    true,
    'nested consumer must not import trigger realization internals directly',
  );

  for (const path of await tsFiles(SRC)) {
    if (path.includes(join('core', 'semantic-input'))) continue;
    const source = await readFile(path, 'utf8');
    for (const specifier of moduleSpecifiers(source)) {
      assert.equal(
        isForbiddenRealizationConsumerImport(path, specifier),
        false,
        `${relative(ROOT, path)} must use src/core/semantic-input/index.ts for realization policy APIs: ${specifier}`,
      );
    }
  }
});

test('Input Converter coreはSemanticInput public APIを再利用しframework / DOMへ依存しない', async () => {
  const sources = await inputConverterCoreSources();

  assert.ok(sources.length > 0, 'input converter core source must exist');
  for (const { path, source } of sources) {
    for (const specifier of moduleSpecifiers(source)) {
      assert.equal(
        isAllowedInputConverterCoreModule(specifier),
        true,
        `${relative(ROOT, path)} imports outside input-converter core boundary: ${specifier}`,
      );
    }
    for (const pattern of PLATFORM_GLOBAL_PATTERNS) {
      assert.doesNotMatch(
        source,
        pattern,
        `${relative(ROOT, path)} must stay independent from browser / Cloudflare platform globals`,
      );
    }
  }

  const engineSource = await readFile(
    join(SRC, 'core', 'input-converter', 'typing-input-engine.ts'),
    'utf8',
  );
  assert.match(
    engineSource,
    /from ['"]\.\.\/semantic-input\/index\.ts['"]/,
    'Input Converter must reuse the SemanticInput / realization public entry',
  );
  assert.doesNotMatch(
    engineSource,
    /layouts\//,
    'Input Converter core must not reinterpret Layout Face authoring metadata',
  );
});

test('canonical semantic / structural analysis coreはframework / platform APIへ依存しない', async () => {
  const semanticCorePaths = await tsFiles(join(SRC, 'core', 'semantic-input'));
  const semanticSources = await Promise.all(semanticCorePaths.map(async (path) => ({
    path,
    source: await readFile(path, 'utf8'),
  })));
  const analysisSources = await structuralAnalysisSources();

  assert.equal(isAllowedSemanticCoreModule('../../results-view.ts'), false);
  assert.equal(isAllowedSemanticCoreModule('./../../results-view.ts'), false);

  for (const { path, source } of semanticSources) {
    for (const specifier of moduleSpecifiers(source)) {
      assert.equal(
        isAllowedSemanticCoreModule(specifier),
        true,
        `${relative(ROOT, path)} imports outside the allowed semantic-core dependency layer: ${specifier}`,
      );
    }
  }
  for (const { path, source } of analysisSources) {
    for (const specifier of moduleSpecifiers(source)) {
      assert.equal(
        isAllowedStructuralAnalysisModule(specifier),
        true,
        `${relative(ROOT, path)} imports outside the allowed analysis dependency layer: ${specifier}`,
      );
    }
  }


  for (const { path, source } of [...semanticSources, ...analysisSources]) {
    for (const pattern of PLATFORM_GLOBAL_PATTERNS) {
      assert.doesNotMatch(
        source,
        pattern,
        `${relative(ROOT, path)} must stay independent from browser / Cloudflare platform globals`,
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

test('alternative selection identityはcore helperをauthorityにする', async () => {
  const evaluateSource = await readFile(join(SRC, 'evaluate.ts'), 'utf8');
  const compilerSource = await readFile(join(SRC, 'core/semantic-input/compiler.ts'), 'utf8');
  const selectionStart = compilerSource.indexOf('export function inputAlternativeSelectionIdentity');
  const selectionEnd = compilerSource.indexOf('\n}', selectionStart);
  const thumbStart = evaluateSource.indexOf('function thumbVariantSignature');
  const thumbEnd = evaluateSource.indexOf('function selectInputAlternative', thumbStart);

  assert.match(
    evaluateSource,
    /inputAlternativeSelectionIdentity\(/,
    'evaluate must use the canonical selection identity helper instead of reserializing alternatives',
  );
  assert.notEqual(selectionStart, -1);
  assert.notEqual(selectionEnd, -1);
  const identitySource = compilerSource.slice(selectionStart, selectionEnd + 2);
  assert.match(identitySource, /includeFaceMemberships:\s*false/);

  assert.notEqual(thumbStart, -1);
  assert.notEqual(thumbEnd, -1);
  const thumbSource = evaluateSource.slice(thumbStart, thumbEnd);
  for (const pattern of [
    /JSON\.stringify/,
    /\.semanticInputs\b/,
    /\.baseRealizations\b/,
  ]) {
    assert.doesNotMatch(
      thumbSource,
      pattern,
      'thumb policy must only provide the physical-key projection to the core selection identity helper',
    );
  }
});

test('user layout alternative dedupeはcore canonical identityをauthorityにする', async () => {
  const source = await readFile(join(SRC, 'user-layouts.ts'), 'utf8');

  assert.match(
    source,
    /canonicalInputAlternativeIdentity\(/,
    'user layout import must reuse the canonical alternative identity helper',
  );
  assert.doesNotMatch(
    source,
    /JSON\.stringify\([^\n]*baseRealizations|baseRealizations[^\n]*JSON\.stringify/,
    'user layout import must not dedupe alternatives by reserializing only action realizations',
  );
});

test('legacy comboConditionsをsemantic/runtime authorityへ戻さない', async () => {
  const layoutTypesSource = await readFile(join(SRC, 'layouts/types.ts'), 'utf8');
  const evaluateSource = await readFile(join(SRC, 'evaluate.ts'), 'utf8');

  assert.doesNotMatch(layoutTypesSource, /\bcomboConditions\b/);
  assert.doesNotMatch(evaluateSource, /\bcomboConditions\b/);
  assert.match(
    evaluateSource,
    /const comboDefinitions = resolvedComboDefinitions\.length/,
    'resolved combo definitions must be the combo definition-count authority',
  );
});

test('combo fold presentation provenanceはcanonicalInputsをauthorityにする', async () => {
  const source = await readFile(join(SRC, 'layouts/types.ts'), 'utf8');
  const start = source.indexOf('export function withCombos');
  const end = source.indexOf('\n}', start);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const comboSource = source.slice(start, end + 2);

  assert.match(comboSource, /layout\.canonicalInputs\.get\(input\)/);
  assert.doesNotMatch(
    comboSource,
    /layout\.map\.get\(/,
    'combo presentation provenance must not resolve physical keys from the legacy default map',
  );
});

test('composed outputのsemantic availabilityはcanonicalInputsをauthorityにする', async () => {
  const source = await readFile(join(SRC, 'layouts/types.ts'), 'utf8');
  const start = source.indexOf('export function withComposedOutputs');
  const end = source.indexOf('/** ローマ字テーブルを付ける。', start);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const composedSource = source.slice(start, end);

  assert.match(composedSource, /const markAlternatives = layout\.canonicalInputs\.get\(mark\)/);
  assert.match(composedSource, /const sourceAlternatives = layout\.canonicalInputs\.get\(source\)/);
  assert.doesNotMatch(
    composedSource,
    /if \(!markSequence \|\| !markAlternatives\)/,
    'legacy map sequence must not gate canonical mark availability',
  );
  assert.doesNotMatch(
    composedSource,
    /if \(!sourceSequence \|\| !sourceAlternatives\)/,
    'legacy map sequence must not gate canonical source availability',
  );
});

test('CanonicalInputMap validationはempty alternative setを許可しない', async () => {
  const source = await readFile(join(SRC, 'core/semantic-input/compiler.ts'), 'utf8');
  const start = source.indexOf('export function validateCanonicalInputMap');
  const end = source.indexOf('\n}\n\n\ntype AlternativeIdentityProjection', start);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const validationSource = source.slice(start, end + 2);
  assert.match(validationSource, /alternatives\.length === 0/);
  assert.match(validationSource, /1つ以上のalternativeが必要/);
});

test('logical output matching lengthはcanonicalInputsをauthorityにする', async () => {
  const evaluateSource = await readFile(join(SRC, 'evaluate.ts'), 'utf8');
  const layoutTypesSource = await readFile(join(SRC, 'layouts/types.ts'), 'utf8');
  const userLayoutsSource = await readFile(join(SRC, 'user-layouts.ts'), 'utf8');

  assert.doesNotMatch(layoutTypesSource, /\bmaxCharLength\b/);
  assert.doesNotMatch(userLayoutsSource, /\bmaxCharLength\b/);
  assert.doesNotMatch(
    evaluateSource,
    /layout\.maxCharLength\b/,
    'evaluate must derive the longest-match bound from canonicalInputs',
  );
  assert.match(
    evaluateSource,
    /layout\.canonicalInputs\.keys\(\)/,
    'canonicalInputs must be the authority for logical output match length',
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
