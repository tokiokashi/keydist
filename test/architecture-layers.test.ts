import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// docs/architecture.md の依存規則を検査する。
// ファイルを列挙せず、パスの前方一致で層を決めるので、層の中にファイルを足せば自動で検査対象になる。

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'src');

type Layer =
  | 'input'
  | 'trace'
  | 'interpretation'
  | 'engine'
  | 'analyzers'
  | 'hosts'
  | 'editors'
  | 'tester'
  | 'ui-base'
  | 'ui-domain'
  | 'platform'
  | 'app'
  | 'routes'
  | 'legacy'
  | 'transitional';

interface Placement {
  layer: Layer;
  /** 同じ層の中で互いにimportできない単位（analyzers/<name>、hosts/<name>）。 */
  unit?: string;
}

// 長い接頭辞を先に書く。
const PREFIXES: readonly [string, Layer][] = [
  ['features/analyzer-next/', 'transitional'],
  ['ui/primitives/', 'ui-base'],
  ['ui/theme/', 'ui-base'],
  ['ui/keyboard/', 'ui-domain'],
  ['ui/charts/', 'ui-domain'],
  ['input/', 'input'],
  ['trace/', 'trace'],
  ['interpretation/', 'interpretation'],
  ['engine/', 'engine'],
  ['analyzers/', 'analyzers'],
  ['hosts/', 'hosts'],
  ['editors/', 'editors'],
  ['tester/', 'tester'],
  ['platform/', 'platform'],
  ['app/', 'app'],
  ['routes/', 'routes'],
  ['router.tsx', 'routes'],
  ['legacy/', 'legacy'],
];

/** React・DOM・storage・ブラウザAPIを使わない層。Nodeから直接実行でき、Workerへそのまま移せる。 */
const PURE_LAYERS = new Set<Layer>(['input', 'trace', 'interpretation', 'engine']);

const ALL_LAYERS: readonly Layer[] = PREFIXES.map(([, layer]) => layer);
const EVERYTHING = new Set<Layer>(ALL_LAYERS);

/** importer層 → import してよい層。legacy と transitional は下の規則で別に絞る。 */
const ALLOWED: Readonly<Record<Layer, ReadonlySet<Layer>>> = {
  input: new Set(['input']),
  trace: new Set(['input', 'trace']),
  interpretation: new Set(['input', 'trace', 'interpretation']),
  engine: new Set(['input', 'trace', 'interpretation', 'analyzers', 'engine']),
  analyzers: new Set(['input', 'trace', 'interpretation', 'analyzers', 'ui-base', 'ui-domain']),
  hosts: new Set([
    'input', 'trace', 'interpretation', 'engine', 'analyzers', 'hosts', 'ui-base', 'ui-domain',
  ]),
  editors: new Set(['input', 'editors', 'ui-base', 'ui-domain']),
  // Testerは当面platformを直接使ってよい（#544の対象外。永続化の作り直しは別に行う）。
  tester: new Set(['input', 'tester', 'ui-base', 'ui-domain', 'platform']),
  'ui-base': new Set(['ui-base']),
  'ui-domain': new Set(['input', 'ui-base', 'ui-domain']),
  platform: new Set(['input', 'platform']),
  app: EVERYTHING,
  routes: EVERYTHING,
  legacy: EVERYTHING,
  transitional: EVERYTHING,
};

/** legacy / transitional をimportしてよい層。それ以外の新しいコードは旧実装に依存させない。 */
const MAY_IMPORT_OLD = new Set<Layer>(['app', 'routes', 'legacy', 'transitional']);

/**
 * 移行中に解消できない既知の違反。`importer -> target` の相対パス（src基準）で書き、理由を添える。
 * 解消したら消す。実在しない行が残っているとテストが落ちる（一方向にしか減らないようにするため）。
 */
const KNOWN_VIOLATIONS: Readonly<Record<string, string>> = {};

/**
 * 新しい構造へまだ移していないファイル（src基準）。Phase 1で移すたびにここから消す。
 * ここに無い未配置ファイルを足すとテストが落ちる。src直下へ新しいファイルを増やさないため。
 */
