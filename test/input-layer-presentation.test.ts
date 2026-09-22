import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeModifierAggregationGroupIds,
  aggregationLegendMap,
  aggregationTriggerKeys,
  compactLayerGuideDefinitions,
  modifierPhysicalKeys,
  presentationTriggerColorSlots,
  semanticCombinationLabels,
} from '../src/layers.ts';
import {
  faceFromEntries,
  fromFaces,
  fromRows,
  withShiftedOutputs,
  type Face,
} from '../src/layouts/index.ts';
import { NAGINATA_V18 } from '../src/layouts/naginata.ts';
import { TSUKI_2_263 } from '../src/layouts/tsuki-2-263.ts';

test('active modifier aggregationはcanonical rolesを使い複合modifierを優先する', () => {
  const base: Face = {
    ...faceFromEntries([], 'simultaneous', { h: 'H', j: 'J' }),
    inputRole: 'layer',
  };
  const single: Face = {
    ...faceFromEntries(['d'], 'simultaneous', { h: 'X' }),
    layer: 'single-shift',
    role: 'modifier',
    inputRole: 'modifier',
    triggerPersistence: 'single',
  };
  const compound: Face = {
    ...faceFromEntries(['d', 'f'], 'simultaneous', { h: 'Y' }),
    layer: 'compound-shift',
    role: 'modifier',
    inputRole: 'modifier',
    triggerPersistence: 'single',
    modifierGroups: { d: 'D', f: 'F' },
  };
  const layout = fromFaces('presentation-active', 'presentation-active', [base, single, compound]);

  assert.deepEqual(activeModifierAggregationGroupIds(layout, ['d']), ['layer:single-shift']);
  assert.deepEqual(activeModifierAggregationGroupIds(layout, ['d', 'f']), ['layer:compound-shift']);
  assert.equal(aggregationLegendMap(layout, 'layer:single-shift').get('h'), 'X');
  assert.deepEqual([...aggregationTriggerKeys(layout, 'layer:compound-shift')].sort(), ['d', 'f']);
  assert.equal(modifierPhysicalKeys(layout).has('d'), true);
  assert.equal(modifierPhysicalKeys(layout).has('f'), true);
});

test('Faceを持たない通常Shiftもcanonical aggregationからlegendを表示できる', () => {
  const base = fromRows('alpha', 'alpha', [
    '1234567890-=',
    'qwertyuiop[]',
    "asdfghjkl;'",
    'zxcvbnm,./',
  ], {});
  const layout = withShiftedOutputs(base);

  assert.deepEqual(activeModifierAggregationGroupIds(layout, ['shift-l']), ['layer:Shift']);
  assert.equal(aggregationLegendMap(layout, 'layer:Shift').get('a'), 'A');
  assert.deepEqual(aggregationTriggerKeys(layout, 'layer:Shift'), ['shift-l', 'shift-r']);
});


test('compact layer guideはlayout presentation policyに従い薙刀式ではSandS 1面だけ出す', () => {
  assert.deepEqual(
    compactLayerGuideDefinitions(NAGINATA_V18).map((definition) => definition.id),
    ['layer:SandS'],
  );
});

test('presentation trigger colorはlegacy layer series順を再利用する', () => {
  const colors = presentationTriggerColorSlots(TSUKI_2_263);
  assert.equal(colors.get('d'), colors.get('k'));
  assert.equal(typeof colors.get('d'), 'number');
  assert.ok((colors.get('d') ?? 0) >= 1);
});


test('薙刀式のcompactカンペはSandS 1面とsemantic group labelへ畳む', () => {
  assert.deepEqual(
    compactLayerGuideDefinitions(NAGINATA_V18).map((definition) => definition.label),
    ['SandS'],
  );

  const labels = semanticCombinationLabels(NAGINATA_V18);
  for (const expected of ['小書き', '濁音', '半濁音', '拗音', '外来音']) {
    assert.ok(labels.includes(expected), expected);
  }
});

test('月配列の起点triggerは同じsemantic layer色を共有する', () => {
  const colors = presentationTriggerColorSlots(TSUKI_2_263);
  assert.equal(colors.get('d'), colors.get('k'));
  assert.notEqual(colors.get('d'), undefined);
});


test('薙刀式のレイヤーキー色は実レイヤーのSandSだけに限定する', () => {
  const colors = presentationTriggerColorSlots(NAGINATA_V18);
  assert.equal(colors.get('thumb-r'), colors.get('thumb-l'));
  assert.equal(typeof colors.get('thumb-r'), 'number');
  for (const key of ['j', 'f', 'q', 'h', 'p', 'i', 'o', 'k', 'n']) {
    assert.equal(colors.get(key), undefined, key);
  }
});
