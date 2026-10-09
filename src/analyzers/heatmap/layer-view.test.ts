import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { LAYOUT_BY_ID, LAYOUTS, LAYOUTS_JA } from '#input/layouts/index.ts';
import { sampleText } from '#input/text/samples.ts';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { computeHeatmapExtraction } from './extract.ts';
import {
  activeEntryIndex,
  buildLayerEntries,
  canToggleLayerDetail,
  heatIntensity,
  resolveArrangement,
  sharedMaxCount,
} from './layer-view.ts';

/**
 * ヒートマップの層別図の組み立て。期待値は、実行して確かめた値を固定している
 * （配列・テキストは各テストに併記。物理配列はrow-staggered、`DEFAULT_TRACE_POLICY`）。
 */

const geometry = buildGeometry('row-staggered');

function extractionFor(layoutId: string, text: string) {
  const layout = LAYOUT_BY_ID.get(layoutId);
  assert.ok(layout, layoutId);
  const trace = generateTrace(text, layout, geometry, DEFAULT_TRACE_POLICY);
  assert.equal(trace.skipped, 0);
  return { layout, extracted: computeHeatmapExtraction(trace, computeMetrics(trace, geometry)) };
}

const total = (counts: ReadonlyMap<string, number>) => [...counts.values()].reduce((sum, count) => sum + count, 0);

test('薙刀式(吾輩は猫である): まとめは層を足してから色用の押下数を求める。jは13で、層別に足した8や7ではない', () => {
  const { layout, extracted } = extractionFor('naginata-v18', sampleText('ja', 'legacy'));
  const compact = buildLayerEntries(layout, extracted, 'compact');
  assert.deepEqual(compact.map((entry) => entry.id), ['single', 'layer:SandS']);
  assert.equal(compact[0]!.colorCounts.get('j'), 13);
  assert.equal(compact[1]!.colorCounts.get('j'), 7);
  assert.equal(compact[0]!.title, 'レイヤー1: 単打（レイヤー3以降を合算）');

  const detail = buildLayerEntries(layout, extracted, 'detail');
  assert.equal(detail.length, 31);
  assert.equal(detail[0]!.colorCounts.get('j'), 8);
});

test('薙刀式(吾輩は猫である): 共通の最大値は表示する図の組で決まる。まとめは22、詳細は17', () => {
  const { layout, extracted } = extractionFor('naginata-v18', sampleText('ja', 'legacy'));
  assert.equal(canToggleLayerDetail(layout), true);
  const compact = buildLayerEntries(layout, extracted, 'compact');
  const detail = buildLayerEntries(layout, extracted, 'detail');
  assert.equal(sharedMaxCount(compact), 22);
  assert.equal(sharedMaxCount(detail), 17);
  // 図ごとの最大値とは別に、全部の図の最大値を1つ使う
  const own = compact.map((entry) => Math.max(0, ...entry.colorCounts.values()));
  assert.notEqual(own[0], own[1]);
  assert.equal(sharedMaxCount(compact), Math.max(...own));
});

test('共通の最大値は表示中のタブに依らない。薬指シフトのタブを出していても、隠れた単打の層の17を使う', () => {
  const { layout, extracted } = extractionFor('shingeta', sampleText('ja', 'legacy'));
  const entries = buildLayerEntries(layout, extracted, 'detail');
  const own = new Map(entries.map((entry) => [entry.id, Math.max(0, ...entry.colorCounts.values())]));
  assert.equal(own.get('single'), 17);
  assert.equal(own.get('layer:薬指シフト'), 7);
  assert.equal(sharedMaxCount(entries), 17);
});

test('層をまとめる宣言が無い配列は、まとめと詳細で同じ図になる', () => {
  const { layout, extracted } = extractionFor('shingeta', 'あいがぱ');
  assert.equal(canToggleLayerDetail(layout), false);
  assert.deepEqual(
    buildLayerEntries(layout, extracted, 'compact').map((entry) => entry.id),
    buildLayerEntries(layout, extracted, 'detail').map((entry) => entry.id),
  );
});

test('英字配列: 面として宣言していないShiftの層は、使われた時だけ図に足す', () => {
  const plain = extractionFor('qwerty', 'aa');
  assert.deepEqual(buildLayerEntries(plain.layout, plain.extracted, 'compact').map((entry) => entry.id), ['single']);

  const shifted = extractionFor('qwerty', 'aAa');
  const entries = buildLayerEntries(shifted.layout, shifted.extracted, 'compact');
  assert.deepEqual(entries.map((entry) => entry.id), ['single', 'layer:Shift']);
  assert.deepEqual([...entries[1]!.keyCounts].sort(), [['a', 1], ['shift-r', 1]]);
  assert.deepEqual([...entries[1]!.colorCounts], [['a', 1]]);
});

test('全配列: 層別図の押下数の合計とコンボ枠は、統合の押下数と一致する(まとめ・詳細とも)', () => {
  for (const layout of [...LAYOUTS, ...LAYOUTS_JA]) {
    const text = LAYOUTS_JA.includes(layout) ? 'あいがぱ' : 'aAbB';
    const trace = generateTrace(text, layout, geometry, DEFAULT_TRACE_POLICY);
    if (trace.skipped > 0) continue;
    const extracted = computeHeatmapExtraction(trace, computeMetrics(trace, geometry));
    for (const detail of ['compact', 'detail'] as const) {
      const entries = buildLayerEntries(layout, extracted, detail);
      const layered = entries.reduce((sum, entry) => sum + total(entry.keyCounts), 0);
      assert.equal(layered + (extracted.combo?.presses ?? 0), extracted.integrated.presses, `${layout.id} ${detail}`);
    }
  }
});

test('色の強度の線形と対数。最大値が0以下でも割り算で壊れない', () => {
  assert.equal(heatIntensity(5, 10, 'linear'), 0.5);
  assert.equal(heatIntensity(0, 10, 'linear'), 0);
  assert.equal(heatIntensity(10, 10, 'linear'), 1);
  assert.equal(heatIntensity(9, 99, 'log'), Math.log(10) / Math.log(100));
  assert.equal(heatIntensity(10, 10, 'log'), 1);
  assert.equal(heatIntensity(0, 0, 'linear'), 0);
  assert.equal(heatIntensity(0, 0, 'log'), 0);
});

test('並べ方は自動なら5層まで並置、6層からタブ', () => {
  assert.equal(resolveArrangement('auto', 5), 'side-by-side');
  assert.equal(resolveArrangement('auto', 6), 'tabs');
  assert.equal(resolveArrangement('tabs', 1), 'tabs');
  assert.equal(resolveArrangement('side-by-side', 31), 'side-by-side');
});

test('タブの層はidで引く。今の図に無いidや未選択は最初の層', () => {
  const { layout, extracted } = extractionFor('shingeta', 'あいがぱ');
  const entries = buildLayerEntries(layout, extracted, 'detail');
  assert.equal(activeEntryIndex(entries, 'layer:薬指シフト'), 2);
  assert.equal(activeEntryIndex(entries, 'layer:Shift'), 0);
  assert.equal(activeEntryIndex(entries, ''), 0);
});