const UNPLACED_BASELINE: readonly string[] = [
  'analysis-aggregate.ts',
  'analysis-arpeggio.ts',
  'analysis-chain.ts',
  'analysis-redirect.ts',
  'analysis-roll.ts',
  'analysis-transition.ts',
  'analyzer-bigram-flow-model.ts',
  'analyzer-calibration-dialog.tsx',
  'analyzer-calibration-model.ts',
  'analyzer-chart-components.tsx',
  'analyzer-comparison-model.ts',
  'analyzer-conditions-content.tsx',
  'analyzer-conditions-model.ts',
  'analyzer-controls-model.ts',
  'analyzer-geometry-dialog.tsx',
  'analyzer-geometry-editor-model.ts',
  'analyzer-heatmap-content.tsx',
  'analyzer-layout-editor-model.ts',
  'analyzer-layout-editor.tsx',
  'analyzer-metrics-content.tsx',
  'analyzer-metrics-model.ts',
  'analyzer-page.tsx',
  'analyzer-playback-rate-chart-model.ts',
  'analyzer-playback-settings-model.ts',
  'analyzer-playback-settings.tsx',
  'analyzer-playback-surface-model.ts',
  'analyzer-playback-surface.tsx',
  'analyzer-react-shell.tsx',
  'analyzer-remaining-ui.tsx',
  'analyzer-romaji-dialog-model.ts',
  'analyzer-romaji-dialog.tsx',
  'analyzer-samples.ts',
  'analyzer-ui-state-bootstrap.ts',
  'analyzer-ui-state-owner.ts',
  'app-dom.ts',
  'app-state.ts',
  'app.css',
  'appearance.ts',
  'bigram-vectors.ts',
  'browser-download.ts',
  'browser-storage-events.ts',
  'chart.ts',
  'components/physical-keyboard.tsx',
  'condition-bundle.ts',
  'condition-description.ts',
  'condition-presets.ts',
  'condition-resolution.ts',
  'core/input-converter/index.ts',
  'core/input-converter/typing-input-engine.ts',
  'core/semantic-input/action-realization.ts',
  'core/semantic-input/compiler.ts',
  'core/semantic-input/index.ts',
  'core/semantic-input/realization.ts',
  'core/semantic-input/trigger-realization.ts',
  'core/semantic-input/types.ts',
  'evaluate.ts',
  'features/bigram-vector/analyzer-bigram-flow.tsx',
  'features/bigram-vector/bigram-flow-view-config.ts',
  'features/bigram-vector/bigram-flow-view.tsx',
  'features/bigram-vector/bigram-vector-view.css',
  'features/bigram-vector/movement-profile-scale.ts',
  'features/input-converter/browser-keyboard-adapter.ts',
  'features/input-converter/browser-keyboard-bindings.ts',
  'features/input-converter/input-converter-preferences.ts',
  'features/input-converter/input-converter-view.tsx',
  'features/input-converter/live-romaji.ts',
  'features/input-converter/random-samples.ts',
  'features/input-converter/reverse-lookup.ts',
  'features/input-converter/typing-session-command.ts',
  'features/input-converter/use-input-converter-preferences.ts',
  'features/input-converter/use-typing-session.ts',
  'gap-figure.ts',
  'geometry-settings.ts',
  'geometry-units.ts',
  'geometry.ts',
  'key-pattern-picker.ts',
  'layer-heatmap.ts',
  'layers.ts',
  'layout-import.ts',
  'layout-physical-keys.ts',
  'layout-selection.ts',
  'layouts/asuka.ts',
  'layouts/combos-custom.ts',
  'layouts/face-authoring-validation.ts',
  'layouts/face-geometry.ts',
  'layouts/index.ts',
  'layouts/jis-kana.ts',
  'layouts/kawasemi-kai.ts',
  'layouts/kawasemi-plus.ts',
  'layouts/naginata.ts',
  'layouts/nicola.ts',
  'layouts/shin-jis.ts',
  'layouts/shin-koume.ts',
  'layouts/shingeta.ts',
  'layouts/tsuki-2-263.ts',
  'layouts/types.ts',
  'main.ts',
  'metrics.ts',
  'persistence/app-state-storage.ts',
  'persistence/debounced-scheduler.ts',
  'persistence/storage.ts',
  'persistence/versioned-state.ts',
  'playback-analysis-display.ts',
  'playback-calibration.ts',
  'playback-view.ts',
  'playback.ts',
  'results-view.ts',
  'romaji/azik.ts',
  'romaji/kunrei.ts',
  'romaji/oonishi.ts',
  'romaji/rules.ts',
  'sample-text-ja.ts',
  'sample-text.ts',
  'sensitivity.ts',
  'style.css',
  'theme.css',
  'theme.ts',
  'trigger-activation-groups.ts',
  'ui-state.ts',
  'user-geometries.ts',
  'user-layouts.ts',
  'workspace/panel-registry.ts',
  'workspace/viewport-clamp.ts',
  'workspace/workspace-panel.tsx',
  'workspace/workspace-persistence.ts',
  'workspace/workspace-reducer.ts',
  'workspace/workspace-runtime.tsx',
  'workspace/workspace-state.ts',
];

