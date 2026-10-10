import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { faceFromEntries, fromFaces, LAYOUTS, LAYOUTS_JA, type Face, type Layout } from '#input/layouts/index.ts';
import {
  compactLayerGuideDefinitions,
  defaultLayerNames,
  layerDefinitionsWithLabels,
} from '#input/layouts/layers.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { computeKeyDetails } from '#interpretation/key-detail.ts';
import { computeHeatmapLayersExtraction } from '#analyzers/heatmap-layers/extract.ts';
import { DEFAULT_HEATMAP_LAYERS_OPTIONS } from '#analyzers/heatmap-layers/options.ts';
import { buildLayerEntries } from '#analyzers/heatmap-layers/layer-view.ts';
import { modifierRows } from '#analyzers/keymap/layout-breakdown.ts';

/**
 * 名前の無いレイヤーの名前が、画面に出る経路のどこでも空でなく、同じ名前で出ること。
 * 条件: 組み込みの全配列（英字・日本語）、物理配列はrow-staggered、`DEFAULT_TRACE_POLICY`。
 */

const geometry = buildGeometry('row-staggered');
const ALL_LAYOUTS: readonly Layout[] = [...LAYOUTS, ...LAYOUTS_JA];

function heatmapTitles(layout: Layout) {
  const trace = generateTrace('あ', layout, geometry, DEFAULT_TRACE_POLICY);
  const extracted = computeHeatmapLayersExtraction({
    trace,
    metrics: computeMetrics(trace, geometry),
    keyDetails: computeKeyDetails(trace, geometry),
    options: DEFAULT_HEATMAP_LAYERS_OPTIONS,
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
    for (const row of modifierRows(layout)) check('キーマップ', row.id, row.label);
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

test('既定の名前は、出る文字の種類と共通する小書き、重なる時は出る文字、呼べない時は「<キー>のシフト」になる', () => {
  const nicola = defaultLayerNames(ALL_LAYOUTS.find((layout) => layout.id === 'nicola')!);
  assert.deepEqual([...nicola.values()].map((name) => name.label), ['無変換のシフト', '変換のシフト']);
  assert.ok([...nicola.values()].every((name) => name.includesTrigger));

  const naginata = defaultLayerNames(ALL_LAYOUTS.find((layout) => layout.id === 'naginata-v18')!);
  const label = (id: string) => naginata.get(id)?.label;
  assert.equal(label('face:2'), '小書き');
  assert.deepEqual(['face:7', 'face:8', 'face:9'].map(label), ['拗音（ゃ）', '拗音（ゅ）', '拗音（ょ）']);
  assert.equal(label('face:10'), '外来音（ぇ）');
  assert.equal(label('face:13'), '濁音の拗音（ゃ）');
  // 全部が濁音の拗音なら、濁音の拗音で呼ぶ（ぎゅ・でゅ・じゅ・ぢゅ・びゅ）
  assert.equal(label('face:14'), '濁音の拗音（ゅ）');
  // 種類の名前が他の面と重なる面は、出る文字が一番多い面だけ種類の名前を残し、他は出る文字を並べる
  assert.equal(label('face:11'), '外来音（ぃ）');
  assert.equal(label('face:17'), 'てぃ');
  assert.equal(label('face:18'), 'てゅ・ぴゅ');
  // 出る文字の数が並ぶ面は、どちらも出る文字を並べる
  assert.deepEqual(['face:19', 'face:27'].map(label), ['でぃ', 'ぐぃ']);
  // 文字の種類で呼べる面の名前には、トリガーのキーが入らない
  assert.ok([...naginata.values()].every((name) => !name.includesTrigger));
});

test('文字の種類で呼べない面と、並べても重なる面の名前', () => {
  const layer = (trigger: readonly string[], outputs: Record<string, string>): Face => ({
    ...faceFromEntries(trigger, 'simultaneous', outputs),
    layer: undefined,
    role: 'modifier',
    inputRole: 'modifier',
    triggerPersistence: 'hold-capable',
  });
  const base: Face = { ...faceFromEntries([], 'simultaneous', { h: 'H' }), inputRole: 'layer' };
  const names = (...faces: Face[]) =>
    [...defaultLayerNames(fromFaces('names-test', 'names-test', [base, ...faces])).values()];

  // かな以外や、種類の混ざる出力を含む面は、トリガーで呼ぶ
  const mixed = names(layer(['a'], { h: 'A' }), layer(['b'], { h: 'きゃ', j: 'ぎゃ', k: 'て' }));
  assert.deepEqual(mixed.map((name) => name.label), ['Aのシフト', 'Bのシフト']);
  assert.ok(mixed.every((name) => name.includesTrigger));

  // 同じ文字を出す面どうしは、並べても重なるので、トリガーで呼ぶ
  const same = names(layer(['a'], { h: 'てぃ' }), layer(['b'], { h: 'てぃ' }));
  assert.deepEqual(same.map((name) => name.label), ['Aのシフト', 'Bのシフト']);

  // 4つ以上出る面は3つまで並べて「…」で省く
  const long = names(
    layer(['a'], { h: 'くぃ', j: 'うぃ', k: 'ふぃ', l: 'つぃ' }),
    layer(['b'], { h: 'てぃ', j: 'でぃ', k: 'すぃ', l: 'ずぃ', ';': 'ぐぃ' }),
  );
  assert.deepEqual(long.map((name) => name.label), ['くぃ・うぃ・ふぃ…', '外来音（ぃ）']);
});

test('配列が付けた名前と重なる既定の名前は、出る文字を並べて区別する', () => {
  const layer = (trigger: readonly string[], outputs: Record<string, string>, label?: string): Face => ({
    ...faceFromEntries(trigger, 'simultaneous', outputs),
    layer: undefined,
    ...(label === undefined ? {} : { presentationLabel: label }),
    role: 'modifier',
    inputRole: 'modifier',
    triggerPersistence: 'hold-capable',
  });
  const base: Face = { ...faceFromEntries([], 'simultaneous', { h: 'H' }), inputRole: 'layer' };
  const layout = fromFaces('authored-test', 'authored-test', [
    base,
    layer(['a'], { h: 'きゃ', j: 'しゃ' }, '拗音（ゃ）'),
    layer(['b'], { h: 'ちゃ', j: 'にゃ' }),
  ]);
  assert.deepEqual([...defaultLayerNames(layout).values()].map((name) => name.label), ['ちゃ・にゃ']);
  const labels = layerDefinitionsWithLabels(layout).map((definition) => definition.label);
  assert.equal(new Set(labels).size, labels.length);
});

test('ヒートマップの見出しは、名前にキーが入る既定の名前ではトリガーを重ねず、それ以外では残す', () => {
  const titles = (id: string) => new Map(heatmapTitles(ALL_LAYOUTS.find((layout) => layout.id === id)!).entries.map((entry) => [entry.id, entry.title]));
  const nicola = titles('nicola');
  assert.equal(nicola.get('face:1'), 'レイヤー2: 無変換のシフト・同時');

  const naginata = titles('naginata-v18');
  assert.match(naginata.get('face:2')!, /^レイヤー\d+: 小書き \[Q\]/);
  assert.match(naginata.get('face:7')!, /^レイヤー\d+: 拗音（ゃ） \[や\]/);
  assert.match(naginata.get('face:17')!, /^レイヤー\d+: てぃ \[い \+ 半濁音（M）\]/);
  // 配列が名前を付けたレイヤーの見出しは変えない
  assert.match(naginata.get('layer:濁音')!, /\[.+\]/);
});

test('レイヤーの名前を画面に出すソースは、生の定義の名前を読まない', () => {
  // `layerDefinitions` を直接読んでよいのは、名前以外（種別・役割・入力方式）を読む箇所と、
  // 名前を作り直す箇所だけ。新しい箇所が増えたら、名前を読んでいないか確かめてから足す。
  // 拾うのは `layout.layerDefinitions` という書き方だけで、別の変数名や分割代入で読む箇所は拾えない。
  const allowed = new Set([
    'src/input/layouts/types.ts',
    'src/input/layouts/layers.ts',
    'src/input/layouts/key-pattern-picker.ts',
    'src/analyzers/key-detail-view.ts',
    'src/analyzers/heatmap-layers/layer-view.ts',
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
