import assert from 'node:assert/strict';
import test from 'node:test';
import { loadedKanjiDirectLayout } from '../../test/kanji-direct-tables.ts';
import { fixedTestText } from '../../test/kana-test-text.ts';
import { tableIdentityOf } from '#input/layouts/table-identity.ts';
import { withRomaji, type Layout } from '#input/layouts/types.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { traceKeyOf } from './keys.ts';
import { resolveEngineInput, type ResolvedInput } from './resolved-input.ts';
import { EMPTY_SETTINGS_OVERRIDES } from './settings-items.ts';

const SHAPES = new Map(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape] as const));

function resolveWith(layout: Layout): ResolvedInput {
  const layouts = new Map<string, Layout>([...LAYOUT_BY_ID, [layout.id, layout]]);
  const setup: Setup = { id: 'setup-1', number: 1, layoutId: layout.id, shapeId: 'row-staggered' };
  const result = resolveEngineInput({
    target: { kind: 'setup', setupId: setup.id },
    setups: new Map([[setup.id, setup]]),
    catalog: { layouts, shapes: SHAPES },
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: fixedTestText('ja'),
    language: 'ja',
  });
  assert.ok(result.ok);
  return result.input;
}

test('表から作った配列のTraceのキーは、解決し直しても変わらない', () => {
  const layout = loadedKanjiDirectLayout('tcode');
  assert.ok(tableIdentityOf(layout) !== undefined);
  const input = resolveWith(layout);
  assert.equal(input.layout, layout, '解決しても配列が派生しない');
  const key = traceKeyOf(input);
  assert.equal(traceKeyOf(resolveWith(layout)), key);
});

test('表から作った配列を派生させると、識別子を引き継がず、中身の違いでTraceのキーが変わる', () => {
  const layout = loadedKanjiDirectLayout('tcode');
  const input = resolveWith(layout);

  // 中身が同じ複製でも識別子は引き継がない
  assert.equal(tableIdentityOf({ ...layout }), undefined);

  const first = [...layout.map][0]!;
  const edited: Layout = { ...layout, map: new Map([...layout.map, [first[0], [...first[1]].reverse()]]) };
  const withTable = withRomaji(layout, new Map([['a', 'あ']]));
  const withOtherTable = withRomaji(layout, new Map([['a', 'い']]));

  const keys = [layout, edited, withTable, withOtherTable].map((derived) => traceKeyOf({ ...input, layout: derived }));
  assert.equal(keys[0], traceKeyOf(input));
  assert.equal(new Set(keys).size, keys.length, '派生した配列が、元の配列や互いと同じキーになる');
});
