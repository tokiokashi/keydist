import assert from 'node:assert/strict';
import test from 'node:test';
import { fromKana, LAYOUT_BY_ID, type Layout } from '#input/layouts/index.ts';
import type { UserRomajiRule } from '#input/romaji/rules.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import { generateEngineTrace } from './pipeline.ts';
import { resolveEngineInput } from './resolved-input.ts';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride } from './settings-items.ts';

const SHAPES = new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape]));

/** 見出しごとに別のキーを割り当てた、ローマ字のテーブルを持たないかな配列。かな配列の種類に引かれるよう、組み込みのかな配列のidを使う。 */
function kanaLayout(headings: readonly string[]): Layout {
  const keys = 'qwertyuiopasdfghjkl';
  return fromKana(
    'jis-kana',
    '検証用のかな配列',
    headings.map((heading, i) => [heading, [[keys[i]!]]] as const),
  );
}

/** アプリと同じ経路で、前処理からTrace生成まで通す。 */
function evaluateKana(headings: readonly string[], text: string) {
  const layout = kanaLayout(headings);
  const result = resolveEngineInput({
    target: { kind: 'layout', layoutId: layout.id },
    setups: new Map(),
    catalog: { layouts: new Map([[layout.id, layout]]), shapes: SHAPES },
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text,
    language: 'ja',
  });
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error));
  const { trace } = generateEngineTrace(result.input);
  return { text: result.input.text, trace };
}

/** 自作のローマ字の規則で、前処理からTrace生成まで通す。 */
function evaluateRomaji(overrides: Readonly<Record<string, string>>, text: string) {
  const rule: UserRomajiRule = { id: 'custom-rule', name: '自作', base: 'kunrei', generateSokuon: false, overrides };
  const written = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'romajiRuleId', rule.id);
  assert.ok(written.ok);
  const result = resolveEngineInput({
    target: { kind: 'layout', layoutId: 'qwerty' },
    setups: new Map(),
    catalog: { layouts: LAYOUT_BY_ID, shapes: SHAPES },
    userLayouts: new Map(),
    customRomajiRules: [rule],
    overrides: written.overrides,
    text,
    language: 'ja',
  });
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error));
  const { trace } = generateEngineTrace(result.input);
  return { text: result.input.text, trace };
}

test('かな配列: 片仮名を含む見出しとひらがなだけの見出しが重なっても、全部打てる', () => {
  const { text, trace } = evaluateKana(['しん', 'んア', 'アイ', 'い'], 'しんアイ');
  assert.equal(text, 'しんアイ');
  assert.equal(trace.skipped, 0);
  assert.deepEqual(
    trace.strokes.map((stroke) => stroke.char),
    ['しん', 'アイ'],
  );
});

test('かな配列: 取り除く記号を挟んだ隣が、打鍵の切り出しと同じになる', () => {
  const { text, trace } = evaluateKana(['し', 'しん', 'んア', 'アイ', 'い'], 'し・んアイ');
  assert.equal(text, 'しんアイ');
  assert.equal(trace.skipped, 0);
  assert.deepEqual(
    trace.strokes.map((stroke) => stroke.char),
    ['しん', 'アイ'],
  );
});

test('かな配列: 片仮名を直した結果がひらがなを含む見出しに当たる時も、同じ位置で切る', () => {
  const { text, trace } = evaluateKana(['んア', 'アイ', 'い'], 'ンアイ');
  assert.equal(text, 'んアい');
  assert.equal(trace.skipped, 0);
  assert.deepEqual(
    trace.strokes.map((stroke) => stroke.char),
    ['んア', 'い'],
  );
});

test('かな配列: 見出しに当たらない片仮名は、これまでどおりひらがなに直して打つ', () => {
  const { text, trace } = evaluateKana(['ヴ', 'ぉ', 'に'], 'ヴォニ');
  assert.equal(text, 'ヴぉに');
  assert.equal(trace.skipped, 0);
});

test('ローマ字: 利用者の規則に しん と んア があり ア 単独が無くても、同じ形のずれが起きない', () => {
  const { text, trace } = evaluateRomaji({ しん: 'xs', んア: 'xn', アイ: 'xa' }, 'しんアイ');
  assert.equal(text, 'しんアイ');
  assert.equal(trace.skipped, 0);
  assert.deepEqual(
    trace.strokes.map((stroke) => stroke.char),
    ['x', 's', 'x', 'a'],
  );
});

test('ローマ字: 取り除く記号を挟んだ隣でも、打鍵の切り出しと同じになる', () => {
  const { text, trace } = evaluateRomaji({ しん: 'xs', んア: 'xn', アイ: 'xa' }, 'し・んアイ');
  assert.equal(text, 'しんアイ');
  assert.equal(trace.skipped, 0);
});
