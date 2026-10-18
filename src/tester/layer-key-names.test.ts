import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT_BY_ID, type Layout } from '#input/layouts/index.ts';
import { advanceKeyPatternPresentation, EMPTY_KEY_PATTERN_PRESENTATION_STATE } from '#input/layouts/key-pattern-picker.ts';
import { compactLayerGuideDefinitions } from '#input/layouts/layers.ts';
import { TypingInputEngine, type RecognizedTypingInput } from './engine/index.ts';
import { layerCardTitle, pressedKeyNames, recognizedActionKeyNames, type LayerKeyNaming } from './layer-key-names.ts';
import { reverseLookup, reverseLookupGuideActionLabel, reverseLookupGuideActions, reverseLookupRouteLabel } from './reverse-lookup.ts';

const NAMINGS: readonly LayerKeyNaming[] = ['authored', 'key-name', 'legend'];

function layoutOf(id: string): Layout {
  const layout = LAYOUT_BY_ID.get(id);
  assert.ok(layout, id);
  return layout;
}

/** キー操作を順に流し、操作ごとの認識結果と、画面のPressedが読む状態を返す。 */
function play(layout: Layout, events: readonly ['down' | 'up', string][]) {
  const engine = new TypingInputEngine(layout.canonicalInputs, { triggerRealizationPolicy: { useHold: true } });
  let presentation = EMPTY_KEY_PATTERN_PRESENTATION_STATE;
  return events.map(([type, key]) => {
    const result = engine.handle({ type, key });
    presentation = advanceKeyPatternPresentation(layout, presentation, { type, key }, result);
    return { result, presentation };
  });
}

const recognizedLabel = (layout: Layout, recognized: RecognizedTypingInput, naming: LayerKeyNaming) =>
  recognizedActionKeyNames(layout, recognized.actions, naming).map((names) => names.keys.join(' + '));

test('新下駄の中指シフトは、カード・逆引き・Pressed・Recognizedで同じ呼び名になる', () => {
  const layout = layoutOf('shingeta');
  const card = compactLayerGuideDefinitions(layout).find((definition) => definition.label === '中指シフト');
  assert.ok(card);
  assert.equal(layerCardTitle(layout, card.id, card.label, 'authored'), '中指シフト');

  const route = reverseLookup(layout, 'ご')[0];
  assert.ok(route);
  assert.equal(reverseLookupRouteLabel(layout, route, undefined, 'authored'), '中指シフト + W');
  assert.equal(reverseLookupGuideActionLabel(layout, reverseLookupGuideActions(route)[0]!, undefined, 'authored'), '中指シフト + W');

  const steps = play(layout, [
    ['down', 'k'],
    ['down', 'w'],
  ]);
  assert.deepEqual(pressedKeyNames(layout, steps[0].result.pressedKeys, steps[0].presentation.activeTriggers, 'authored'), ['中指シフト']);
  assert.deepEqual(recognizedLabel(layout, steps[1].result.recognized[0]!, 'authored'), ['中指シフト + W']);
});

test('呼び名の種類を切り替えると、トリガーキーの名前だけが変わり、文字を出したキーは変わらない', () => {
  const layout = layoutOf('shingeta');
  const route = reverseLookup(layout, 'ご')[0];
  assert.ok(route);
  assert.deepEqual(
    NAMINGS.map((naming) => reverseLookupRouteLabel(layout, route, undefined, naming)),
    ['中指シフト + W', 'K + W', 'い + W'],
  );

  const steps = play(layout, [
    ['down', 'k'],
    ['down', 'w'],
  ]);
  assert.deepEqual(
    NAMINGS.map((naming) => pressedKeyNames(layout, steps[0].result.pressedKeys, steps[0].presentation.activeTriggers, naming)),
    [['中指シフト'], ['K'], ['い']],
  );
  assert.deepEqual(
    NAMINGS.map((naming) => recognizedLabel(layout, steps[1].result.recognized[0]!, naming)),
    [['中指シフト + W'], ['K + W'], ['い + W']],
  );

  const card = compactLayerGuideDefinitions(layout).find((definition) => definition.label === '中指シフト');
  assert.ok(card);
  assert.deepEqual(
    NAMINGS.map((naming) => layerCardTitle(layout, card.id, card.label, naming)),
    ['中指シフト', 'K / D', 'い / か'],
  );
});

