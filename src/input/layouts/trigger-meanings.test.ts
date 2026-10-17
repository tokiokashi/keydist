import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { comboDiagramItems, comboRows, modifierRows } from '#analyzers/keymap/layout-breakdown.ts';
import { buildLayerEntries } from '#analyzers/heatmap-layers/layer-view.ts';
import { computeHeatmapLayersExtraction } from '#analyzers/heatmap-layers/extract.ts';
import { DEFAULT_HEATMAP_LAYERS_OPTIONS } from '#analyzers/heatmap-layers/options.ts';
import { computeKeyDetails } from '#interpretation/key-detail.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { LAYOUT_BY_ID } from './index.ts';
import { triggerChordsDisplayText } from './layers.ts';

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

test('薙刀式v18のヒートマップ（レイヤー）の見出しは、トリガーを出さず、押し方の区分を番号の後ろに置く', () => {
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
  assert.ok(titles.includes('レイヤー6（同時）: 拗音（ゃ）'), titles.join('\n'));
  assert.ok(titles.includes('レイヤー4（同時）: 濁音'), titles.join('\n'));
  assert.ok(titles.every((title) => !title.includes('[')), titles.join('\n'));
});

test('意味を書いていないキーは刻印を出し、層の名前と同じでも物理キーの名前に置き換えない', () => {
  const legends = new Map([['j', 'あ'], ['f', 'か'], ['h', 'く']]);
  const layout = { legends };
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

/** 配列の全層について、ヒートマップ（レイヤー）の見出しとTraceの層の名前を読む。 */
function layerTexts(layoutId: string) {
  const layout = LAYOUT_BY_ID.get(layoutId)!;
  const geometry = buildGeometry('row-staggered');
  const trace = generateTrace('あ', layout, geometry, DEFAULT_TRACE_POLICY);
  const extracted = computeHeatmapLayersExtraction({
    trace,
    metrics: computeMetrics(trace, geometry),
    keyDetails: computeKeyDetails(trace, geometry),
    options: DEFAULT_HEATMAP_LAYERS_OPTIONS,
  });
  return {
    titles: buildLayerEntries(layout, extracted, 'detail').map((entry) => entry.title),
    traceLabels: trace.layerDefinitions.map((definition) => definition.label),
  };
}

test('新下駄の見出しは、トリガーのキーを出さない', () => {
  assert.deepEqual(layerTexts('shingeta').titles, [
    'レイヤー1: 単打',
    'レイヤー2（同時）: 中指シフト',
    'レイヤー3（同時）: 薬指シフト',
    'レイヤー4（同時）: 拗音1',
    'レイヤー5（同時）: 拗音2',
  ]);
});

test('かわせみ配列+の見出しは、トリガーのキーを出さず、コンボのトリガーは単打面の文字のまま', () => {
  const { titles } = layerTexts('kawasemi-plus');
  assert.deepEqual(titles.slice(1, 15), [
    'レイヤー2（同時）: な行',
    'レイヤー3（同時）: か行',
    'レイヤー4（同時）: さ行',
    'レイヤー5（同時）: た行',
    'レイヤー6（同時）: は行',
    'レイヤー7（同時）: ら行',
    'レイヤー8（同時）: ま行',
    'レイヤー9（同時）: 記号',
    'レイヤー10（同時）: ぱ行',
    'レイヤー11（同時）: 捨て仮名、旧かな',
    'レイヤー12（同時）: が行',
    'レイヤー13（同時）: ざ行',
    'レイヤー14（同時）: だ行',
    'レイヤー15（同時）: ば行',
  ]);
  assert.deepEqual(titles.slice(15), ['レイヤー16（同時）: 右親指', 'レイヤー17（同時）: 左親指']);

  const layout = LAYOUT_BY_ID.get('kawasemi-plus')!;
  assert.deepEqual(comboRows(layout, undefined).slice(0, 5).map((row) => row.trigger), ['し', 'と', 'る', 'ま', 'で']);
  assert.deepEqual(comboDiagramItems(layout, undefined).slice(0, 5).map((item) => item.label), ['し', 'と', 'る', 'ま', 'で']);
});

test('シン蜂蜜小梅の文字キー同時押しの層は、出るかなの1文字目を名前に出し、トリガーを重ねない', () => {
  const { titles, traceLabels } = layerTexts('shin-koume');
  assert.deepEqual(titles.slice(3), [
    'レイヤー4（同時）: 半濁音',
    'レイヤー5（同時）: ひ・び',
    'レイヤー6（同時）: き・ぎ',
    'レイヤー7（同時）: つ・に・づ',
    'レイヤー8（同時）: ぴ・ぱ',
    'レイヤー9（同時）: ふ・ぶ',
    'レイヤー10（同時）: く・い・ぐ',
    'レイヤー11（同時）: り・し・じ',
    'レイヤー12（同時）: 外来音（ぅ）',
    'レイヤー13（同時）: み',
    'レイヤー14（同時）: う・ヴ',
    'レイヤー15（同時）: て・で',
    'レイヤー16（同時）: ち・ぢ',
    'レイヤー17（同時）: 外来音（ぉ）',
  ]);
  assert.ok(traceLabels.includes('く・い・ぐ'));
  assert.deepEqual(titles.slice(0, 3), ['レイヤー1: 単打', 'レイヤー2（同時）: 左親指', 'レイヤー3（同時）: 右親指']);
});
