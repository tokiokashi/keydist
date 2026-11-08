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
import { scatterSlots, type ScatterFigureModel, type ScatterFigureRowContext, type ScatterFiguresInput, type ScatterSlot } from './figure-model.ts';

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

/** 並べた位置のうち、図だけを順に取り出す。 */
function scatterFigureModels(presets: Parameters<typeof scatterSlots>[0], figuresInput: ScatterFiguresInput): ScatterFigureModel[] {
  return scatterSlots(presets, figuresInput).flatMap((slot) => (slot.type === 'figure' ? [slot.figure] : []));
}

function input(overrides: Partial<ScatterFiguresInput> = {}): ScatterFiguresInput {
  return { ...BUILTIN, xAxes: ['perCharSteps'], yAxes: ['meanPerStroke'], freeOrder: 'byX', tickScale: 'linear', language: 'ja', ...overrides };
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
    assert.deepEqual(plain(figure), plain(scatterFigureModels([figure.preset], input())[0]!), figure.preset);
    assert.deepEqual(plain(figure), plain(scatterFigureModels([figure.preset], input())[0]!), figure.preset);
  }
  // 並びから外しても、残った図は変わらない
  const withoutFirst = scatterFigureModels(['hand', 'handShare'], input());
  assert.deepEqual(withoutFirst.map(plain), together.slice(1).map(plain));
});

test('軸の種類と「自由に選ぶ」の軸は、全ての図で同じ値を使う', () => {
  const figures = scatterFigureModels(['distance', 'free'], input({ tickScale: 'log', xAxes: ['totalUnits'], yAxes: ['sameFinger'] }));
  assert.deepEqual(figures[1]!.axes, { x: 'totalUnits', y: 'sameFinger' });
  // 「自由に選ぶ」の軸は、他の組み合わせの図の軸を変えない
  assert.deepEqual(figures[0]!.axes, { x: 'perCharSteps', y: 'meanPerStroke' });
  assert.equal(figures[0]!.logScale, true);
});

test('対数を選ぶと、対数にできない図にだけその旨の理由が付き、その図は線形の軸で描く', () => {
  const figures = scatterFigureModels(['distance', 'handShare'], input({ tickScale: 'log' }));
  const [distance, handShare] = figures;
  assert.equal(distance!.logScale, true);
  assert.deepEqual(distance!.logReasons, []);
  assert.equal(handShare!.logScale, false);
  assert.ok(handShare!.logReasons.includes('noStraightLines'));
  // 線形を選んでいる時は、どの図にも理由が付かない
  for (const figure of scatterFigureModels(['distance', 'handShare'], input())) assert.deepEqual(figure.logReasons, []);
});

test('「自由に選ぶ」の位置に、縦軸ごとの図が縦軸の順に入る', () => {
  const slots = scatterSlots(['distance', 'free', 'hand'], input({ yAxes: ['meanPerStroke', 'sameFinger', 'rightHandDistanceShare'] }));
  assert.deepEqual(
    slots.map((slot) => slot.key),
    ['distance', 'free:perCharSteps:meanPerStroke', 'free:perCharSteps:sameFinger', 'free:perCharSteps:rightHandDistanceShare', 'hand'],
  );
  for (const slot of slots) assert.equal(slot.type, 'figure');
});

test('横軸と選べない組になった縦軸は図を描かず、1つの知らせにまとめて「自由に選ぶ」の図の後に置く', () => {
  const slots = scatterSlots(['distance', 'free', 'hand'], input({ xAxes: ['perCharSteps'], yAxes: ['actions', 'meanPerStroke', 'perCharSteps'] }));
  assert.deepEqual(
    slots.map((slot) => slot.key),
    ['distance', 'free:perCharSteps:meanPerStroke', 'free-notice', 'hand'],
  );
  const notice = slots.find((slot): slot is Extract<ScatterSlot, { type: 'free-notice' }> => slot.type === 'free-notice')!;
  assert.equal(notice.noYAxis, false);
  assert.deepEqual(notice.blocked[0], { x: 'perCharSteps', y: 'actions', problem: 'proportional' });
  assert.deepEqual(notice.blocked[1], { x: 'perCharSteps', y: 'perCharSteps', problem: 'same' });
  assert.equal(notice.blocked.length, 2);
});

