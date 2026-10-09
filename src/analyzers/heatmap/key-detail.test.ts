import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID, withRomaji } from '#input/layouts/index.ts';
import { tableForRule } from '#input/romaji/rules.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { computeKeyDetails } from '#interpretation/key-detail.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { computeHeatmapExtraction } from './extract.ts';
import { DEFAULT_HEATMAP_OPTIONS } from './options.ts';

/**
 * キーの詳細の押下数は、ヒートマップの抽出（統合図・層別図・コンボ枠）と同じ値になる。
 */

const geometry = buildGeometry('row-staggered');

const cases: Array<[string, string, string | undefined]> = [
  ['shingeta', 'がきゃ。ぱかかか、んー', undefined],
  ['qwerty', 'しゃかんじょうほうがっこう', 'kunrei'],
  ['qwerty', 'かんかんがんじゃくらんこう', 'azik'],
  ['shin-koume', 'ぴあぴかぴ', undefined],
];

for (const [layoutId, text, rule] of cases) {
  test(`押下数がヒートマップの抽出と一致する: ${layoutId}${rule ? `(${rule})` : ''}`, () => {
    const base = LAYOUT_BY_ID.get(layoutId);
    assert.ok(base);
    const layout = rule ? withRomaji(base, tableForRule(rule)) : base;
    const trace = generateTrace(text, layout, geometry, DEFAULT_TRACE_POLICY);
    const extracted = computeHeatmapExtraction({ trace, metrics: computeMetrics(trace, geometry), options: DEFAULT_HEATMAP_OPTIONS });
    const details = computeKeyDetails(trace, geometry);

    // 統合: 物理キーごとの押下数と総数
    const merged = new Map([...details.merged].map(([id, detail]) => [id, detail.presses]));
    assert.deepEqual(merged, new Map(extracted.integrated.keyCounts));
    assert.equal([...merged.values()].reduce((a, b) => a + b, 0), extracted.integrated.presses);

    // 面ごと: 層は層別図、コンボの面はコンボ枠と一致する
    const faceCounts = (faceId: string) =>
      new Map([...(details.faces.get(faceId) ?? [])].map(([id, detail]) => [id, detail.presses]));
    for (const layer of extracted.layers) {
      assert.deepEqual(faceCounts(layer.id), new Map(layer.keyCounts), layer.id);
    }
    if (extracted.combo) {
      assert.deepEqual(faceCounts(extracted.combo.id), new Map(extracted.combo.keyCounts));
    }
    // 押下の無い層は、ヒートマップには空の層として残るが、キーの詳細には面として現れない
    const usedLayers = extracted.layers.filter((layer) => layer.presses > 0).length;
    assert.equal(details.faces.size, usedLayers + (extracted.combo ? 1 : 0));
  });
}
