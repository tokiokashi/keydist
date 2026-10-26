import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import {
  keyPatternKeyDescription,
  keyPatternSelectionView,
  KEY_PATTERN_CONTINUATION_DESCRIPTION,
  KEY_PATTERN_OUTPUT_DESCRIPTION,
  KEY_PATTERN_PROMPT,
  toggleSelectedKey,
} from './key-pattern-selection.ts';
import { fixedTestText } from '../../../test/kana-test-text.ts';

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

/** アプリと同じ経路（評価するテキストの打ち方で絞った配列）を得る。 */
function resolvedLayout(layoutId: string, language: 'ja' | 'en') {
  const setup: Setup = { id: 'setup-picker', number: 1, layoutId, shapeId: 'row-staggered' };
  const result = resolveEngineInput({
    target: { kind: 'setup', setupId: setup.id },
    setups: new Map([[setup.id, setup]]),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: fixedTestText(language),
    language,
  });
  assert.ok(result.ok);
  if (!result.ok) throw new Error('unreachable');
  return result.input.layout;
}

test('選択の切り替え: 同じキーで外れ、残りの順は保たれる', () => {
  assert.deepEqual(toggleSelectedKey([], 'j'), ['j']);
  assert.deepEqual(toggleSelectedKey(['j', 'l'], 'm'), ['j', 'l', 'm']);
  assert.deepEqual(toggleSelectedKey(['j', 'l', 'm'], 'l'), ['j', 'm']);
});

test('キーを選んでいない時は、キーを選ぶよう促す文だけを出す', () => {
  const view = keyPatternSelectionView(resolvedLayout('oonishi-custom', 'ja'), []);
  assert.equal(view.message, KEY_PATTERN_PROMPT);
  assert.equal(view.candidateLegends.size, 0);
  assert.equal(view.continuationKeys.size, 0);
});

test('3キーのコンボは、1キーずつ選ぶと出る文字までたどれる（大西配列のカスタム・日本語）', () => {
  const layout = resolvedLayout('oonishi-custom', 'ja');
  // 語彙拡張: 物理キーのj・l・mを同時に押す（ローマ字のd + s + t）→ desita
  const one = keyPatternSelectionView(layout, ['j']);
  assert.ok(one.continuationKeys.has('l'));

  const two = keyPatternSelectionView(layout, ['j', 'l']);
  assert.equal(two.exactOutputs.includes('desita'), false);
  assert.equal(two.candidateLegends.get('m')?.split(' / ').includes('desita'), true);
  assert.ok(two.continuationKeys.has('m'));

  const three = keyPatternSelectionView(layout, ['j', 'l', 'm']);
  assert.ok(three.exactOutputs.includes('desita'));
  assert.match(three.message, /^確定: /);
});

test('英文を打つ時は、ローマ字で打つ時だけのコンボをたどれない', () => {
  const layout = resolvedLayout('oonishi-custom', 'en');
  const one = keyPatternSelectionView(layout, ['j']);
  assert.equal(one.continuationKeys.has('l'), false);
  const two = keyPatternSelectionView(layout, ['j', 'l']);
  assert.equal(two.candidateLegends.size, 0);
});

test('シフトのキーを選ぶと、そのレイヤーで出る文字が候補に出る', () => {
  const layout = resolvedLayout('qwerty', 'en');
  const view = keyPatternSelectionView(layout, ['shift-l']);
  assert.equal(view.candidateLegends.get('a'), 'A');
  assert.equal(view.exactOutputs.length, 0);
});

test('出る文字が無い組み合わせは、その旨を出す', () => {
  const layout = resolvedLayout('qwerty', 'en');
  const view = keyPatternSelectionView(layout, ['a', 's']);
  assert.equal(view.message, 'このキーの組み合わせで出る文字はありません。');
});

test('読み上げの説明: 続けて押せるキーには続けて押せると足し、あと1キーで決まるキーには出力が決まる旨だけを足す', () => {
  const layout = resolvedLayout('oonishi-custom', 'ja');
  const one = keyPatternSelectionView(layout, ['j']);
  const continuationOnly = [...one.continuationKeys].find((key) => !one.candidateLegends.has(key));
  assert.ok(continuationOnly !== undefined);
  assert.equal(keyPatternKeyDescription(one, continuationOnly), KEY_PATTERN_CONTINUATION_DESCRIPTION);
  assert.equal(keyPatternKeyDescription(one, 'z'), undefined);

  // m は続けて押せるキーにも候補にも含まれるので、説明は候補の旨だけになる
  const two = keyPatternSelectionView(layout, ['j', 'l']);
  assert.ok(two.continuationKeys.has('m'));
  assert.ok(two.candidateLegends.has('m'));
  assert.equal(keyPatternKeyDescription(two, 'm'), KEY_PATTERN_OUTPUT_DESCRIPTION);
});