test('縦軸が無い時は、「自由に選ぶ」の図を描かず知らせを置き、他の図は残す', () => {
  const slots = scatterSlots(['distance', 'free'], input({ yAxes: [] }));
  assert.deepEqual(
    slots.map((slot) => slot.key),
    ['distance', 'free-notice'],
  );
  const notice = slots[1]!;
  assert.equal(notice.type === 'free-notice' && notice.noYAxis, true);
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

test('横軸も複数選ぶと、横軸の順に、その中で縦軸の順に、全部の組の図が並ぶ', () => {
  const slots = scatterSlots(['distance', 'free'], input({ xAxes: ['perCharSteps', 'totalUnits'], yAxes: ['meanPerStroke', 'sameFinger'] }));
  assert.deepEqual(
    slots.map((slot) => slot.key),
    ['distance', 'free:perCharSteps:meanPerStroke', 'free:perCharSteps:sameFinger', 'free:totalUnits:meanPerStroke', 'free:totalUnits:sameFinger'],
  );
});

test('選べない組は図を描かず、組を1つの知らせにまとめる。他の組の図は残る', () => {
  const slots = scatterSlots(['free'], input({ xAxes: ['perCharSteps', 'totalUnits'], yAxes: ['perCharSteps', 'sameFinger'] }));
  assert.deepEqual(
    slots.map((slot) => slot.key),
    ['free:perCharSteps:sameFinger', 'free:totalUnits:perCharSteps', 'free:totalUnits:sameFinger', 'free-notice'],
  );
  const notice = slots.at(-1)!;
  assert.deepEqual(notice.type === 'free-notice' ? notice.blocked : [], [{ x: 'perCharSteps', y: 'perCharSteps', problem: 'same' }]);
});

test('横軸が無い時と両方無い時は、図を描かず知らせを置き、他の図は残す', () => {
  for (const [xAxes, yAxes, noX, noY] of [
    [[], ['sameFinger'], true, false],
    [[], [], true, true],
  ] as const) {
    const slots = scatterSlots(['distance', 'free'], input({ xAxes, yAxes }));
    assert.deepEqual(
      slots.map((slot) => slot.key),
      ['distance', 'free-notice'],
    );
    const notice = slots[1]!;
    assert.equal(notice.type === 'free-notice' && notice.noXAxis, noX);
    assert.equal(notice.type === 'free-notice' && notice.noYAxis, noY);
  }
});

test('縦軸ごとの並びでは、縦軸の順に、その中で横軸の順に図が並ぶ', () => {
  const slots = scatterSlots(['free'], input({ xAxes: ['perCharSteps', 'totalUnits'], yAxes: ['meanPerStroke', 'sameFinger'], freeOrder: 'byY' }));
  assert.deepEqual(
    slots.map((slot) => slot.key),
    ['free:perCharSteps:meanPerStroke', 'free:totalUnits:meanPerStroke', 'free:perCharSteps:sameFinger', 'free:totalUnits:sameFinger'],
  );
});

test('選べない組の知らせは、図の並びに関わらず横軸の順、その中で縦軸の順で書く', () => {
  for (const freeOrder of ['byX', 'byY'] as const) {
    const slots = scatterSlots(['free'], input({ xAxes: ['actions', 'perCharSteps'], yAxes: ['actions', 'perCharSteps'], freeOrder }));
    const notice = slots.find((slot) => slot.type === 'free-notice');
    assert.ok(notice?.type === 'free-notice', freeOrder);
    assert.deepEqual(
      notice.blocked.map(({ x, y }) => `${x}:${y}`),
      ['actions:actions', 'actions:perCharSteps', 'perCharSteps:actions', 'perCharSteps:perCharSteps'],
      freeOrder,
    );
  }
});
