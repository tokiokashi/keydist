import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { keyboardStandardForGeometryId } from '#input/shapes/key-labels.ts';
import { computeKeyDetails } from '#interpretation/key-detail.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { baseLayerLegends } from '../heatmap-figure.ts';
import { heatmapFlowSegments } from '../heatmap-flow.ts';
import { heatmapDrawnKeys } from '../heatmap-keys.ts';
import { keyDetailTooltip, keyName } from '../key-detail-view.ts';
import { computeHeatmapExtraction } from './extract.ts';
import { HEATMAP_FLOW_SOURCE_LABELS } from './options.ts';
import { heatmapFlowTableModel, heatmapTableModel } from './table-model.ts';

const geometry = buildGeometry('row-staggered');

function setup(text: string) {
  const layout = LAYOUT_BY_ID.get('qwerty');
  assert.ok(layout);
  const trace = generateTrace(text, layout, geometry, DEFAULT_TRACE_POLICY);
  const extracted = computeHeatmapExtraction({ metrics: computeMetrics(trace, geometry), keyDetails: computeKeyDetails(trace, geometry), trace });
  const source = {
    drawnKeys: heatmapDrawnKeys(layout, geometry),
    legends: baseLayerLegends(layout),
    standard: keyboardStandardForGeometryId(geometry.id),
  };
  return { extracted, source };
}

test('押下数の表(qwerty・aAa): 押下数と割合は全押下4に対する値で、図のツールチップと同じ名前・同じ回数になる', () => {
  const { extracted, source } = setup('aAa');
  const table = heatmapTableModel({ ...source, detailOf: (id) => extracted.keyDetails.merged.get(id), totalPresses: extracted.presses });
  const row = (id: string) => table.rows.find((item) => item.key === id)!;
  assert.deepEqual(row('a').cells, ['3', '75.0%']);
  assert.deepEqual(row('shift-r').cells, ['1', '25.0%']);
  assert.deepEqual(row('q').cells, ['0', '0.0%']);
  // 図に描くキーは押下が0でも全て行になる
  assert.equal(table.rows.length, source.drawnKeys.length);
  // 行の見出しは図のツールチップの1行目と同じ名前
  for (const { key, unused } of source.drawnKeys) {
    if (unused) continue;
    const name = keyName(key.id, source.legends.get(key.id), source.standard);
    assert.equal(row(key.id).header, name);
    assert.ok(keyDetailTooltip(name, extracted.keyDetails.merged.get(key.id)).startsWith(`${name}: ${row(key.id).cells[0]}`), key.id);
  }
});

test('押下数の表(qwerty): 行は物理配列の上の段から、段の中は左から並ぶ', () => {
  const { extracted, source } = setup('aAa');
  const table = heatmapTableModel({ ...source, detailOf: (id) => extracted.keyDetails.merged.get(id), totalPresses: extracted.presses });
  const order = table.rows.map((item) => item.key);
  const index = (id: string) => order.indexOf(id);
  assert.ok(index('q') < index('w') && index('w') < index('e'));
  assert.ok(index('p') < index('a'));
  assert.ok(index('a') < index('s') && index('l') < index('z'));
});

test('2打鍵の線の表(qwerty・asas): 回数は線の太さの元の組数で、図に描く線と同じ集合・同じ順', () => {
  const { extracted, source } = setup('asas');
  const vectors = extracted.flowLines.actual.vectors;
  const table = heatmapFlowTableModel({ ...source, vectors, sourceLabel: HEATMAP_FLOW_SOURCE_LABELS.actual });
  assert.deepEqual(
    table.rows.map((row) => row.cells),
    [['2'], ['1']],
  );
  assert.deepEqual(
    table.rows.map((row) => row.header),
    ['A → S', 'S → A'],
  );
  // 図の線（heatmapFlowSegments）と同じ組が、同じ順で並ぶ
  const centers = new Map(source.drawnKeys.filter((item) => !item.unused).map((item) => [item.key.id, { x: 0, y: 0 }]));
  assert.deepEqual(
    table.rows.map((row) => row.key),
    heatmapFlowSegments(vectors, centers).map((segment) => segment.vector.id),
  );
});
