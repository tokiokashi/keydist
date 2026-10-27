import assert from 'node:assert/strict';
import { test } from 'node:test';
import { heatmapOptions } from './options.ts';
import { HEATMAP_FIGURE_GROUPS, HEATMAP_WINDOW_GROUPS, type HeatmapSettingsGroup } from './settings-sections.ts';

type Place = 'window' | 'figure';

// 数値が変わる項目（extract）は解析設定の小窓、見た目だけの項目（view）は図の表示の小窓に、ちょうど1回ずつ置く。
const PLACE_OF_AFFECT: Record<'extract' | 'view', Place> = {
  extract: 'window',
  view: 'figure',
};

function placements(tables: Readonly<Record<Place, readonly HeatmapSettingsGroup[]>>): Map<string, Place[]> {
  const placed = new Map<string, Place[]>();
  for (const place of ['window', 'figure'] as const) {
    for (const group of tables[place]) {
      for (const key of group.keys) placed.set(key, [...(placed.get(key) ?? []), place]);
    }
  }
  return placed;
}

/** 表の置き方が`affects`と合わない項目と理由を返す。合っていれば空。 */
function mismatches(tables: Readonly<Record<Place, readonly HeatmapSettingsGroup[]>>): string[] {
  const placed = placements(tables);
  const items: Readonly<Record<string, { readonly affects: 'extract' | 'view' }>> = heatmapOptions.items;
  const problems: string[] = [];
  for (const [key, def] of Object.entries(items)) {
    const actual = placed.get(key) ?? [];
    if (actual.length !== 1 || actual[0] !== PLACE_OF_AFFECT[def.affects]) {
      problems.push(`${key}（${def.affects}）の置き場: ${actual.join('、') || 'なし'}`);
    }
  }
  for (const key of placed.keys()) if (!(key in items)) problems.push(`${key}は項目として存在しない`);
  return problems;
}

const actual = { window: HEATMAP_WINDOW_GROUPS, figure: HEATMAP_FIGURE_GROUPS };

test('ヒートマップの項目は、affectsに合う置き場にちょうど1回ずつ置かれる', () => {
  assert.deepEqual(mismatches(actual), []);
});

test('項目をどこにも置かない時・違う所に置いた時・2回置いた時は検査が落ちる', () => {
  const dropped = { window: HEATMAP_WINDOW_GROUPS, figure: [] };
  assert.equal(mismatches(dropped).length, 1);
  const wrongPlace = {
    window: [{ id: 'drawStyle' as const, title: '', keys: ['drawStyle' as const] }],
    figure: [],
  };
  assert.equal(mismatches(wrongPlace).length, 1);
  const twice = {
    window: [{ id: 'drawStyle' as const, title: '', keys: ['drawStyle' as const] }],
    figure: HEATMAP_FIGURE_GROUPS,
  };
  assert.equal(mismatches(twice).length, 1);
});
