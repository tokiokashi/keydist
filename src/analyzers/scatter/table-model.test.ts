import assert from 'node:assert/strict';
import test from 'node:test';
import { createEngineCache } from '#engine/cache.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { LAYOUT_BY_ID, LAYOUTS_JA } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import { fixedTestText } from '../../../test/kana-test-text.ts';
import { COMPARISON_COLUMN_FORMAT } from '../comparison-column-text.ts';
import { computeComparisonRowValues } from '../comparison-column-values.ts';
import type { ScatterRow } from './extract.ts';
import { scatterSlots, type ScatterFigureRowContext } from './figure-model.ts';
import { scatterTableModel } from './table-model.ts';

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

/** 組み込みの日本語の配列のうち先頭の数個を、既定の物理配列で評価した行。 */
function rowsOfSomeLayouts() {
  const cache = createEngineCache();
  const rows: ScatterRow[] = [];
  const order: string[] = [];
  const rowContext = new Map<string, ScatterFigureRowContext>();
  for (const layout of LAYOUTS_JA.slice(0, 4)) {
    const resolution = resolveEngineInput({
      target: { kind: 'layout', layoutId: layout.id },
      setups: new Map(),
      catalog: CATALOG,
      userLayouts: new Map(),
      overrides: EMPTY_SETTINGS_OVERRIDES,
      text: fixedTestText('ja'),
      language: 'ja',
    });
    if (!resolution.ok) continue;
    const { trace } = cache.getTrace(resolution.input);
    const { metrics } = cache.getInterpretation(resolution.input);
    const targetKey = `layout:${layout.id}`;
    rows.push({ kind: 'ok', targetKey, values: computeComparisonRowValues(metrics, trace), inputChars: trace.inputChars });
    order.push(targetKey);
    rowContext.set(targetKey, { label: layout.id, fullName: layout.id, kind: 'alpha' });
  }
  return { rows, order, rowContext };
}

const SOURCE = rowsOfSomeLayouts();
const INPUT = { ...SOURCE, xAxes: ['perCharSteps'], yAxes: ['meanPerStroke'], freeOrder: 'byX', tickScale: 'linear', language: 'ja' } as const;

test('散布図の表は、図に渡した点と同じ順・同じ値の行を持つ', () => {
  const slots = scatterSlots(['distance', 'hand', 'free'], INPUT);
  const figures = slots.flatMap((slot) => (slot.type === 'figure' ? [slot.figure] : []));
  assert.equal(figures.length, 3);
  for (const figure of figures) {
    const table = scatterTableModel(figure, 'ja');
    assert.ok(figure.model.points.length >= 2, figure.preset);
    assert.deepEqual(
      table.rows.map((row) => row.key),
      figure.model.points.map((point) => point.targetKey),
      figure.preset,
    );
    for (const row of table.rows) {
      const source = SOURCE.rows.find((item) => item.targetKey === row.key);
      assert.equal(source?.kind, 'ok');
      if (source?.kind !== 'ok') continue;
      assert.equal(row.cells[0], COMPARISON_COLUMN_FORMAT[figure.axes.x](source.values[figure.axes.x]), `${figure.preset} ${row.key} x`);
      assert.equal(row.cells[1], COMPARISON_COLUMN_FORMAT[figure.axes.y](source.values[figure.axes.y]), `${figure.preset} ${row.key} y`);
      assert.equal(row.cells.length, table.columns.length);
    }
  }
});

test('細い線を引く図の表は、線の量の列に、点の読み取りと同じ値を出す', () => {
  const slots = scatterSlots(['distance', 'hand'], INPUT);
  let withLine = 0;
  for (const slot of slots) {
    if (slot.type !== 'figure') continue;
    const { figure } = slot;
    const table = scatterTableModel(figure, 'ja');
    const line = figure.lineContour;
    assert.equal(table.columns.length, line === undefined ? 2 : 3, figure.preset);
    if (line === undefined) continue;
    withLine += 1;
    for (const point of figure.plotted) {
      const expected = line.readoutAt(point.x, point.y, point.values[line.column]);
      const row = table.rows.find((item) => item.key === point.targetKey);
      assert.equal(row?.cells[2], expected === undefined ? '—' : COMPARISON_COLUMN_FORMAT[line.column](expected), `${figure.preset} ${point.targetKey}`);
    }
  }
  assert.ok(withLine >= 1);
});
