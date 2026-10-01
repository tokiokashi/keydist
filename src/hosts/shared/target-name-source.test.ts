import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import { nameTargets, type AnalysisTarget, type Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride, type SettingsCascadeOverrides } from '#engine/settings-items.ts';
import type { ResolvedText } from '#input/text/resolve.ts';
import { resolvePaneInput, type PaneCatalog } from './resolve-pane-input.ts';
import { setupNumbersOf } from './target-choices.ts';
import { targetNameSource } from './target-name-source.ts';

const CATALOG: PaneCatalog = {
  setupCatalog: {
    layouts: LAYOUT_BY_ID,
    shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
  },
  userLayouts: new Map(),
};

const EN_TEXT: ResolvedText = {
  ref: { kind: 'user', id: 'test-text' },
  name: 'テスト用テキスト',
  text: 'hello world',
  language: 'en',
  languageOverride: undefined,
  isBuiltin: false,
};

/** 比較表・N感度のページと同じ経路（解決→名前の材料→nameTargets）で表示名を求める。 */
function displayNames(
  targets: readonly AnalysisTarget[],
  setups: readonly Setup[],
  overrides: SettingsCascadeOverrides = EMPTY_SETTINGS_OVERRIDES,
) {
  const setupsById = new Map(setups.map((setup) => [setup.id, setup] as const));
  const numbers = setupNumbersOf(setups);
  return nameTargets(targets.map((target) => targetNameSource(
    target,
    resolvePaneInput(target, setupsById, CATALOG, overrides, EN_TEXT),
    setupsById,
    numbers,
    CATALOG.setupCatalog,
  )));
}

const fixedA: Setup = { id: '0d6f2c8e-aaaa-4bbb-8ccc-111111111111', number: 1, layoutId: 'qwerty', shapeId: 'row-staggered' };
const fixedB: Setup = { id: '0d6f2c8e-aaaa-4bbb-8ccc-222222222222', number: 2, layoutId: 'colemak-dh', shapeId: 'row-staggered' };

test('配列 + 上書きの無い同じ配列のSetup + 別配列のSetup: 衝突した2つだけ種類で区別し、UUIDは出さない（M3）', () => {
  const named = displayNames(
    [{ kind: 'layout', layoutId: 'qwerty' }, { kind: 'setup', setupId: fixedA.id }, { kind: 'setup', setupId: fixedB.id }],
    [fixedA, fixedB],
  );
  const qwerty = LAYOUT_BY_ID.get('qwerty')!.name;
  const colemakDh = LAYOUT_BY_ID.get('colemak-dh')!.name;
  assert.deepEqual(named.map((n) => n.displayName), [`${qwerty}（配列）`, `${qwerty}（Setup 1）`, colemakDh]);
  for (const n of named) assert.doesNotMatch(`${n.displayName} ${n.fullName}`, /0d6f2c8e|layout:|setup:/);
});

test('Setup対象だけの集合で既定の物理配列を変えても、名前に「既定の物理配列」は出ない（M1）', () => {
  const written = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'defaultShapeId', 'ortholinear');
  assert.ok(written.ok);
  if (!written.ok) return;
  const named = displayNames(
    [{ kind: 'setup', setupId: fixedA.id }, { kind: 'setup', setupId: fixedB.id }],
    [fixedA, fixedB],
    written.overrides,
  );
  for (const n of named) assert.doesNotMatch(`${n.displayName} ${n.fullName}`, /既定の物理配列|ortholinear/);
});

test('解決に失敗したメンバーにも意味のある名前を付ける（L2）', () => {
  const brokenShape: Setup = { id: 'broken', number: 1, layoutId: 'dvorak', shapeId: 'deleted-shape' };
  const named = displayNames(
    [
      { kind: 'setup', setupId: fixedA.id },
      { kind: 'setup', setupId: 'deleted-setup' },
      { kind: 'setup', setupId: brokenShape.id },
      { kind: 'layout', layoutId: 'deleted-layout' },
    ],
    [fixedA, brokenShape],
  );
  const dvorak = LAYOUT_BY_ID.get('dvorak')!.name;
  assert.deepEqual(named.slice(1).map((n) => n.displayName), [
    '削除されたSetup',
    `${dvorak}/見つからない物理配列`,
    '見つからない配列',
  ]);
  for (const n of named) {
    assert.notEqual(n.displayName.replace(/[—\s]/g, ''), '');
    assert.doesNotMatch(`${n.displayName} ${n.fullName}`, /deleted-|broken/);
  }
});

test('このテキストに使えない配列の失敗メンバーは配列名で呼ぶ', () => {
  const named = displayNames([{ kind: 'layout', layoutId: 'qwerty' }, { kind: 'layout', layoutId: 'nicola' }], []);
  assert.equal(named[1]!.displayName, LAYOUT_BY_ID.get('nicola')!.name);
});

test('空白だけのラベルはラベル無しとして自動命名に戻る（L3）', () => {
  const blank: Setup = { ...fixedB, label: '   ' };
  const named = displayNames([{ kind: 'setup', setupId: fixedA.id }, { kind: 'setup', setupId: blank.id }], [fixedA, blank]);
  assert.equal(named[1]!.displayName, LAYOUT_BY_ID.get('colemak-dh')!.name);
});

test('既定の物理配列を変えた配列対象の名前に、物理配列名が2回並ばない（レビュー指摘L-c）', () => {
  const written = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'defaultShapeId', 'ortholinear');
  assert.ok(written.ok);
  if (!written.ok) return;
  const named = displayNames(
    [{ kind: 'layout', layoutId: 'qwerty' }, { kind: 'setup', setupId: fixedB.id }],
    [fixedA, fixedB],
    written.overrides,
  );
  const ortho = PHYSICAL_SHAPES.ortholinear.name;
  for (const text of [named[0]!.displayName, named[0]!.fullName]) {
    assert.equal(text.split(ortho).length - 1, 1, text);
    assert.doesNotMatch(text, /既定の物理配列/);
  }
});

test('TK音直入力法は言語によらず1つの配列で、並べる時は他の配列と名前だけで見分けられる（#602）', () => {
  const named = displayNames(
    [{ kind: 'layout', layoutId: 'oonishi-custom' }, { kind: 'layout', layoutId: 'oonishi' }],
    [],
  );
  assert.match(named[0]!.displayName, /^TK音直入力法/);
  assert.doesNotMatch(named[0]!.displayName, /英字配置/);
  assert.notEqual(named[0]!.displayName, named[1]!.displayName);
  for (const n of named) assert.doesNotMatch(n.displayName, /番目|（配列）/);
});

test('Setupを削除しても、残ったSetupの衝突時の番号は変わらない', () => {
  const dup: Setup = { ...fixedA, id: '0d6f2c8e-aaaa-4bbb-8ccc-333333333333', number: 3 };
  const targets: AnalysisTarget[] = [{ kind: 'setup', setupId: dup.id }, { kind: 'layout', layoutId: 'qwerty' }];
  const qwerty = LAYOUT_BY_ID.get('qwerty')!.name;
  // fixedB（番号2）を消した後の手持ち。dupは並びが2番目になるが、番号は作成時の3のまま
  assert.deepEqual(displayNames(targets, [fixedA, fixedB, dup]).map((n) => n.displayName), [`${qwerty}（Setup 3）`, `${qwerty}（配列）`]);
  assert.deepEqual(displayNames(targets, [fixedA, dup]).map((n) => n.displayName), [`${qwerty}（Setup 3）`, `${qwerty}（配列）`]);
});
