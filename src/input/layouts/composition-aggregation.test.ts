import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGeometry } from '../shapes/geometry.ts';
import { sampleText } from '../text/samples.ts';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { attributeMetrics } from '#interpretation/attribution.ts';
import { COMBO_LAYER_ID, faceFromEntries, fromFaces, LAYOUT_BY_ID } from './index.ts';
import { faceCells, handOfKey } from './face-geometry.ts';
import { layerDefinitionsWithLabels } from './layers.ts';
import type { Face } from './types.ts';

/**
 * 文字キーを押しながら別の文字キーで打つ面（composition）を、層とコンボ枠のどちらに数えるか
 * （仕様 §11.10）。かわせみ配列+と新小梅について、面の定義が宣言する帰属先を固定する。
 */

const geometry = buildGeometry('row-staggered');
const kawasemi = LAYOUT_BY_ID.get('kawasemi-plus')!;
const koume = LAYOUT_BY_ID.get('shin-koume')!;

const compositionFaces = (faces: readonly Face[]) => faces.filter((face) => face.inputRole === 'composition');
const singleTrigger = (face: Face) => face.trigger.length === 1;

test('かわせみ配列+: 左手の行指定キーの面は層、右手1キーの面とtriggerが2キー以上の面はコンボ枠', () => {
  const faces = compositionFaces(kawasemi.faces!);
  const expected = (face: Face) => {
    if (!singleTrigger(face)) return 'combo';
    const hand = handOfKey(face.trigger[0]!);
    if (hand === 'right') return 'combo';
    // 左手1キーの面は、出力のキーも左手なら左手コンボ拡張（コンボ枠）、右手なら行指定キーの面（層）
    const outputHands = new Set([...faceCells(face).keys()].map(handOfKey));
    return outputHands.has('left') ? 'combo' : 'layer';
  };
  for (const face of faces) {
    assert.equal(face.compositionAggregation, expected(face), JSON.stringify(face.trigger));
  }
  // 行指定キーの面は、左手の文字キー14個のそれぞれに1面ずつ（トリガーのキーごとに1つの層）
  const layerFaces = faces.filter((face) => face.compositionAggregation === 'layer');
  assert.equal(layerFaces.length, 14);
  assert.equal(new Set(layerFaces.map((face) => face.trigger[0])).size, 14);
  const layerIds = layerFaces.map((face) => kawasemi.faceLayerIds!.get(face));
  assert.equal(new Set(layerIds).size, 14);
  assert.ok(layerIds.every((id) => id !== undefined && id !== COMBO_LAYER_ID));
});

test('かわせみ配列+: 左手コンボ拡張は作者が挙げる7組で、行指定キーの面とは別の面に宣言する', () => {
  // 作者の説明（KAWASEMI+.md）の左手コンボ入力: E+R=です・S+D=こと・D+F=する・F+G=ひと・Z+X=もの・X+C=から・C+V=ます
  const leftCombos = new Map<string, string>();
  for (const face of compositionFaces(kawasemi.faces!)) {
    if (!singleTrigger(face) || face.compositionAggregation !== 'combo') continue;
    if (handOfKey(face.trigger[0]!) !== 'left') continue;
    for (const [key, output] of faceCells(face)) leftCombos.set([face.trigger[0], key].sort().join('+'), output);
  }
  assert.deepEqual(Object.fromEntries([...leftCombos].sort(([a], [b]) => a.localeCompare(b))), {
    'c+v': 'ます',
    'c+x': 'から',
    'd+f': 'する',
    'd+s': 'こと',
    'e+r': 'です',
    'f+g': 'ひと',
    'x+z': 'もの',
  });
  // 左手の行指定キーの面（層）には左手の出力キーが残らない
  for (const face of compositionFaces(kawasemi.faces!)) {
    if (face.compositionAggregation !== 'layer') continue;
    assert.ok(![...faceCells(face).keys()].some((key) => handOfKey(key) === 'left'), JSON.stringify(face.trigger));
  }
});

test('新小梅: composition面14面は、すべてトリガーのキーごとの層に数える', () => {
  const faces = compositionFaces(koume.faces!);
  assert.equal(faces.length, 14);
  assert.ok(faces.every((face) => singleTrigger(face) && face.compositionAggregation === 'layer'));
  assert.equal(new Set(faces.map((face) => face.trigger[0])).size, 14);
  assert.equal(koume.layerDefinitions?.some((definition) => definition.kind === 'combo'), false);
});

for (const layout of [kawasemi, koume]) {
  for (const sampleId of ['legacy', 'modern']) {
    test(`${layout.id}/${sampleId}: 層とコンボ枠の押下数の和は押下キー数に等しく、U ≤ B`, () => {
      const text = sampleText('ja', sampleId);
      const trace = generateTrace(text, layout, geometry, DEFAULT_TRACE_POLICY);
      assert.equal(trace.skipped, 0);
      const metrics = computeMetrics(trace, geometry);
      const attribution = attributeMetrics(trace.layerDefinitions, metrics);

      // §11.10の保存則（層の押下数の和 + コンボ枠の押下数 = 押下キー数）
      const layerPresses = attribution.layers.reduce((total, layer) => total + layer.presses, 0);
      assert.equal(layerPresses + (attribution.combo?.presses ?? 0), metrics.presses);

      // §11.8: B・U・Hは同じ範囲（コンボ枠の見出し）を数える
      const { definitions, matched, hits } = metrics.combos;
      assert.ok(matched <= definitions, `U=${matched} B=${definitions}`);
      assert.ok(matched <= hits);
      if (layout === koume) assert.deepEqual(metrics.combos, { definitions: 0, matched: 0, hits: 0 });
      else assert.ok(definitions > 0 && hits > 0);
    });
  }
}

test('同じtriggerキーの層に計上するcompositionの面は、2枚置けない', () => {
  const layerFace = (key: string, output: string): Face => ({
    ...faceFromEntries(['d'], 'simultaneous', { [key]: output }),
    inputRole: 'composition',
    compositionAggregation: 'layer',
    triggerPersistence: 'single',
  });
  assert.doesNotThrow(() => fromFaces('one-layer-face', 'one-layer-face', [layerFace('j', '甲')]));
  assert.throws(
    () => fromFaces('two-layer-faces', 'two-layer-faces', [layerFace('j', '甲'), layerFace('k', '乙')]),
    /2枚以上計上できない/,
  );
});

test('かわせみ配列+: 行指定キーの14層には、作者の資料の呼び名が付き、名前は重ならない', () => {
  const labelOf = (key: string) => {
    const face = compositionFaces(kawasemi.faces!).find((candidate) =>
      candidate.compositionAggregation === 'layer' && candidate.trigger[0] === key)!;
    return layerDefinitionsWithLabels(kawasemi).find((definition) =>
      definition.id === kawasemi.faceLayerIds!.get(face))!.label;
  };
  const keys = ['a', 's', 'd', 'f', 'g', 'x', 'c', 'v', 'b', 'q', 'w', 'e', 'r', 't'];
  assert.deepEqual(keys.map(labelOf), [
    'な行', 'か行', 'さ行', 'た行', 'は行', 'ら行', 'ま行', '記号', 'ぱ行', '捨て仮名、旧かな', 'が行', 'ざ行', 'だ行', 'ば行',
  ]);
  const labels = layerDefinitionsWithLabels(kawasemi).map((definition) => definition.label);
  assert.equal(new Set(labels).size, labels.length);
});
