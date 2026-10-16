import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYOUTS, LAYOUTS_JA } from '#input/layouts/index.ts';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'src');

async function tsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  }));
  return nested.flat();
}

async function sourceFilesIn(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFilesIn(path);
    return entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
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

async function sourcesIn(...segments: string[]) {
  const paths = await tsFiles(join(SRC, ...segments));
  return Promise.all(paths.map(async (path) => ({
    path,
    source: await readFile(path, 'utf8'),
  })));
}

// 以下3つは architecture-layers.test.ts の層の表より細かい、層の中の制限。
// 層の表は input 内・interpretation 内の import を全部許すので、ここで別に絞る。

function isAllowedInputConverterCoreModule(specifier: string): boolean {
  return /^\.\/[^/]+\.ts$/.test(specifier)
    || specifier === '#input/semantics/index.ts'
    || specifier === '#input/shapes/geometry.ts';
}

function isAllowedStructuralAnalysisModule(specifier: string): boolean {
  return /^\.\/[^/]+\.ts$/.test(specifier)
    || specifier.startsWith('#input/semantics/')
    || specifier.startsWith('#input/shapes/')
    || specifier.startsWith('#trace/')
    || specifier.startsWith('#interpretation/structure/');
}

function isAllowedSemanticCoreModule(specifier: string): boolean {
  return /^\.\/[^/]+\.ts$/.test(specifier)
    || specifier === '../shapes/geometry.ts'
    || specifier === '../layouts/types.ts'
    || specifier === '../layouts/index.ts';
}

const LEGACY_TRIGGER_REALIZATION_MODULE = join(SRC, 'trigger-realization.ts');
const REALIZATION_INTERNAL_MODULES = new Set([
  join(SRC, 'input', 'semantics', 'trigger-realization.ts'),
  join(SRC, 'input', 'semantics', 'action-realization.ts'),
]);

function resolveRelativeModule(importerPath: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  return resolve(dirname(importerPath), specifier);
}

function isForbiddenRealizationConsumerImport(
  importerPath: string,
  specifier: string,
): boolean {
  if (
    specifier === '#input/semantics/action-realization.ts'
    || specifier === '#input/semantics/trigger-realization.ts'
  ) return true;
  const target = resolveRelativeModule(importerPath, specifier);
  if (target === undefined) return false;
  return target === LEGACY_TRIGGER_REALIZATION_MODULE
    || REALIZATION_INTERNAL_MODULES.has(target);
}

test('semantic coreのimport先をshapes / layout型へ限定する', async () => {
  assert.equal(isAllowedSemanticCoreModule('../../results-view.ts'), false);
  assert.equal(isAllowedSemanticCoreModule('./../../results-view.ts'), false);

  for (const { path, source } of await sourcesIn('input', 'semantics')) {
    for (const specifier of moduleSpecifiers(source)) {
      assert.equal(
        isAllowedSemanticCoreModule(specifier),
        true,
        `${relative(ROOT, path)} imports outside the allowed semantic-core dependency layer: ${specifier}`,
      );
    }
  }
});

test('structural analysisのimport先をsemantic / structural layerへ限定する', async () => {
  for (const { path, source } of await sourcesIn('interpretation', 'structure')) {
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
      '#input/semantics/action-realization.ts',
    ),
    true,
    'nested consumer must not bypass the semantic core public entry',
  );
  assert.equal(
    isForbiddenRealizationConsumerImport(
      nestedConsumer,
      '#input/semantics/trigger-realization.ts',
    ),
    true,
    'nested consumer must not import trigger realization internals directly',
  );

  for (const path of await tsFiles(SRC)) {
    if (path.includes(join('input', 'semantics'))) continue;
    const source = await readFile(path, 'utf8');
    for (const specifier of moduleSpecifiers(source)) {
      assert.equal(
        isForbiddenRealizationConsumerImport(path, specifier),
        false,
        `${relative(ROOT, path)} must use src/input/semantics/index.ts for realization policy APIs: ${specifier}`,
      );
    }
  }
});

