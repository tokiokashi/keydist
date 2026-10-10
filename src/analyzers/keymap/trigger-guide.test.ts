import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import { sampleText } from '#input/text/samples.ts';
import type { Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import type { Layout } from '#input/layouts/types.ts';
import { triggerGuide, type TriggerTone } from './trigger-guide.ts';

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

const slotOf = (tone: TriggerTone | undefined) => (tone?.kind === 'layer' ? tone.slot : undefined);

test('宣言のある配列の全レイヤー詳細: トリガーはレイヤーの色を持ち、凡例にレイヤーごとの項目が並ぶ', () => {
  const guide = triggerGuide(resolvedLayout('naginata-v18'), 'detail');
  assert.ok(guide.keyTones.size > 0);
  const tones = [...guide.keyTones.values()];
  assert.ok(tones.every((tone) => tone.kind === 'layer' && tone.slot >= 1 && tone.slot <= 8));
  assert.equal(guide.legend.length, 30);
  assert.equal(guide.legend.some((item) => item.id === 'combo' || item.id === 'other-layers'), false);
  assert.match(guide.legend[0]!.label, /^レイヤー\d+の/);
});

test('宣言のある配列のまとめる表示: 凡例は残すレイヤーと「それ以外のレイヤー」だけになり、まとめられる側は中立の色になる', () => {
  const layout = resolvedLayout('naginata-v18');
  const guide = triggerGuide(layout, 'compact');
  assert.deepEqual(guide.legend.map((item) => item.id), ['layer:SandS', 'other-layers']);
  assert.equal(guide.legend[1]!.label, 'それ以外のレイヤー');
  assert.deepEqual(guide.legend[1]!.tone, { kind: 'others' });
  const detail = triggerGuide(layout, 'detail');
  // 残すレイヤーの色の番号は、全レイヤー詳細と同じ
  assert.equal(slotOf(guide.keyTones.get('thumb-l')), slotOf(detail.keyTones.get('thumb-l')));
  assert.notEqual(slotOf(guide.keyTones.get('thumb-l')), undefined);
  assert.deepEqual(guide.keyTones.get('q'), { kind: 'others' });
  assert.ok([...guide.keyTones.values()].every((tone) => tone.kind !== 'layer' || tone.slot === slotOf(detail.keyTones.get('thumb-l'))));
});

test('まとめる表示: 1キーのトリガーを選ぶと、残すレイヤーはその色、まとめられる側は中立の色を返す', () => {
  const guide = triggerGuide(resolvedLayout('naginata-v18'), 'compact');
  assert.deepEqual(guide.toneOfSelected(['q']), { kind: 'others' });
  assert.equal(slotOf(guide.toneOfSelected(['thumb-l'])), slotOf(guide.keyTones.get('thumb-l')));
  assert.equal(guide.toneOfSelected([]), undefined);
  assert.equal(guide.toneOfSelected(['no-such-key']), undefined);
});

test('全レイヤー詳細: 1キーのトリガーを選ぶと、そのレイヤーの色の番号を返す', () => {
  const guide = triggerGuide(resolvedLayout('naginata-v18'), 'detail');
  assert.equal(slotOf(guide.toneOfSelected(['q'])), slotOf(guide.keyTones.get('q')));
  assert.notEqual(slotOf(guide.toneOfSelected(['q'])), undefined);
});

test('同じキーが残すレイヤーとまとめられる側の両方のトリガーなら、残すレイヤーの色にする', () => {
  const base = resolvedLayout('naginata-v18');
  const compact = base.layerViewPresentation!.compact!;
  // 濁音のレイヤーを残す側にすると、濁音と他のレイヤーが共有する j は残す側の色になる
  const layout: Layout = {
    ...base,
    layerViewPresentation: { compact: { ...compact, keepLayerIds: [...compact.keepLayerIds, 'layer:濁音'] } },
  };
  const guide = triggerGuide(layout, 'compact');
  const detail = triggerGuide(layout, 'detail');
  assert.equal(guide.keyTones.get('j')?.kind, 'layer');
  assert.equal(slotOf(guide.keyTones.get('j')), slotOf(detail.keyTones.get('j')));
  assert.equal(guide.keyTones.get('h')?.kind, 'others');
});

test('宣言の無い配列: まとめる設定でも全レイヤー詳細と同じ。レイヤーとコンボの両方を持つ配列は、コンボのキーが選択の色で、凡例の最後にコンボが付く', () => {
  const layout = resolvedLayout('kawasemi-plus');
  const guide = triggerGuide(layout, 'compact');
  const detail = triggerGuide(layout, 'detail');
  assert.deepEqual(guide.keyTones, detail.keyTones);
  assert.deepEqual(guide.legend, detail.legend);
  const comboKeys = [...guide.keyTones].filter(([, tone]) => tone.kind === 'selection');
  assert.ok(comboKeys.length > 0);
  assert.equal(guide.legend.at(-1)?.id, 'combo');
  assert.equal(guide.legend.some((item) => item.id === 'other-layers'), false);
});

test('レイヤーもコンボも持たない配列: トリガーのキーも凡例も無い', () => {
  const guide = triggerGuide(resolvedLayout('qwerty', 'en'), 'compact');
  assert.equal(guide.legend.length, 0);
  assert.equal(guide.toneOfSelected(['shift-l']), undefined);
});
