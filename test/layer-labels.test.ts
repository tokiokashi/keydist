import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYOUTS, LAYOUTS_JA, type Layout } from '#input/layouts/index.ts';
import {
  compactLayerGuideDefinitions,
  defaultLayerNames,
  layerDefinitionsWithLabels,
} from '#input/layouts/layers.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { computeKeyDetails } from '#interpretation/key-detail.ts';
import { computeHeatmapExtraction } from '#analyzers/heatmap/extract.ts';
import { DEFAULT_HEATMAP_OPTIONS } from '#analyzers/heatmap/options.ts';
import { buildLayerEntries } from '#analyzers/heatmap/layer-view.ts';
import { modifierRows } from '#analyzers/layer-combo/layout-breakdown.ts';

/**
 * 名前の無いレイヤーの名前が、画面に出る経路のどこでも空でなく、同じ名前で出ること。
 * 条件: 組み込みの全配列（英字・日本語）、物理配列は row-staggered、`DEFAULT_TRACE_POLICY`。
 */

const geometry = buildGeometry('row-staggered');
const ALL_LAYOUTS: readonly Layout[] = [...LAYOUTS, ...LAYOUTS_JA];

function heatmapTitles(layout: Layout) {
  const trace = generateTrace('あ', layout, geometry, DEFAULT_TRACE_POLICY);
  const extracted = computeHeatmapExtraction({
    trace,
    metrics: computeMetrics(trace, geometry),
    keyDetails: computeKeyDetails(trace, geometry),
    options: DEFAULT_HEATMAP_OPTIONS,
  });
  return { trace, entries: buildLayerEntries(layout, extracted, 'detail') };
}

test('組み込みの全配列で、レイヤーの名前は画面に出るどの経路でも空でなく、同じ名前になる', () => {
  for (const layout of ALL_LAYOUTS) {
    const expected = new Map(layerDefinitionsWithLabels(layout).map((definition) => [definition.id, definition.label]));
    const check = (source: string, id: string, label: string) => {
      assert.notEqual(label.trim(), '', `${layout.id}: ${source}: ${id}`);
      assert.equal(label, expected.get(id), `${layout.id}: ${source}: ${id}`);
    };
    for (const [id, label] of expected) check('定義', id, label);

    const { trace, entries } = heatmapTitles(layout);
    for (const definition of trace.layerDefinitions) check('トレース', definition.id, definition.label);
    for (const entry of entries) check('ヒートマップ', entry.id, entry.label);
    for (const definition of compactLayerGuideDefinitions(layout)) check('Testerのカンペ', definition.id, definition.label);
    for (const row of modifierRows(layout)) check('レイヤーとコンボ', row.id, row.label);
  }
});

test('組み込みの全配列で、既定の名前のレイヤーは同じ配列の他のどのレイヤーとも名前が重ならない', () => {
  for (const layout of ALL_LAYOUTS) {
    const definitions = layerDefinitionsWithLabels(layout);
    const defaults = defaultLayerNames(layout);
    for (const definition of definitions.filter((candidate) => defaults.has(candidate.id))) {
      const same = definitions.filter((other) => other.label === definition.label);
      assert.equal(same.length, 1, `${layout.id}: ${definition.id}: ${definition.label}`);
    }
  }
});

test('既定の名前は、役割名を持つ面なら役割名、持たない面なら「<キー>のシフト」になる', () => {
  const nicola = defaultLayerNames(ALL_LAYOUTS.find((layout) => layout.id === 'nicola')!);
  assert.deepEqual([...nicola.values()].map((name) => name.label), ['無変換のシフト', '変換のシフト']);

  const naginata = defaultLayerNames(ALL_LAYOUTS.find((layout) => layout.id === 'naginata-v18')!);
  assert.deepEqual(naginata.get('face:2'), { label: '小書き', includesTrigger: false });
  // 拗音のh・p・iは同じ役割名なので、キーを添えて区別する
  assert.deepEqual(
    ['face:7', 'face:8', 'face:9'].map((id) => naginata.get(id)?.label),
    ['拗音（く）', '拗音（へ）', '拗音（る）'],
  );
  assert.equal(naginata.get('face:10')?.label, '外来音 + 半濁音（す + こ）');
});

test('ヒートマップの見出しは、名前にキーが入る既定の名前ではトリガーを重ねず、それ以外では残す', () => {
  const titles = (id: string) => new Map(heatmapTitles(ALL_LAYOUTS.find((layout) => layout.id === id)!).entries.map((entry) => [entry.id, entry.title]));
  const nicola = titles('nicola');
  assert.equal(nicola.get('face:1'), 'レイヤー2: 無変換のシフト・同時');

  const naginata = titles('naginata-v18');
  assert.match(naginata.get('face:2')!, /^レイヤー\d+: 小書き \[Q\]/);
  assert.match(naginata.get('face:7')!, /^レイヤー\d+: 拗音（く）・/);
  assert.doesNotMatch(naginata.get('face:7')!, /\[/);
  // 配列が名前を付けたレイヤーの見出しは変えない
  assert.match(naginata.get('layer:濁音')!, /\[.+\]/);
});

test('レイヤーの名前を画面に出すソースは、生の定義の名前を読まない', () => {
  // `layerDefinitions` を直接読んでよいのは、名前以外（種別・役割・入力方式）を読む箇所と、
  // 名前を作り直す箇所だけ。新しい箇所が増えたら、名前を読んでいないか確かめてから足す。
  const allowed = new Set([
    'src/input/layouts/types.ts',
    'src/input/layouts/layers.ts',
    'src/input/layouts/key-pattern-picker.ts',
    'src/analyzers/key-detail-view.ts',
    'src/analyzers/heatmap/layer-view.ts',
    'src/legacy/analyzer-heatmap-content.tsx',
    'src/trace/generate.ts',
  ]);
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const readers: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && /\blayout\??\.layerDefinitions\b/.test(readFileSync(path, 'utf8'))) {
        readers.push(relative(root, path));
      }
    }
  };
  walk(join(root, 'src'));
  assert.deepEqual(readers.filter((path) => !allowed.has(path)), []);
});