/** 使ってよい場所が決まっている外部ライブラリ。ここに無いライブラリは純粋な層以外で自由に使える。 */
const RESTRICTED_PACKAGES: readonly { pattern: RegExp; name: string; allowed: ReadonlySet<Layer> }[] = [
  {
    pattern: /^dockview(?:-react|-core)?(?:\/|$)/,
    name: 'Dockview',
    allowed: new Set<Layer>(['hosts', 'legacy', 'transitional']),
  },
  {
    pattern: /^@tanstack\/(?:react-router|react-start)(?:\/|$)/,
    name: 'TanStack Router / Start',
    allowed: new Set<Layer>(['routes', 'app', 'hosts', 'legacy', 'transitional']),
  },
];

/** Dockview は hosts の中でも workspace だけ、Router は standalone だけに限る。 */
const RESTRICTED_HOST_UNITS: Readonly<Record<string, string>> = {
  Dockview: 'workspace',
  'TanStack Router / Start': 'standalone',
};

const FRAMEWORK_MODULE_PATTERNS = [
  /^react(?:\/|$)/,
  /^react-dom(?:\/|$)/,
  /^motion(?:\/|$)/,
  /^@tanstack\//,
  /^dockview/,
] as const;

const PLATFORM_GLOBAL_PATTERNS = [
  /\b(?:window|document|navigator|localStorage|sessionStorage|indexedDB)\s*\./,
  /\btypeof\s+(?:window|document|navigator|localStorage)\b/,
  /\b(?:HTMLElement|KeyboardEvent|MutationObserver|ResizeObserver)\b/,
] as const;

function toPosix(path: string): string {
  return path.split(sep).join('/');
}

function srcRelative(path: string): string {
  return toPosix(relative(SRC, path));
}

export function placementOf(srcPath: string): Placement | undefined {
  for (const [prefix, layer] of PREFIXES) {
    if (srcPath === prefix || srcPath.startsWith(prefix)) {
      if (layer === 'analyzers' || layer === 'hosts') {
        const rest = srcPath.slice(prefix.length);
        const slash = rest.indexOf('/');
        // analyzers/contract.ts のような直下のファイルはどのunitにも属さない共有物。
        return { layer, unit: slash === -1 ? undefined : rest.slice(0, slash) };
      }
      return { layer };
    }
  }
  return undefined;
}

function isPureAnalyzerFile(srcPath: string): boolean {
  // Analyzerの中では .ts が抽出・設定（純粋）、.tsx が可視化。
  return srcPath.startsWith('analyzers/') && srcPath.endsWith('.ts') && !srcPath.endsWith('.d.ts');
}

function isTesterEngineFile(srcPath: string): boolean {
  return srcPath.startsWith('tester/engine/');
}

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() ? [path] : [];
  }));
  return nested.flat();
}

function isCode(path: string): boolean {
  return /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path);
}

function isTest(path: string): boolean {
  return /\.test\.tsx?$/.test(path);
}

function moduleSpecifiers(source: string): readonly string[] {
  const specs = new Set<string>();
  for (const pattern of [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bexport\s+\*\s+from\s+['"]([^'"]+)['"]/g,
  ]) {
    for (const match of source.matchAll(pattern)) specs.add(match[1]!);
  }
  return [...specs];
}

function packageImports(): ReadonlyMap<string, string> {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    imports?: Record<string, unknown>;
  };
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(pkg.imports ?? {})) {
    if (typeof value === 'string') map.set(key, value);
  }
  return map;
}

const SUBPATH_IMPORTS = packageImports();