test('Input Converter coreはSemanticInput public APIを再利用する', async () => {
  const sources = await sourcesIn('tester', 'engine');
  assert.ok(sources.length > 0, 'input converter core source must exist');
  for (const { path, source } of sources) {
    for (const specifier of moduleSpecifiers(source)) {
      assert.equal(
        isAllowedInputConverterCoreModule(specifier),
        true,
        `${relative(ROOT, path)} imports outside input-converter core boundary: ${specifier}`,
      );
    }
  }

  const engineSource = await readFile(
    join(SRC, 'tester', 'engine', 'typing-input-engine.ts'),
    'utf8',
  );
  assert.match(
    engineSource,
    /from ['"]#input\/semantics\/index\.ts['"]/,
    'Input Converter must reuse the SemanticInput / realization public entry',
  );
  assert.doesNotMatch(
    engineSource,
    /layouts\//,
    'Input Converter core must not reinterpret Layout Face authoring metadata',
  );
});

test('Face semanticをpresentation roleやtrigger数から推測しない', async () => {
  const layoutTypes = await readFile(join(SRC, 'input', 'layouts', 'types.ts'), 'utf8');
  const layers = await readFile(join(SRC, 'input', 'layouts', 'layers.ts'), 'utf8');

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
  const traceSource = await readFile(join(SRC, 'trace', 'generate.ts'), 'utf8');
  const compilerSource = await readFile(join(SRC, 'input/semantics/compiler.ts'), 'utf8');
  const selectionStart = compilerSource.indexOf('export function inputAlternativeSelectionIdentity');
  const selectionEnd = compilerSource.indexOf('\n}', selectionStart);
  const thumbStart = traceSource.indexOf('function thumbVariantSignature');
  const thumbEnd = traceSource.indexOf('function shiftVariantSignature', thumbStart);
  const shiftStart = thumbEnd;
  const shiftEnd = traceSource.indexOf('function oppositeHandShiftScore', shiftStart);

  assert.match(
    traceSource,
    /inputAlternativeSelectionIdentity\(/,
    'generateTrace must use the canonical selection identity helper instead of reserializing alternatives',
  );
  assert.notEqual(selectionStart, -1);
  assert.notEqual(selectionEnd, -1);
  const identitySource = compilerSource.slice(selectionStart, selectionEnd + 2);
  assert.match(identitySource, /includeFaceMemberships:\s*false/);

  for (const [start, end, label] of [
    [thumbStart, thumbEnd, 'thumb'],
    [shiftStart, shiftEnd, 'shift'],
  ] as const) {
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);
    const projectionSource = traceSource.slice(start, end);
    for (const pattern of [
      /JSON\.stringify/,
      /\.semanticInputs\b/,
      /\.baseRealizations\b/,
    ]) {
      assert.doesNotMatch(
        projectionSource,
        pattern,
        `${label} variant projection must only provide the physical-key projection to the core selection identity helper`,
      );
    }
  }
});

test('user layout alternative dedupeはcore canonical identityをauthorityにする', async () => {
  const source = await readFile(join(SRC, 'input', 'layouts', 'user-layouts.ts'), 'utf8');

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
  const layoutTypesSource = await readFile(join(SRC, 'input/layouts/types.ts'), 'utf8');
  const traceSource = await readFile(join(SRC, 'trace', 'generate.ts'), 'utf8');

  assert.doesNotMatch(layoutTypesSource, /\bcomboConditions\b/);
  assert.doesNotMatch(traceSource, /\bcomboConditions\b/);
  assert.match(
    traceSource,
    /const comboDefinitions = comboFrameHeadingCount\(layout\)/,
    'combo-frame headings must be the combo definition-count authority',
  );
  assert.match(
    traceSource,
    /layout\.resolvedComboDefinitions/,
    'resolved combo definitions must stay in the combo definition-count authority',
  );
});

test('combo fold presentation provenanceはcanonicalInputsをauthorityにする', async () => {
  const source = await readFile(join(SRC, 'input/layouts/types.ts'), 'utf8');
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
  const source = await readFile(join(SRC, 'input/layouts/types.ts'), 'utf8');
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
  const source = await readFile(join(SRC, 'input/semantics/compiler.ts'), 'utf8');
  const start = source.indexOf('export function validateCanonicalInputMap');
  const end = source.indexOf('\n}\n\n\ntype AlternativeIdentityProjection', start);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const validationSource = source.slice(start, end + 2);
  assert.match(validationSource, /alternatives\.length === 0/);
  assert.match(validationSource, /1つ以上のalternativeが必要/);
});

test('logical output matching lengthはcanonicalInputsをauthorityにする', async () => {
  const traceSource = await readFile(join(SRC, 'trace', 'generate.ts'), 'utf8');
  const layoutTypesSource = await readFile(join(SRC, 'input/layouts/types.ts'), 'utf8');
  const userLayoutsSource = await readFile(join(SRC, 'input', 'layouts', 'user-layouts.ts'), 'utf8');

  assert.doesNotMatch(layoutTypesSource, /\bmaxCharLength\b/);
  assert.doesNotMatch(userLayoutsSource, /\bmaxCharLength\b/);
  assert.doesNotMatch(
    traceSource,
    /layout\.maxCharLength\b/,
    'generateTrace must derive the longest-match bound from canonicalInputs',
  );
  assert.match(
    traceSource,
    /layout\.canonicalInputs\.keys\(\)/,
    'canonicalInputs must be the authority for logical output match length',
  );
});

test('generateTrace realized factはFace authoring metadataへ依存しない', async () => {
  const source = await readFile(join(SRC, 'trace', 'generate.ts'), 'utf8');

  assert.doesNotMatch(
    source,
    /layout\.faces\b/,
    'generate.ts must not derive realized facts from Layout.faces',
  );
  assert.doesNotMatch(
    source,
    /\bfaceLayerIds\b/,
    'generate.ts must not derive realized facts from presentation faceLayerIds',
  );
});

test('Face authoring validationはruntime presentation moduleへ依存しない', async () => {
  const validationSource = await readFile(join(SRC, 'input/layouts/face-authoring-validation.ts'), 'utf8');
  const geometrySource = await readFile(join(SRC, 'input/layouts/face-geometry.ts'), 'utf8');

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
  const source = await readFile(join(SRC, 'input', 'layouts', 'layers.ts'), 'utf8');

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
  const source = await readFile(join(SRC, 'input/layouts/index.ts'), 'utf8');

  for (const symbol of ['canFoldFaces', 'classifyFaces', 'groupFacesIntoLayers']) {
    assert.equal(
      source.includes(symbol),
      false,
      `layouts/index.ts must not export legacy authoring classifier: ${symbol}`,
    );
  }
});

test('Analyzerの表示側はFaceのauthoring項目を読まず、compiled presentationを使う', async () => {
  const dirs = ['analyzers', 'hosts', 'ui'];
  const sources = (await Promise.all(dirs.map(async (dir) => {
    const paths = await sourceFilesIn(join(SRC, dir));
    return Promise.all(paths.map(async (path) => ({ path, source: await readFile(path, 'utf8') })));
  }))).flat();
  assert.ok(sources.length > 0);

  const forbidden: readonly [RegExp, string][] = [
    [/\binputRole\b/, 'legacy Face inputRole'],
    [/\btriggerPersistence\b/, 'legacy Face triggerPersistence'],
    [/face\.mode\b/, 'FaceMode（compiled layer presentation metadataを使う）'],
    [/\bclassifyFaces\b/, 'authoring Face classification（compiled presentation aggregationを使う）'],
    [/\bfaceLayerIds\b|\blayerIdForFace\b/, 'Face attributionの逆引き（presentation Layer.idを使う）'],
    [/face\.layer\b/, 'Face.layer（layerDefinitions.labelを使う）'],
    [/face\.trigger\b/, 'raw Face.trigger（displayTriggerKeysを使う）'],
  ];
  for (const { path, source } of sources) {
    for (const [pattern, what] of forbidden) {
      assert.doesNotMatch(source, pattern, `${relative(ROOT, path)} must not read ${what}`);
    }
  }
});

test('presentation trigger authoringはnested alternative schemaを使う', async () => {
  const typesSource = await readFile(join(SRC, 'input/layouts/types.ts'), 'utf8');
  const layersSource = await readFile(join(SRC, 'input', 'layouts', 'layers.ts'), 'utf8');

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
  const source = await readFile(join(SRC, 'input/layouts/key-pattern-picker.ts'), 'utf8');

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
  const pickerSource = await readFile(join(SRC, 'input/layouts/key-pattern-picker.ts'), 'utf8');
  const guideSource = await readFile(join(SRC, 'analyzers/keymap/trigger-guide.ts'), 'utf8');
  const figureSource = await readFile(join(SRC, 'analyzers/heatmap-figure.ts'), 'utf8');

  assert.match(pickerSource, /orderedPresentationLayers\(groups\)/);
  assert.match(figureSource, /orderedPresentationLayers\(/);
  assert.doesNotMatch(
    pickerSource,
    /\[\.\.\.groups\.layers,\s*\.\.\.groups\.modifiers\]/,
    'picker must not give layer-role aggregations implicit priority over modifier-role aggregations',
  );
  assert.match(
    guideSource,
    /presentationLayersOf\(layout\)/,
    'trigger guide must take layers in Layer.order from the shared helper',
  );
  assert.match(
    guideSource,
    /if \(!keyTones\.has\(key\)\) keyTones\.set\(key, tone\)/,
    'trigger guide must preserve the first Layer.order attribution for duplicate triggers',
  );
});

test('トリガーの図はraw Face.trigger textを再構成せず、明示presentation trigger / combo variantsを使う', async () => {
  const source = await readFile(join(SRC, 'analyzers/keymap/trigger-guide.ts'), 'utf8');

  assert.doesNotMatch(
    source,
    /face\.trigger\b/,
    'trigger guide must use normalized display trigger alternatives',
  );
  assert.match(source, /displayTriggerKeys\(face\)/);
  assert.match(source, /combo\.keyVariants\s*\?\?\s*\[combo\.keys\]/);
});

test('SandS trigger presentationはlayout IDへ依存しない', async () => {
  const layersSource = await readFile(join(SRC, 'input', 'layouts', 'layers.ts'), 'utf8');
  assert.doesNotMatch(
    layersSource,
    /layout\.id\s*===/,
    'layers presentation helper must use explicit Face metadata instead of layout ID',
  );

  for (const file of ['analyzers/keymap/trigger-guide.ts', 'analyzers/keymap/layout-breakdown.ts']) {
    const source = await readFile(join(SRC, file), 'utf8');
    assert.doesNotMatch(
      source,
      /naginata-v18|naginataDetail|data-naginata-layer-detail|layout\.id/,
      `${file} must use explicit layout metadata instead of layout identity branches`,
    );
    assert.doesNotMatch(
      source,
      /isNaginataCenterShift|displayLayerLegend/,
      `${file}: legacy SandS presentation inference helpers must not return`,
    );
  }
});

test('structural analysisはbuilt-in layoutのID/nameへ依存しない', async () => {
  const builtInLayoutLiterals = new Set(
    [...LAYOUTS, ...LAYOUTS_JA]
      .flatMap((layout) => [layout.id, layout.name]),
  );

  for (const { path, source } of await sourcesIn('interpretation', 'structure')) {
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

test('廃止済みのlegacy symbol / production helperをsrcへ再導入しない', async () => {
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
    'holdStart',
    'arpeggioEnabled',
    'arpeggioDelayMode',
  ] as const;

  for (const path of await tsFiles(SRC)) {
    const source = await readFile(path, 'utf8');
    for (const symbol of forbiddenEverywhere) {
      assert.equal(
        source.includes(symbol),
        false,
        `${relative(ROOT, path)} reintroduced legacy symbol: ${symbol}`,
      );
    }
  }

  const sourcePaths = (await tsFiles(SRC)).map((path) => relative(SRC, path).replaceAll('\\', '/'));
  assert.equal(sourcePaths.includes('playback-arpeggio.ts'), false);
  assert.equal(sourcePaths.includes('hold-start-action.ts'), false);
});




test('旧画面の入口と転送を復活させない', async () => {
  const rootEntries = await readdir(ROOT);
  for (const path of [
    'legacy.html',
    'vite.legacy.config.ts',
    'playwright.legacy.config.ts',
  ]) {
    assert.equal(rootEntries.includes(path), false, `${path} must remain retired`);
  }

  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  assert.equal(pkg.scripts?.['test:browser:legacy'], undefined);
  assert.doesNotMatch(pkg.scripts?.build ?? '', /legacy/);
});
