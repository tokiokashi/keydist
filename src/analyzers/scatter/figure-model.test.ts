import assert from 'node:assert/strict';
import test from 'node:test';
import { createEngineCache } from '#engine/cache.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { LAYOUT_BY_ID, LAYOUTS_JA } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import { fixedTestText } from '../../../test/kana-test-text.ts';
import { computeComparisonRowValues } from '../comparison-column-values.ts';
import type { ScatterRow } from './extract.ts';
import {
  scatterFigureModel,
  scatterFigureModels,
  type ScatterFigureModel,
  type ScatterFigureRowContext,
  type ScatterFiguresInput,
} from './figure-model.ts';

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};
const TEXT = fixedTestText('ja');

/** 組み込みの日本語の配列を全部、既定の物理配列で評価した行。 */
function builtinRows(): { readonly rows: ScatterRow[]; readonly order: string[]; readonly rowContext: Map<string, ScatterFigureRowContext> } {
  const cache = createEngineCache();
  const rows: ScatterRow[] = [];
  const order: string[] = [];
  const rowContext = new Map<string, ScatterFigureRowContext>();
  for (const layout of LAYOUTS_JA) {
    const resolution = resolveEngineInput({
      target: { kind: 'layout', layoutId: layout.id },
      setups: new Map(),
      catalog: CATALOG,
      userLayouts: new Map(),
      overrides: EMPTY_SETTINGS_OVERRIDES,
      text: TEXT,
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

const BUILTIN = builtinRows();

/** 比べられる形にする。細い線の量は関数を持つので、関数でない部分だけを残す。 */
function plain(figure: ScatterFigureModel) {
  const { contour, lineContour, ...rest } = figure;
  const stripped = (c: typeof contour) =>
    c === undefined ? undefined : { column: c.column, relation: c.relation, drawsLines: c.drawsLines, straightInLog: c.straightInLog };
  return { ...rest, contour: stripped(contour), lineContour: stripped(lineContour) };
}

function input(overrides: Partial<ScatterFiguresInput> = {}): ScatterFiguresInput {
  return { ...BUILTIN, xAxis: 'perCharSteps', yAxis: 'meanPerStroke', tickScale: 'linear', language: 'ja', ...overrides };
}

test('選んだ組み合わせの図は、渡した順に並ぶ', () => {
  assert.ok(BUILTIN.rows.length > 20);
  const figures = scatterFigureModels(['distance', 'hand', 'free'], input());
  assert.deepEqual(
    figures.map((figure) => figure.preset),
    ['distance', 'hand', 'free'],
  );
});

test('各図のモデルは、その組み合わせ1つだけを選んだ時と同じ', () => {
  const together = scatterFigureModels(['distance', 'hand', 'handShare'], input());
  for (const figure of together) {
    assert.deepEqual(plain(figure), plain(scatterFigureModel(figure.preset, input())), figure.preset);
    assert.deepEqual(plain(figure), plain(scatterFigureModels([figure.preset], input())[0]!), figure.preset);
  }
  // 並びから外しても、残った図は変わらない
  const withoutFirst = scatterFigureModels(['hand', 'handShare'], input());
  assert.deepEqual(withoutFirst.map(plain), together.slice(1).map(plain));
});

test('目盛りと「自由に選ぶ」の軸は、全ての図で同じ値を使う', () => {
  const figures = scatterFigureModels(['distance', 'free'], input({ tickScale: 'log', xAxis: 'totalUnits', yAxis: 'sameFinger' }));
  assert.deepEqual(figures[1]!.axes, { x: 'totalUnits', y: 'sameFinger' });
  // 「自由に選ぶ」の軸は、他の組み合わせの図の軸を変えない
  assert.deepEqual(figures[0]!.axes, { x: 'perCharSteps', y: 'meanPerStroke' });
  assert.equal(figures[0]!.logScale, true);
});

test('対数を選ぶと、対数にできない図にだけその旨の理由が付き、その図は通常の目盛りで描く', () => {
  const figures = scatterFigureModels(['distance', 'handShare'], input({ tickScale: 'log' }));
  const [distance, handShare] = figures;
  assert.equal(distance!.logScale, true);
  assert.deepEqual(distance!.logReasons, []);
  assert.equal(handShare!.logScale, false);
  assert.ok(handShare!.logReasons.includes('noStraightLines'));
  // 通常の目盛りを選んでいる時は、どの図にも理由が付かない
  for (const figure of scatterFigureModels(['distance', 'handShare'], input())) assert.deepEqual(figure.logReasons, []);
});

test('「自由に選ぶ」で選べない軸の組は、「自由に選ぶ」の図にだけ問題として付く', () => {
  const figures = scatterFigureModels(['distance', 'free'], input({ xAxis: 'perCharSteps', yAxis: 'perCharSteps' }));
  assert.equal(figures[0]!.problem, undefined);
  assert.equal(figures[1]!.problem, 'same');
});

test('計算中・失敗の対象は、どの図にも同じ行が付く', () => {
  const order = [...BUILTIN.order, 'layout:pending', 'layout:broken'];
  const rows: ScatterRow[] = [...BUILTIN.rows, { kind: 'failed', targetKey: 'layout:broken', failureKind: 'target-missing', message: '失敗' }];
  const figures = scatterFigureModels(['distance', 'hand'], input({ order, rows }));
  for (const figure of figures) {
    assert.deepEqual(
      figure.excluded.map((row) => [row.targetKey, row.status]),
      [
        ['layout:pending', 'computing'],
        ['layout:broken', 'failed'],
      ],
    );
  }
});
