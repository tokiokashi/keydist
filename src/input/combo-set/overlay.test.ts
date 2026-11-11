import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '../layouts/index.ts';
import { toLayout, type AlphaFaceUserLayout } from '../layouts/user-layouts.ts';
import { QWERTY_LEGEND } from '../shapes/geometry.ts';
import type { ComboSet } from './combo-set.ts';
import { applyComboSet, layoutTriggerKeys } from './overlay.ts';

const IDENTITY_OUTPUTS: Record<string, string> = Object.fromEntries(QWERTY_LEGEND.flatMap((row) => [...row].map((key) => [key, key])));

/** `f`を押しながら打つ面を持つ、英字の種類の配列。`f`は層のトリガー、`q` `w`の面の出力は2文字の綴り。 */
const LAYER_BY_LETTER: AlphaFaceUserLayout = {
  id: 'user-letter-trigger',
  name: '英字のトリガー',
  kind: 'alpha',
  faces: [
    { trigger: [], inputRole: 'layer', outputs: IDENTITY_OUTPUTS },
    { trigger: ['f'], mode: 'simultaneous', triggerPersistence: 'single', inputRole: 'layer', outputs: { q: 'ka', w: 'si' } },
  ],
  romaji: 'kunrei',
};

const set = (combos: ComboSet['combos']): ComboSet => ({ id: 'x', name: 'x', romajiRuleId: 'kunrei', combos });

test('通常の英字配列は、Shift以外のトリガーを持たず、字のキーはどれも重ねられる', () => {
  const qwerty = LAYOUT_BY_ID.get('qwerty')!;
  assert.deepEqual([...layoutTriggerKeys(qwerty)].sort(), ['shift-l', 'shift-r']);
  const overlay = applyComboSet(qwerty, set([{ keys: ['s', 't'], output: 'site' }]));
  assert.equal(overlay.applied, 1);
  assert.deepEqual(overlay.dropped, []);
  assert.equal(overlay.layout.id, qwerty.id);
  assert.equal(overlay.layout.canonicalInputs.get('site')?.length, 1);
});

test('層のトリガーに使うキーを押すコンボは、配列のsemanticから判定して外す', () => {
  const layout = toLayout(LAYER_BY_LETTER);
  assert.ok(layoutTriggerKeys(layout).has('f'));
  const overlay = applyComboSet(
    layout,
    set([
      { keys: ['f', 'j'], output: 'ka' },
      { keys: ['j', 'k'], output: 'ne' },
    ]),
  );
  assert.deepEqual(
    overlay.dropped.map((item) => [item.combo.output, item.reason]),
    [['ka', 'trigger-key']],
  );
  assert.equal(overlay.applied, 1);
  assert.ok(overlay.layout.canonicalInputs.has('ne'));
  assert.equal(
    overlay.layout.canonicalInputs.get('ne')?.some((alternative) => alternative.origin === 'combo'),
    true,
  );
});

test('配列がその字を1キーで出せないコンボは、字を解決できないものとして外す', () => {
  const qwerty = LAYOUT_BY_ID.get('qwerty')!;
  // 日本語の出力しか持たない配列には、英字を出すキーが無い
  const nicola = LAYOUT_BY_ID.get('nicola')!;
  const overlay = applyComboSet(nicola, set([{ keys: ['s', 't'], output: 'site' }]));
  assert.deepEqual(
    overlay.dropped.map((item) => item.reason),
    ['key-unresolved'],
  );
  assert.equal(overlay.layout, nicola);
  assert.equal(applyComboSet(qwerty, set([])).layout, qwerty);
});
