import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import { sampleText } from '#input/text/samples.ts';
import type { Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import { triggerGuide } from './trigger-guide.ts';

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

/** アプリと同じ経路（評価するテキストの打ち方で絞った配列）を得る。 */
function resolvedLayout(layoutId: string, language: 'ja' | 'en' = 'ja') {
  const setup: Setup = { id: 'setup-guide', number: 1, layoutId, shapeId: 'row-staggered' };
  const result = resolveEngineInput({
    target: { kind: 'setup', setupId: setup.id },
    setups: new Map([[setup.id, setup]]),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: sampleText(language, language === 'ja' ? 'legacy' : 'default'),
    language,
  });
  assert.ok(result.ok);
  if (!result.ok) throw new Error('unreachable');
  return result.input.layout;
}

test('レイヤーだけを持つ配列: レイヤーのトリガーはレイヤーの色の番号を持ち、凡例にレイヤーごとの項目が並ぶ', () => {
  const guide = triggerGuide(resolvedLayout('naginata-v18'));
  assert.ok(guide.keySlots.size > 0);
  const slots = [...guide.keySlots.values()];
  assert.ok(slots.every((slot) => slot !== undefined && slot >= 1 && slot <= 8));
  assert.ok(guide.legend.length > 0);
  assert.equal(guide.legend.some((item) => item.id === 'combo'), false);
  assert.deepEqual(new Set(guide.legend.map((item) => item.slot)), new Set(slots));
  assert.match(guide.legend[0]!.label, /^レイヤー\d+の/);
});

test('レイヤーとコンボの両方を持つ配列: コンボのキーは選択の色で、凡例の最後にコンボが付く', () => {
  const guide = triggerGuide(resolvedLayout('kawasemi-plus'));
  const comboKeys = [...guide.keySlots].filter(([, slot]) => slot === undefined);
  assert.ok(comboKeys.length > 0);
  assert.equal(guide.legend.at(-1)?.id, 'combo');
  assert.equal(guide.legend.at(-1)?.slot, undefined);
});

test('1キーでレイヤーに切り替わるトリガーを選ぶと、そのレイヤーの色の番号を返す', () => {
  const layout = resolvedLayout('naginata-v18');
  const guide = triggerGuide(layout);
  const [key, slot] = [...guide.keySlots].find(([id, value]) => value !== undefined && guide.slotOfSelected([id]) !== undefined)!;
  assert.equal(guide.slotOfSelected([key]), slot);
  assert.equal(guide.slotOfSelected([]), undefined);
  assert.equal(guide.slotOfSelected(['no-such-key']), undefined);
});

test('レイヤーもコンボも持たない配列: トリガーのキーも凡例も無い', () => {
  const guide = triggerGuide(resolvedLayout('qwerty', 'en'));
  assert.equal(guide.legend.length, 0);
  assert.equal(guide.slotOfSelected(['shift-l']), undefined);
});
