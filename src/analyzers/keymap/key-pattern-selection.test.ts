import assert from 'node:assert/strict';
import test from 'node:test';
import { LOADED_LAYOUT_BY_ID } from '../../../test/kanji-direct-tables.ts';
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
  layouts: LOADED_LAYOUT_BY_ID,
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
  const layout = resolvedLayout('tk-onchoku', 'ja');
  assert.deepEqual(toggleSelectedKey(layout, [], 'j'), ['j']);
  assert.deepEqual(toggleSelectedKey(layout, ['j', 'l'], 'm'), ['j', 'l', 'm']);
  assert.deepEqual(toggleSelectedKey(layout, ['j', 'l', 'm'], 'l'), ['j', 'm']);
});

test('順次打鍵の配列は、1打目のキーを選ぶと、その1打目から始まる字が2打目のキーの位置に出る（T-Code）', () => {
  const layout = resolvedLayout('tcode', 'ja');
  // 出典の表: 1打目がlの表の、2打目が4の欄が「漢」
  const first = keyPatternSelectionView(layout, ['l']);
  assert.equal(first.candidateLegends.get('4'), '漢');
  assert.equal(first.exactOutputs.length, 0);
  // 1打目がlの表は、割り当てのある欄だけが候補になる（2打目が6の欄は空）
  assert.equal(first.candidateLegends.has('6'), false);
  assert.ok(first.candidateLegends.size > 30);

  const second = keyPatternSelectionView(layout, ['l', '4']);
  assert.deepEqual(second.exactOutputs, ['漢']);
});

test('順次打鍵の配列は、同じキーを続けて打つ字も選べ、続けて押せないキーは選び直しになる（T-Code）', () => {
  const layout = resolvedLayout('tcode', 'ja');
  // 1打目がq、2打目がqの欄が「果」
  assert.deepEqual(toggleSelectedKey(layout, ['q'], 'q'), ['q', 'q']);
  assert.deepEqual(keyPatternSelectionView(layout, ['q', 'q']).exactOutputs, ['果']);
  // 確定した並びの後に別のキーを選ぶと、そのキーを1打目にして選び直す
  assert.deepEqual(toggleSelectedKey(layout, ['l', '4'], 'q'), ['q']);
  // 1打目のキーをもう一度選ぶと外れる（1打目が1の表の、2打目が1の欄は空）
  assert.deepEqual(toggleSelectedKey(layout, ['1'], '1'), []);
});

test('順次打鍵の配列は、3打の字を1打目から順に選び、2打目の空白キーも選べる（TUT-Code）', () => {
  const layout = resolvedLayout('tut-code', 'ja');
  // 出典の表: 嫌は、q → v → iの3打
  const first = keyPatternSelectionView(layout, ['q']);
  assert.equal(first.exactOutputs.length, 0);
  assert.ok(first.continuationKeys.has('v'));
  const second = keyPatternSelectionView(layout, ['q', 'v']);
  assert.equal(second.exactOutputs.length, 0);
  assert.ok(second.candidateLegends.get('i')?.includes('嫌'));
  assert.deepEqual(toggleSelectedKey(layout, ['q', 'v'], 'i'), ['q', 'v', 'i']);
  assert.deepEqual(keyPatternSelectionView(layout, ['q', 'v', 'i']).exactOutputs, ['嫌']);
  // 2打目に空白キー（右親指）を選ぶと、1打目がeの「ー」が決まる
  assert.ok(keyPatternSelectionView(layout, ['e']).continuationKeys.has('thumb-r'));
  assert.deepEqual(toggleSelectedKey(layout, ['e'], 'thumb-r'), ['e', 'thumb-r']);
  assert.deepEqual(keyPatternSelectionView(layout, ['e', 'thumb-r']).exactOutputs, ['ー']);
});

