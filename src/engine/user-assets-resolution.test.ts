import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { buildUserCatalog } from '#input/layouts/user-catalog.ts';
import type { UserLayout } from '#input/layouts/user-layouts.ts';
import type { UserRomajiRule } from '#input/romaji/rules.ts';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import type { TextLanguage } from '#input/text/language.ts';
import { generateEngineTrace, interpretEngineTrace } from './pipeline.ts';
import { resolveEngineInput } from './resolved-input.ts';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride, type SettingsCascadeOverrides } from './settings-items.ts';

const SHAPES = new Map(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape] as const));

// 組み込みのqwertyと同じ段の定義。組み込みは大文字・記号の出力（Shift）を足して持つので、
// 比べるテキストは小文字と句読点だけにする。
const QWERTY_ROWS: UserLayout['rows'] = ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'];
const USER_QWERTY: UserLayout = { id: 'user-qwerty', name: '自作のQWERTY', rows: QWERTY_ROWS, romaji: 'kunrei' };

const TEXTS: readonly (readonly [TextLanguage, string])[] = [
  ['en', 'the quick brown fox, jumps over the lazy dog.'],
  ['ja', 'こんにちは、きょうはしゃしんをとりにいきます。'],
];

/**
 * 組み込みの配列は未使用でも「Shift」の層を宣言として持ち、指標の層別内訳に0回の行が付く。
 * 自作の配列は持たない。数値の比較では、打鍵が1回も無い層の行を除く。
 */
function withoutUnusedLayers<T extends { layers: { presses: number }[] }>(metrics: T): T {
  return { ...metrics, layers: metrics.layers.filter((layer) => layer.presses > 0) };
}

function measure(
  layoutId: string,
  userLayouts: readonly UserLayout[],
  userRomajiRules: readonly UserRomajiRule[],
  language: TextLanguage,
  text: string,
  overrides: SettingsCascadeOverrides = EMPTY_SETTINGS_OVERRIDES,
) {
  const user = buildUserCatalog(userLayouts, userRomajiRules);
  const result = resolveEngineInput({
    target: { kind: 'layout', layoutId },
    setups: new Map(),
    catalog: { layouts: new Map([...LAYOUT_BY_ID, ...user.layouts]), shapes: SHAPES },
    userLayouts: user.userLayouts,
    customRomajiRules: user.romajiRules,
    overrides,
    text,
    language,
  });
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error));
  if (!result.ok) throw new Error('unreachable');
  const trace = generateEngineTrace(result.input);
  const interpretation = interpretEngineTrace(trace, result.input);
  return { input: result.input, trace, interpretation };
}

test('組み込みと同じ定義の自作の配列は、組み込みの配列と同じ数値になる', () => {
  for (const [language, text] of TEXTS) {
    const builtin = measure('qwerty', [], [], language, text);
    const user = measure(USER_QWERTY.id, [USER_QWERTY], [], language, text);
    assert.ok(builtin.trace.trace.strokes.length > 0);
    assert.equal(user.trace.trace.skipped, 0, language);
    assert.deepEqual(user.trace.trace.strokes, builtin.trace.trace.strokes, language);
    assert.deepEqual(withoutUnusedLayers(user.interpretation.metrics), withoutUnusedLayers(builtin.interpretation.metrics), language);
    assert.equal(user.input.romajiRuleId, builtin.input.romajiRuleId, language);
  }
});

test('自作のローマ字規則を指す自作の配列は、組み込みの配列に同じ規則を全体で選んだ時と同じ数値になる', () => {
  const custom: UserRomajiRule = {
    id: 'romaji-shi',
    name: 'し・ちをshi・chiで打つ',
    base: 'kunrei',
    overrides: { し: 'shi', ち: 'chi' },
    generateSokuon: true,
  };
  const globalCustom = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'romajiRuleId', custom.id);
  assert.ok(globalCustom.ok);
  if (!globalCustom.ok) return;

  const [, text] = TEXTS[1];
  const builtinWithGlobal = measure('qwerty', [], [custom], 'ja', text, globalCustom.overrides);
  const user = measure('user-shi', [{ ...USER_QWERTY, id: 'user-shi', romaji: custom.id }], [custom], 'ja', text);
  const plain = measure('qwerty', [], [custom], 'ja', text);

  assert.equal(user.input.romajiRuleId, custom.id);
  assert.deepEqual(user.trace.trace.strokes, builtinWithGlobal.trace.trace.strokes);
  assert.deepEqual(withoutUnusedLayers(user.interpretation.metrics), withoutUnusedLayers(builtinWithGlobal.interpretation.metrics));
  // 規則が違うので、既定の規則で打った数値とは別になる（比較が空振りしていないことの確認）
  assert.notDeepEqual(user.trace.trace.strokes, plain.trace.trace.strokes);
});

test('自作の配列が指す規則が無ければ、推奨を持たず全体の値の規則で打つ', () => {
  const [, text] = TEXTS[1];
  const gone: UserLayout = { ...USER_QWERTY, id: 'user-gone', romaji: 'romaji-gone' };
  // 全体の値が無い時は、全体の既定（訓令式）
  const missing = measure('user-gone', [gone], [], 'ja', text);
  const builtin = measure('qwerty', [], [], 'ja', text);
  assert.equal(missing.input.romajiRuleId, 'kunrei');
  assert.deepEqual(missing.trace.trace.strokes, builtin.trace.trace.strokes);

  // 全体の値を置くと、それに従う（既定ではなく全体の値で打つことの確認）
  const globalOonishi = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'romajiRuleId', 'oonishi');
  assert.ok(globalOonishi.ok);
  if (!globalOonishi.ok) return;
  const followed = measure('user-gone', [gone], [], 'ja', text, globalOonishi.overrides);
  const builtinOonishi = measure('qwerty', [], [], 'ja', text, globalOonishi.overrides);
  assert.equal(followed.input.romajiRuleId, 'oonishi');
  assert.deepEqual(followed.trace.trace.strokes, builtinOonishi.trace.trace.strokes);
  assert.notDeepEqual(followed.trace.trace.strokes, missing.trace.trace.strokes);
});

test('組み込みと同じidの自作の規則・配列は無視され、組み込みの数値は動かない', () => {
  const [, text] = TEXTS[1];
  const shadowRule: UserRomajiRule = { id: 'kunrei', name: '偽の訓令式', base: 'azik', overrides: {}, generateSokuon: false };
  const shadowLayout: UserLayout = { ...USER_QWERTY, id: 'qwerty', rows: ['1234567890-=', 'poiuytrewq[]', "asdfghjkl;'", 'zxcvbnm,./'] };
  const clean = measure('qwerty', [], [], 'ja', text);
  const shadowed = measure('qwerty', [shadowLayout], [shadowRule], 'ja', text);
  assert.deepEqual(shadowed.trace.trace.strokes, clean.trace.trace.strokes);
  assert.deepEqual(shadowed.interpretation.metrics, clean.interpretation.metrics);
});
