import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { keyboardStandardForGeometryId } from '#input/shapes/key-labels.ts';
import { computeKeyDetails } from '#interpretation/key-detail.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { KANA_TEST_TEXT } from '../../../test/kana-test-text.ts';
import { baseLayerLegends } from '../heatmap-figure.ts';
import { heatmapDrawnKeys } from '../heatmap-keys.ts';
import { computeHeatmapLayersExtraction } from './extract.ts';
import { buildLayerEntries, entryKeyDetail } from './layer-view.ts';
import { DEFAULT_HEATMAP_LAYERS_OPTIONS } from './options.ts';
import { heatmapLayersTableModel } from './table-model.ts';

const geometry = buildGeometry('row-staggered');

function tableFor(layoutId: string, text: string, detail: 'compact' | 'detail') {
  const layout = LAYOUT_BY_ID.get(layoutId);
  assert.ok(layout, layoutId);
  const trace = generateTrace(text, layout, geometry, DEFAULT_TRACE_POLICY);
  const extracted = computeHeatmapLayersExtraction({
    trace,
    metrics: computeMetrics(trace, geometry),
    keyDetails: computeKeyDetails(trace, geometry),
    options: DEFAULT_HEATMAP_LAYERS_OPTIONS,
  });
  const entries = buildLayerEntries(layout, extracted, detail);
  const table = heatmapLayersTableModel({
    drawnKeys: heatmapDrawnKeys(layout, geometry),
    legends: baseLayerLegends(layout),
    standard: keyboardStandardForGeometryId(geometry.id),
    columns: entries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      detailOf: (keyId) => entryKeyDetail(extracted.keyDetails, entry.faceIds, keyId),
    })),
  });
  return { entries, table };
}

test('薙刀式(吾輩は猫である): 列は図の並びと見出しのまま、セルは図のキーの押下数で、押されないキーは行に出ない', () => {
  for (const detail of ['compact', 'detail'] as const) {
    const { entries, table } = tableFor('naginata-v18', KANA_TEST_TEXT, detail);
    assert.deepEqual(
      table.columns,
      entries.map((entry) => entry.title),
      detail,
    );
    for (const row of table.rows) {
      assert.equal(row.cells.length, entries.length);
      assert.ok(
        row.cells.some((cell) => cell !== '0'),
        `${detail}: ${row.header}`,
      );
      const counts = entries.map((entry) => entry.keyCounts.get(row.key) ?? 0);
      assert.deepEqual(row.cells, counts.map(String), `${detail}: ${row.key}`);
    }
    const shown = new Set(table.rows.map((row) => row.key));
    for (const entry of entries) {
      for (const [keyId, count] of entry.keyCounts) if (count > 0) assert.ok(shown.has(keyId), `${detail}: ${keyId}`);
    }
  }
});
