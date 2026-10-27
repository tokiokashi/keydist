import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import type { TextLanguage } from '#input/text/language.ts';
import { generateEngineTrace, interpretEngineTrace } from './pipeline.ts';
import { resolveEngineInput } from './resolved-input.ts';
import { EMPTY_SETTINGS_OVERRIDES, resolveSettings, setSettingsOverride, type SettingsCascadeOverrides } from './settings-items.ts';

const SHAPES = new Map(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape] as const));

const TEXTS: readonly (readonly [TextLanguage, string])[] = [
  ['en', 'the quick brown fox, jumps over the lazy dog.'],
  ['ja', 'ゆうきがきょうにゅうがくしきでむかうぬのぬのぬにゃんこ。'],
];

function measure(layoutId: string, overrides: SettingsCascadeOverrides, language: TextLanguage, text: string) {
  const result = resolveEngineInput({
    target: { kind: 'layout', layoutId },
    setups: new Map(),
    catalog: { layouts: LAYOUT_BY_ID, shapes: SHAPES },
    userLayouts: new Map(),
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

function override(base: SettingsCascadeOverrides, level: Parameters<typeof setSettingsOverride>[1], assignmentId: string): SettingsCascadeOverrides {
  const written = setSettingsOverride(base, level, 'fingerAssignmentId', assignmentId);
  assert.ok(written.ok);
  if (!written.ok) throw new Error('unreachable');
  return written.overrides;
}

/** 組み込みの配列は未使用の層の行を持つ。数値の比較では、打鍵が1回も無い層の行を除く */
function numbers<T extends { layers: { presses: number }[] }>(metrics: T): T {
  return { ...metrics, layers: metrics.layers.filter((layer) => layer.presses > 0) };
}

test('配列「QWERTY最適化」は、指の割り当てを選んでいなければ「QWERTY最適化」の割り当てで測る', () => {
  const resolved = measure('qwerty-optimized', EMPTY_SETTINGS_OVERRIDES, 'en', 'abc');
  assert.equal(resolved.input.geometry.assignment.id, 'qwerty-optimized');
  assert.equal(resolved.input.cascade.fingerAssignmentId.value, 'qwerty-optimized');
  assert.deepEqual(resolved.input.cascade.fingerAssignmentId.origin, { kind: 'default' });
  // 他の組み込みの配列は推奨を持たない
  assert.equal(measure('qwerty', EMPTY_SETTINGS_OVERRIDES, 'en', 'abc').input.geometry.assignment.id, 'default');
});

test('配列「QWERTY最適化」の数値は、QWERTYを「QWERTY最適化」の割り当てで測った値と一致する', () => {
  const qwertyWithAssignment = override(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'qwerty-optimized');
  let differsFromPlain = false;
  for (const [language, text] of TEXTS) {
    const recommended = measure('qwerty-optimized', EMPTY_SETTINGS_OVERRIDES, language, text);
    const reference = measure('qwerty', qwertyWithAssignment, language, text);
    const plain = measure('qwerty', EMPTY_SETTINGS_OVERRIDES, language, text);
    assert.deepEqual(recommended.trace.trace.strokes, reference.trace.trace.strokes, language);
    assert.deepEqual(numbers(recommended.interpretation.metrics), numbers(reference.interpretation.metrics), language);
    if (JSON.stringify(numbers(plain.interpretation.metrics)) !== JSON.stringify(numbers(recommended.interpretation.metrics))) {
      differsFromPlain = true;
    }
  }
  // 推奨の割り当てが数値を動かしていなければ、この比較は何も確かめていない
  assert.ok(differsFromPlain);
});

test('配列「QWERTY最適化」の推奨は、全体・Workspace・物理配列のレベルで選んだ割り当てより強い', () => {
  for (const level of [{ kind: 'global' }, { kind: 'workspace' }, { kind: 'shape', shapeId: 'row-staggered' }] as const) {
    const resolved = measure('qwerty-optimized', override(EMPTY_SETTINGS_OVERRIDES, level, 'jis-default'), 'en', 'abc');
    assert.equal(resolved.input.geometry.assignment.id, 'qwerty-optimized', level.kind);
  }
});

test('配列・Setupのレベルで選んだ割り当ては、配列「QWERTY最適化」の推奨より強い', () => {
  const byLayout = override(EMPTY_SETTINGS_OVERRIDES, { kind: 'layout', layoutId: 'qwerty-optimized' }, 'jis-default');
  assert.equal(measure('qwerty-optimized', byLayout, 'en', 'abc').input.geometry.assignment.id, 'jis-default');

  const layout = LAYOUT_BY_ID.get('qwerty-optimized')!;
  const bySetup = override(EMPTY_SETTINGS_OVERRIDES, { kind: 'setup', setupId: 's1' }, 'default');
  const resolved = resolveSettings(bySetup, {
    shapeId: 'row-staggered',
    shape: PHYSICAL_SHAPES['row-staggered'],
    inputMethod: 'direct',
    layoutId: layout.id,
    layout,
    targetKind: 'setup',
    setupId: 's1',
  });
  assert.equal(resolved.fingerAssignmentId.value, 'default');
  assert.deepEqual(resolved.fingerAssignmentId.origin, { kind: 'setup', setupId: 's1' });
});

test('物理配列がJISなら、推奨は「QWERTY最適化（JIS）」になる', () => {
  const layout = LAYOUT_BY_ID.get('qwerty-optimized')!;
  const resolved = resolveSettings(EMPTY_SETTINGS_OVERRIDES, {
    shapeId: 'jis-row-staggered',
    shape: PHYSICAL_SHAPES['jis-row-staggered'],
    inputMethod: 'direct',
    layoutId: layout.id,
    layout,
    targetKind: 'layout',
  });
  assert.equal(resolved.fingerAssignmentId.value, 'qwerty-optimized-jis');
});

test('推奨に負けた全体の値は、理由として残る', () => {
  const resolved = measure('qwerty-optimized', override(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'jis-default'), 'en', 'abc');
  assert.deepEqual(resolved.input.cascade.fingerAssignmentId.recommendationWins, { shadowed: ['global', 'workspace'] });
});

test('Angle Modの運指で打つ前提の3配列は、推奨の割り当て「Angle Mod」で測る。JISなら「Angle Mod（JIS）」', () => {
  for (const id of ['colemak-dh-ansi', 'canary-ansi', 'sturdy-ansi']) {
    const resolved = measure(id, EMPTY_SETTINGS_OVERRIDES, 'en', 'abc');
    assert.equal(resolved.input.geometry.assignment.id, 'angle-mod', id);
    assert.deepEqual(resolved.input.cascade.fingerAssignmentId.origin, { kind: 'default' }, id);
    // 全体の値より推奨が強い
    assert.equal(
      measure(id, override(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'jis-default'), 'en', 'abc').input.geometry.assignment.id,
      'angle-mod',
      id,
    );

    const layout = LAYOUT_BY_ID.get(id)!;
    const jis = resolveSettings(EMPTY_SETTINGS_OVERRIDES, {
      shapeId: 'jis-row-staggered',
      shape: PHYSICAL_SHAPES['jis-row-staggered'],
      inputMethod: 'direct',
      layoutId: layout.id,
      layout,
      targetKind: 'layout',
    });
    assert.equal(jis.fingerAssignmentId.value, 'angle-mod-jis', id);
  }
});

test('角度改変をしない版と既存のColemak-DHは、推奨を持たず物理配列の既定で測る', () => {
  for (const id of ['colemak-dh', 'canary', 'sturdy']) {
    assert.equal(measure(id, EMPTY_SETTINGS_OVERRIDES, 'en', 'abc').input.geometry.assignment.id, 'default', id);
  }
});

test('Angle Modの運指は、左手の下段を打つ文章で既定の列固定と違う指になる', () => {
  // Colemak-DH（ANSI）の下段左端の `x`（Zの位置）を、小指ではなく薬指で打つ
  const recommended = measure('colemak-dh-ansi', EMPTY_SETTINGS_OVERRIDES, 'en', 'x');
  const plain = measure('colemak-dh-ansi', override(EMPTY_SETTINGS_OVERRIDES, { kind: 'layout', layoutId: 'colemak-dh-ansi' }, 'default'), 'en', 'x');
  const fingerOf = (resolved: ReturnType<typeof measure>) => resolved.trace.trace.strokes[0]?.presses[0]?.finger;
  assert.equal(fingerOf(recommended), 'LR');
  assert.equal(fingerOf(plain), 'LP');
});