test('かなの同時押しと漢字の順次打鍵を持つ配列は、同時押しの組も、空白キーのステップを含む熟語も選べる（雪華）', () => {
  const layout = resolvedLayout('secca', 'ja');
  const choose = (keys: readonly string[]): readonly string[] =>
    keys.reduce<readonly string[]>((selected, key) => toggleSelectedKey(layout, selected, key), []);
  // かな: jとwの同時押しがぎ、空白キーとeの同時押しがり
  assert.deepEqual(choose(['j', 'w']), ['j', 'w']);
  assert.deepEqual(keyPatternSelectionView(layout, ['j', 'w']).exactOutputs, ['ぎ']);
  assert.deepEqual(choose(['thumb-r', 'e']), ['thumb-r', 'e']);
  assert.deepEqual(keyPatternSelectionView(layout, ['thumb-r', 'e']).exactOutputs, ['り']);
  // 漢字: fとdとjの順で朝、dとfとjの順で元
  assert.deepEqual(choose(['f', 'd', 'j']), ['f', 'd', 'j']);
  assert.deepEqual(keyPatternSelectionView(layout, ['f', 'd', 'j']).exactOutputs, ['朝']);
  assert.deepEqual(keyPatternSelectionView(layout, ['d', 'f', 'j']).exactOutputs, ['元']);
  // 熟語: dとfの後に空白キーを打ち、kで人間
  assert.deepEqual(choose(['d', 'f', 'thumb-r', 'k']), ['d', 'f', 'thumb-r', 'k']);
  assert.deepEqual(keyPatternSelectionView(layout, ['d', 'f', 'thumb-r', 'k']).exactOutputs, ['人間']);
});

test('キーを選んでいない時は、キーを選ぶよう促す文だけを出す', () => {
  const view = keyPatternSelectionView(resolvedLayout('tk-onchoku', 'ja'), []);
  assert.equal(view.message, KEY_PATTERN_PROMPT);
  assert.equal(view.candidateLegends.size, 0);
  assert.equal(view.continuationKeys.size, 0);
});

test('3キーのコンボは、1キーずつ選ぶと出る文字までたどれる（大西配列のカスタム・日本語）', () => {
  const layout = resolvedLayout('tk-onchoku', 'ja');
  // 語彙拡張: 物理キーのk・l・mを同時に押す（ローマ字のd + s + n）→ desita
  const one = keyPatternSelectionView(layout, ['k']);
  assert.ok(one.continuationKeys.has('l'));

  const two = keyPatternSelectionView(layout, ['k', 'l']);
  assert.equal(two.exactOutputs.includes('desita'), false);
  assert.equal(two.candidateLegends.get('m')?.split(' / ').includes('desita'), true);
  assert.ok(two.continuationKeys.has('m'));

  const three = keyPatternSelectionView(layout, ['k', 'l', 'm']);
  assert.ok(three.exactOutputs.includes('desita'));
  assert.match(three.message, /^確定: /);
});

test('物理キーのj・l・m（ローマ字のd + s + t）を同時に押しても desita にならない（大西配列のカスタム・日本語）', () => {
  const layout = resolvedLayout('tk-onchoku', 'ja');
  const view = keyPatternSelectionView(layout, ['j', 'l', 'm']);
  assert.equal(view.exactOutputs.includes('desita'), false);
  assert.equal(
    layout.resolvedComboDefinitions?.some((definition) => [...definition.inputs].sort().join() === ['d', 's', 't'].sort().join()),
    false,
  );
});

test('英文を打つ時は、ローマ字で打つ時だけのコンボをたどれない', () => {
  const layout = resolvedLayout('tk-onchoku', 'en');
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
  const layout = resolvedLayout('tk-onchoku', 'ja');
  const one = keyPatternSelectionView(layout, ['l']);
  const continuationOnly = [...one.continuationKeys].find((key) => !one.candidateLegends.has(key));
  assert.ok(continuationOnly !== undefined);
  assert.equal(keyPatternKeyDescription(one, continuationOnly), KEY_PATTERN_CONTINUATION_DESCRIPTION);
  assert.equal(keyPatternKeyDescription(one, 'z'), undefined);

  // m は続けて押せるキーにも候補にも含まれるので、説明は候補の旨だけになる
  const two = keyPatternSelectionView(layout, ['k', 'l']);
  assert.ok(two.continuationKeys.has('m'));
  assert.ok(two.candidateLegends.has('m'));
  assert.equal(keyPatternKeyDescription(two, 'm'), KEY_PATTERN_OUTPUT_DESCRIPTION);
});
