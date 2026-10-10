import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { modifierRows } from '#analyzers/keymap/layout-breakdown.ts';
import { buildLayerEntries } from '#analyzers/heatmap-layers/layer-view.ts';
import { computeHeatmapLayersExtraction } from '#analyzers/heatmap-layers/extract.ts';
import { DEFAULT_HEATMAP_LAYERS_OPTIONS } from '#analyzers/heatmap-layers/options.ts';
import { computeKeyDetails } from '#interpretation/key-detail.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { LAYOUT_BY_ID } from './index.ts';
import { presentationLayerGuide, triggerChordsDisplayText } from './layers.ts';

/** 薙刀式v18の修飾の表の押し方（既定の条件）。実行して確かめた値を固定している。 */
const NAGINATA_MODIFIER_TRIGGERS: Record<string, string> = {
  小書き: 'Q',
  濁音: 'J / F',
  半濁音: 'M / V',
  '拗音（ゃ）': 'や',
  '拗音（ゅ）': 'ゆ',
  '拗音（ょ）': 'よ',
  '外来音（ぇ）': 'え + 半濁音（V）',
  '外来音（ぃ）': 'い + 半濁音（V）',
  '外来音（ぉ）': 'お + 半濁音（V）',
  '濁音の拗音（ゃ）': 'や + 濁音（J）',
  '濁音の拗音（ゅ）': '濁音（J） + ゆ',
  '濁音の拗音（ょ）': 'よ + 濁音（J）',
  '外来音（ぁ）': 'あ + 半濁音（V）',
  てぃ: 'い + 半濁音（M）',
  'てゅ・ぴゅ': '半濁音（M） + ゆ',
  でぃ: '濁音（J） + い',
  '外来音（ぅ）': 'う + 半濁音（M）',
  '濁音の外来音（ぅ）': '濁音（J） + う',
  '半濁音の拗音（ゃ）': 'や + 半濁音（M）',
  '半濁音の拗音（ょ）': 'よ + 半濁音（M）',
  '濁音の外来音（ぇ）': '濁音（J） + え',
  'しぇ・ちぇ': '半濁音（M） + え',
  '濁音の外来音（ぁ）': '濁音（F） + あ',
  ぐぃ: '濁音（F） + い',
  ぐぇ: '濁音（F） + え',
  '濁音の外来音（ぉ）': '濁音（F） + お',
  '濁音の合拗音（ゎ）': 'わ + 濁音（F）',
  '合拗音（ゎ）': 'わ + 半濁音（V）',
  ふゅ: 'ゆ + 半濁音（V）',
};

test('薙刀式v18の修飾の表は、キーが修飾の中で持つ意味の文字で押し方を出す', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18')!;
  const rows = modifierRows(layout).filter((row) => row.label !== 'SandS');
  assert.deepEqual(
    Object.fromEntries(rows.map((row) => [row.label, row.trigger])),
    NAGINATA_MODIFIER_TRIGGERS,
  );
});

test('薙刀式v18の層の見出し用の押し方は、修飾の表と同じ文字になる', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18')!;
  const guideOf = (label: string) => {
    const definition = (layout.layerDefinitions ?? []).find((candidate) => candidate.label === label);
    return presentationLayerGuide(layout, definition!.id)?.triggerDisplayText;
  };
  assert.equal(guideOf('濁音'), 'J / F');
  assert.equal(guideOf('半濁音'), 'M / V');
});

test('薙刀式v18のヒートマップ（レイヤー）の見出しのトリガーは、拗音（ゃ）が[や]、濁音が[J / F]になる', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18')!;
  const geometry = buildGeometry('row-staggered');
  const trace = generateTrace('きゃ', layout, geometry, DEFAULT_TRACE_POLICY);
  const extracted = computeHeatmapLayersExtraction({
    trace,
    metrics: computeMetrics(trace, geometry),
    keyDetails: computeKeyDetails(trace, geometry),
    options: DEFAULT_HEATMAP_LAYERS_OPTIONS,
  });
  const titles = buildLayerEntries(layout, extracted, 'detail').map((entry) => entry.title);
  assert.ok(titles.includes('レイヤー6: 拗音（ゃ） [や]・同時'), titles.join('\n'));
  assert.ok(titles.includes('レイヤー4: 濁音 [J / F]・同時'), titles.join('\n'));
});

test('意味を書いていないキーは刻印を出し、層の名前と同じでも物理キーの名前に置き換えない', () => {
  const legends = new Map([['j', 'あ'], ['f', 'か'], ['h', 'く']]);
  const layout = { thumbShiftKeys: undefined, legends };
  const groups = new Map([['j', '濁音'], ['f', '濁音']]);
  assert.equal(
    triggerChordsDisplayText(layout, [{ keys: ['j'], groups }, { keys: ['f'], groups }], undefined, '濁音'),
    'あ / か',
  );
  assert.equal(triggerChordsDisplayText(layout, [['h']], undefined, 'く'), 'く');
});

test('意味はキーと修飾の組で決まり、同じキーでも組が違えば別の意味になる', () => {
  const legends = new Map([['j', 'あ'], ['h', 'く']]);
  const layout = {
    thumbShiftKeys: undefined,
    legends,
    triggerMeanings: {
      拗音: { h: { kind: 'char', text: 'や' } },
      外来音: { j: { kind: 'char', text: 'あ' } },
      濁音: { j: { kind: 'modifierKey', text: '濁音' } },
    },
  } as const;
  const text = (groups: [string, string][]) => triggerChordsDisplayText(
    layout,
    [{ keys: groups.map(([key]) => key), groups: new Map(groups) }],
  );
  assert.equal(text([['h', '拗音'], ['j', '濁音']]), 'や + 濁音（J）');
  assert.equal(text([['j', '外来音']]), 'あ');
  assert.equal(text([['j', '濁音']]), '濁音（J）');
  assert.equal(text([['j', '組なし']]), 'あ');
});