/** 相対パスと package.json の `imports`（`#input/*` 等）を src 基準のパスへ解決する。外部パッケージは undefined。 */
export function resolveToSrc(importerPath: string, specifier: string): string | undefined {
  // Viteのquery（`?url` 等）はパスの一部ではない。
  const bare = specifier.replace(/\?.*$/, '');
  let absolute: string | undefined;
  if (bare.startsWith('.')) {
    absolute = resolve(dirname(importerPath), bare);
  } else if (bare.startsWith('#')) {
    for (const [key, target] of SUBPATH_IMPORTS) {
      if (key.endsWith('*') && target.endsWith('*') && bare.startsWith(key.slice(0, -1))) {
        absolute = resolve(ROOT, target.slice(0, -1) + bare.slice(key.length - 1));
        break;
      }
      if (key === bare) {
        absolute = resolve(ROOT, target);
        break;
      }
    }
    assert.ok(absolute, `${srcRelative(importerPath)}: package.json#imports に ${specifier} が無い`);
  }
  if (absolute === undefined) return undefined;
  if (existsSync(absolute) && statSync(absolute).isDirectory()) return undefined;
  const rel = relative(SRC, absolute);
  if (rel.startsWith('..')) return undefined;
  return toPosix(rel);
}

interface Violation {
  key: string;
  message: string;
}

export function layerViolation(
  importer: string,
  target: string,
): Violation | undefined {
  const from = placementOf(importer);
  const to = placementOf(target);
  // 未配置のファイルは移行中なので、どちら側でも検査しない（UNPLACED_BASELINE で別に絞る）。
  if (!from || !to) return undefined;
  const key = `${importer} -> ${target}`;

  if ((to.layer === 'legacy' || to.layer === 'transitional') && !MAY_IMPORT_OLD.has(from.layer)) {
    return { key, message: `${key}: 新しいコードから ${to.layer} へ依存しない` };
  }
  if (!ALLOWED[from.layer].has(to.layer)) {
    return { key, message: `${key}: ${from.layer} は ${to.layer} を import できない` };
  }
  if (from.layer === 'analyzers' && to.layer === 'analyzers') {
    if (from.unit !== undefined && to.unit !== undefined && from.unit !== to.unit) {
      return { key, message: `${key}: Analyzer同士は import しない（共有物は ui か interpretation へ下ろす）` };
    }
    if (from.unit === undefined && to.unit !== undefined) {
      return { key, message: `${key}: analyzers の契約は個別のAnalyzerに依存しない` };
    }
  }
  if (from.layer === 'engine' && to.layer === 'analyzers' && to.unit !== undefined) {
    return { key, message: `${key}: engine は Analyzer の契約（analyzers/ 直下）だけを知る` };
  }
  if (from.layer === 'hosts' && to.layer === 'hosts') {
    if (from.unit !== to.unit && to.unit !== 'shared') {
      return { key, message: `${key}: host同士は import しない（共有物は hosts/shared へ）` };
    }
  }
  return undefined;
}

function packageViolation(importer: string, specifier: string): Violation | undefined {
  const from = placementOf(importer);
  if (!from) return undefined;
  const key = `${importer} -> ${specifier}`;
  const pure = PURE_LAYERS.has(from.layer) || isPureAnalyzerFile(importer) || isTesterEngineFile(importer);
  if (pure && FRAMEWORK_MODULE_PATTERNS.some((pattern) => pattern.test(specifier))) {
    return { key, message: `${key}: 純粋な層は React / Router / Dockview / 描画ライブラリを使わない` };
  }
  for (const restricted of RESTRICTED_PACKAGES) {
    if (!restricted.pattern.test(specifier)) continue;
    if (!restricted.allowed.has(from.layer)) {
      return { key, message: `${key}: ${restricted.name} は ${from.layer} で使わない` };
    }
    const hostUnit = RESTRICTED_HOST_UNITS[restricted.name];
    if (from.layer === 'hosts' && hostUnit !== undefined && from.unit !== hostUnit) {
      return { key, message: `${key}: ${restricted.name} は hosts/${hostUnit} だけで使う` };
    }
  }
  return undefined;
}

async function collectViolations(): Promise<Violation[]> {
  const violations: Violation[] = [];
  for (const path of (await sourceFiles(SRC)).filter(isCode)) {
    const importer = srcRelative(path);
    const source = await readFile(path, 'utf8');
    for (const specifier of moduleSpecifiers(source)) {
      const target = resolveToSrc(path, specifier);
      const violation = target === undefined
        ? packageViolation(importer, specifier)
        : layerViolation(importer, target);
      if (violation) violations.push(violation);
    }
  }
  return violations;
}

test('依存の向きが docs/architecture.md の表に従う', async () => {
  const violations = await collectViolations();
  const unexpected = violations.filter((violation) => !(violation.key in KNOWN_VIOLATIONS));
  assert.deepEqual(unexpected.map((violation) => violation.message), []);

  const actualKeys = new Set(violations.map((violation) => violation.key));
  const stale = Object.keys(KNOWN_VIOLATIONS).filter((key) => !actualKeys.has(key));
  assert.deepEqual(stale, [], 'KNOWN_VIOLATIONS の解消済みの行を消す');
});