test('NICOLAの親指シフトは作者の呼び名「左親指」「右親指」で出て、刻印は無変換・変換のまま', () => {
  const layout = layoutOf('nicola');
  const titles = (naming: LayerKeyNaming) => compactLayerGuideDefinitions(layout).map((card) => layerCardTitle(layout, card.id, card.label, naming));
  assert.deepEqual(titles('authored'), ['左親指', '右親指']);
  assert.deepEqual(titles('key-name'), ['左親指', '右親指']);
  assert.deepEqual(titles('legend'), ['無変換', '変換']);

  const route = reverseLookup(layout, 'が')[0];
  assert.ok(route);
  assert.deepEqual(
    NAMINGS.map((naming) => reverseLookupRouteLabel(layout, route, undefined, naming)),
    ['右親指 + W', '右親指 + W', '変換 + W'],
  );
});

test('新JISのシフトは作者の呼び名「Shift」で出て、左右どちらでもよい親指は刻印かキー名で出す', () => {
  const layout = layoutOf('shin-jis-simultaneous');
  const route = reverseLookup(layout, 'ぁ')[0];
  assert.ok(route);
  assert.deepEqual(
    NAMINGS.map((naming) => reverseLookupRouteLabel(layout, route, undefined, naming)),
    ['Shift + Q', '左親指 / 右親指 + Q', 'Space + Q'],
  );

  // 実際に押した親指は、左右どちらかが分かる
  const steps = play(layout, [
    ['down', 'thumb-r'],
    ['down', 'q'],
  ]);
  assert.deepEqual(
    NAMINGS.map((naming) => pressedKeyNames(layout, steps[0].result.pressedKeys, steps[0].presentation.activeTriggers, naming)),
    [['Shift'], ['右親指'], ['Space']],
  );
  assert.deepEqual(recognizedLabel(layout, steps[1].result.recognized[0]!, 'authored'), ['Shift + Q']);
});

test('押したままのトリガーキーも同じ呼び名で出す', () => {
  const layout = layoutOf('shin-jis-simultaneous');
  const steps = play(layout, [
    ['down', 'thumb-r'],
    ['down', 'q'],
    ['up', 'q'],
    ['down', 'w'],
  ]);
  const continued = steps[3].result.recognized[0];
  assert.ok(continued);
  const action = continued.actions[0]!;
  assert.deepEqual(action.heldKeys, ['thumb-r']);
  assert.deepEqual(
    NAMINGS.map((naming) => recognizedActionKeyNames(layout, continued.actions, naming)[0]!.held),
    [['Shift'], ['右親指'], ['Space']],
  );
});

test('層の名前を持たないトリガーキーは、どの種類でもキー名で出す', () => {
  const layout = layoutOf('naginata-v18');
  const route = reverseLookup(layout, 'ぎゃ')[0];
  assert.ok(route);
  const names = NAMINGS.map((naming) => reverseLookupRouteLabel(layout, route, undefined, naming));
  assert.equal(names[0], names[1]);
});

test('同じ作者の呼び名が別のキーに付く時は、キー名を添えて見分ける', () => {
  const layout = layoutOf('shingeta');
  // 「ふぁ」は左手側の中指シフト（K）、「あ」は右手側の中指シフト（D）で打つ
  const route = reverseLookup(layout, 'ふぁあ')[0];
  assert.ok(route);
  assert.equal(reverseLookupRouteLabel(layout, route, undefined, 'authored'), '中指シフト（K） + Q → 中指シフト（D） + J');
  assert.equal(reverseLookupRouteLabel(layout, route, undefined, 'key-name'), 'K + Q → D + J');

  // 同じキーを繰り返す経路には添えない
  const repeated = reverseLookup(layout, 'ふぁふぁ')[0];
  assert.ok(repeated);
  assert.equal(reverseLookupRouteLabel(layout, repeated, undefined, 'authored'), '中指シフト + Q → 中指シフト + Q');
});

test('トリガーとして働かなかった打鍵では、同じキーを文字のキーとして出す', () => {
  const layout = layoutOf('shingeta');
  // Lは薬指シフトのトリガーだが、「し」を単打で出す時は文字のキー
  const single = reverseLookup(layout, 'し')[0];
  assert.ok(single);
  assert.deepEqual(
    NAMINGS.map((naming) => reverseLookupRouteLabel(layout, single, undefined, naming)),
    ['L', 'L', 'L'],
  );
});
