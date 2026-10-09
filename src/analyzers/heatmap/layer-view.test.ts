import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { LAYOUT_BY_ID, LAYOUTS, LAYOUTS_JA } from '#input/layouts/index.ts';
import { sampleText } from '#input/text/samples.ts';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { computeKeyDetails } from '#interpretation/key-detail.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { computeHeatmapExtraction } from './extract.ts';
import { DEFAULT_HEATMAP_OPTIONS } from './options.ts';
import {
  activeEntryIndex,
  buildLayerEntries,
  canToggleLayerDetail,
  entryKeyDetail,
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
  return { layout, extracted: computeHeatmapExtraction({ trace, metrics: computeMetrics(trace, geometry), keyDetails: computeKeyDetails(trace, geometry), options: DEFAULT_HEATMAP_OPTIONS }) };
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
    const extracted = computeHeatmapExtraction({ trace, metrics: computeMetrics(trace, geometry), keyDetails: computeKeyDetails(trace, geometry), options: DEFAULT_HEATMAP_OPTIONS });
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

test('レイヤーの見出しは、トリガーのキーを物理キーの名前か刻印で出し、内部のキーidを出さない', () => {
  const shingeta = extractionFor('shingeta', 'あいがぱ');
  assert.deepEqual(
    buildLayerEntries(shingeta.layout, shingeta.extracted, 'detail', 'ansi').map((entry) => entry.title),
    [
      'レイヤー1: 単打',
      'レイヤー2: 中指シフト [い / か]・同時',
      'レイヤー3: 薬指シフト [し / と]・同時',
      'レイヤー4: 拗音1 [こ]・同時',
      'レイヤー5: 拗音2 [が]・同時',
    ],
  );
  const naginata = extractionFor('naginata-v18', 'あ');
  const titles = (detail: 'compact' | 'detail') => buildLayerEntries(naginata.layout, naginata.extracted, detail, 'ansi').map((entry) => entry.title);
  assert.deepEqual(titles('compact'), ['レイヤー1: 単打（レイヤー3以降を合算）', 'レイヤー2: SandS [Space]・同時']);
  assert.equal(titles('detail')[3], 'レイヤー4: 濁音 [あ / か]・同時');
});

test('図ごとのキーの詳細: 押下数は、その図のツールチップの値（keyCounts）と全キーで一致する', () => {
  const cases: Array<[string, string]> = [
    ['naginata-v18', sampleText('ja', 'legacy')],
    ['shingeta', 'あいがぱきゃ'],
    ['qwerty', 'aAbB'],
    ['shin-koume', 'ぴあぴかぴ'],
  ];
  for (const [layoutId, text] of cases) {
    const { layout, extracted } = extractionFor(layoutId, text);
    for (const detail of ['compact', 'detail'] as const) {
      for (const entry of buildLayerEntries(layout, extracted, detail)) {
        const keys = new Set([...entry.keyCounts.keys(), ...extracted.integrated.keyCounts.keys()]);
        for (const keyId of keys) {
          const value = entryKeyDetail(extracted.keyDetails, entry.faceIds, keyId);
          assert.equal(value?.presses ?? 0, entry.keyCounts.get(keyId) ?? 0, `${layoutId} ${detail} ${entry.id} ${keyId}`);
        }
      }
    }
  }
});

test('図ごとのキーの詳細: まとめた図は合算した面の和、統合図は面をまたいだ合算と一致する', () => {
  const { layout, extracted } = extractionFor('naginata-v18', sampleText('ja', 'legacy'));
  const compact = buildLayerEntries(layout, extracted, 'compact');
  const detail = buildLayerEntries(layout, extracted, 'detail');
  // 合算先の単打に、残す層（SandS）以外の29層を足す
  assert.equal(compact[0]!.faceIds[0], 'single');
  assert.equal(compact[0]!.faceIds.length, 30);
  assert.ok(!compact[0]!.faceIds.includes('layer:SandS'));
  assert.deepEqual(compact[1]!.faceIds, ['layer:SandS']);
  // jの押し方: まとめた図の内訳は、合算した面の内訳の和
  const merged = entryKeyDetail(extracted.keyDetails, compact[0]!.faceIds, 'j')!;
  const parts = detail.filter((entry) => compact[0]!.faceIds.includes(entry.id))
    .flatMap((entry) => entryKeyDetail(extracted.keyDetails, entry.faceIds, 'j') ?? []);
  assert.equal(merged.presses, parts.reduce((sum, part) => sum + part.presses, 0));
  assert.equal([...merged.roles.values()].reduce((sum, count) => sum + count, 0), merged.presses);
  // 全部の面を合わせると、統合図と同じ
  const everyFace = [...extracted.keyDetails.faces.keys()];
  assert.equal(entryKeyDetail(extracted.keyDetails, everyFace, 'j')!.presses, extracted.keyDetails.merged.get('j')!.presses);
  // 押下の無いキー・面は `undefined`
  assert.equal(entryKeyDetail(extracted.keyDetails, ['single'], 'no-such-key'), undefined);
  assert.equal(entryKeyDetail(extracted.keyDetails, ['no-such-face'], 'j'), undefined);
});