test('純粋な層は React・DOM・storage・ブラウザAPIを使わない', async () => {
  for (const path of (await sourceFiles(SRC)).filter(isCode)) {
    const file = srcRelative(path);
    const placement = placementOf(file);
    if (!placement) continue;
    const pure = PURE_LAYERS.has(placement.layer) || isPureAnalyzerFile(file) || isTesterEngineFile(file);
    if (!pure) continue;
    assert.ok(!file.endsWith('.tsx'), `${file}: 純粋な層に .tsx を置かない`);
    const source = await readFile(path, 'utf8');
    for (const pattern of PLATFORM_GLOBAL_PATTERNS) {
      assert.doesNotMatch(source, pattern, `${file}: ブラウザAPIを使わない`);
    }
  }
});

test('新しいファイルは新しい構造の中に置く（src直下などへ増やさない）', async () => {
  const unplaced = (await sourceFiles(SRC))
    .filter((path) => !isTest(path))
    .map(srcRelative)
    .filter((file) => placementOf(file) === undefined)
    // tsr が生成するファイルは対象外。
    .filter((file) => file !== 'routeTree.gen.ts');
  const baseline = new Set(UNPLACED_BASELINE);
  assert.deepEqual(
    unplaced.filter((file) => !baseline.has(file)).sort(),
    [],
    '新しいファイルは docs/architecture.md の構造の中に置く',
  );
  const present = new Set(unplaced);
  assert.deepEqual(
    UNPLACED_BASELINE.filter((file) => !present.has(file)),
    [],
    '移動・削除したファイルを UNPLACED_BASELINE から消す',
  );
});

test('依存規則の判定そのもの', () => {
  assert.equal(layerViolation('trace/evaluate.ts', 'input/shapes/geometry.ts'), undefined);
  assert.ok(layerViolation('input/shapes/geometry.ts', 'trace/evaluate.ts'));
  assert.ok(layerViolation('analyzers/heatmap/extract.ts', 'analyzers/bigram-flow/extract.ts'));
  assert.equal(layerViolation('analyzers/heatmap/extract.ts', 'analyzers/contract.ts'), undefined);
  assert.ok(layerViolation('analyzers/contract.ts', 'analyzers/heatmap/extract.ts'));
  assert.equal(layerViolation('engine/run.ts', 'analyzers/contract.ts'), undefined);
  assert.ok(layerViolation('engine/run.ts', 'analyzers/heatmap/extract.ts'));
  assert.ok(layerViolation('hosts/workspace/pane.tsx', 'hosts/standalone/page.tsx'));
  assert.equal(layerViolation('hosts/workspace/pane.tsx', 'hosts/shared/chrome.tsx'), undefined);
  assert.ok(layerViolation('ui/primitives/button.tsx', 'input/layouts/types.ts'));
  assert.equal(layerViolation('ui/keyboard/keyboard.tsx', 'input/layouts/types.ts'), undefined);
  assert.ok(layerViolation('input/layouts/types.ts', 'legacy/ui-state.ts'));
  assert.equal(layerViolation('app/app-state.ts', 'legacy/ui-state.ts'), undefined);
  assert.ok(layerViolation('platform/storage.ts', 'app/app-state.ts'));
  // 未配置のファイルは移行中なので判定しない。
  assert.equal(layerViolation('evaluate.ts', 'geometry.ts'), undefined);

  assert.ok(packageViolation('trace/evaluate.ts', 'react'));
  assert.ok(packageViolation('analyzers/bigram-flow/extract.ts', 'react'));
  assert.equal(packageViolation('analyzers/bigram-flow/bigram-flow-view.tsx', 'react'), undefined);
  assert.ok(packageViolation('analyzers/bigram-flow/bigram-flow-view.tsx', 'dockview-react'));
  assert.ok(packageViolation('hosts/standalone/page.tsx', 'dockview-react'));
  assert.equal(packageViolation('hosts/workspace/renderer.tsx', 'dockview-react'), undefined);
  assert.ok(packageViolation('hosts/workspace/renderer.tsx', '@tanstack/react-router'));
  assert.equal(packageViolation('hosts/standalone/page.tsx', '@tanstack/react-router'), undefined);
});
