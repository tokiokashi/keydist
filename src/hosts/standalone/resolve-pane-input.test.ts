import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { AnalysisTarget, Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride } from '#engine/settings-items.ts';
import { detectTextLanguage } from '#input/text/language.ts';
import type { ResolvedText } from '#input/text/resolve.ts';
import { resolveStandalonePaneInput, type StandalonePaneCatalog } from './resolve-pane-input.ts';

const CATALOG: StandalonePaneCatalog = {
  setupCatalog: {
    layouts: LAYOUT_BY_ID,
    shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
  },
  userLayouts: new Map(),
};

function setupFor(layoutId: string, shapeId = 'row-staggered'): Setup {
  return { id: 'setup-1', layoutId, shapeId, colorIndex: 0 };
}

function setupsMap(...setups: readonly Setup[]): ReadonlyMap<string, Setup> {
  return new Map(setups.map((setup) => [setup.id, setup]));
}

/** テスト専用の`ResolvedText`組み立て。`resolveTextSelection`を経由せず直接値を作る。 */
function resolvedTextOf(text: string, languageOverride?: 'en' | 'ja'): ResolvedText {
  const language = languageOverride ?? detectTextLanguage(text);
  return {
    ref: { kind: 'user', id: 'test-text' },
    name: 'テスト用テキスト',
    text,
    language,
    languageOverride,
    isBuiltin: false,
  };
}

test('resolveStandalonePaneInput: 日本語テキスト + QWERTYはローマ字入力として解決する', () => {
  const setup = setupFor('qwerty');
  const text = resolvedTextOf('あいうえお');
  const result = resolveStandalonePaneInput(
    { kind: 'setup', setupId: setup.id },
    setupsMap(setup),
    CATALOG,
    EMPTY_SETTINGS_OVERRIDES,
    text,
  );
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.input.romajiRuleId, 'kunrei');
});

test('resolveStandalonePaneInput: 英語テキスト + かな配列は「このテキストには使えない」失敗になる', () => {
  const setup = setupFor('nicola');
  const text = resolvedTextOf('hello world');
  const result = resolveStandalonePaneInput(
    { kind: 'setup', setupId: setup.id },
    setupsMap(setup),
    CATALOG,
    EMPTY_SETTINGS_OVERRIDES,
    text,
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.kind, 'incompatible-text');
});

test('resolveStandalonePaneInput: 言語の手動上書きが自動判定より優先される', () => {
  const setup = setupFor('qwerty');
  // かなを含むが、英語として扱うよう手動指定する。
  const text = resolvedTextOf('テスト test', 'en');
  assert.equal(detectTextLanguage('テスト test'), 'ja');
  const result = resolveStandalonePaneInput(
    { kind: 'setup', setupId: setup.id },
    setupsMap(setup),
    CATALOG,
    EMPTY_SETTINGS_OVERRIDES,
    text,
  );
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.input.romajiRuleId, null);
});

test('resolveStandalonePaneInput: 参照が壊れたSetup（配列が存在しない）はreferenceエラー', () => {
  const setup = setupFor('ghost-layout');
  const text = resolvedTextOf('吾輩は猫である');
  const result = resolveStandalonePaneInput(
    { kind: 'setup', setupId: setup.id },
    setupsMap(setup),
    CATALOG,
    EMPTY_SETTINGS_OVERRIDES,
    text,
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.kind, 'reference');
});

test('resolveStandalonePaneInput: 配列を対象にした時、手持ちにSetupが無くても解決できる', () => {
  const target: AnalysisTarget = { kind: 'layout', layoutId: 'qwerty' };
  const text = resolvedTextOf('hello world');
  const result = resolveStandalonePaneInput(target, new Map(), CATALOG, EMPTY_SETTINGS_OVERRIDES, text);
  assert.ok(result.ok);
});

test('resolveStandalonePaneInput: 手持ちに無いSetup idを対象にすると target-missing になる', () => {
  const target: AnalysisTarget = { kind: 'setup', setupId: 'ghost-setup' };
  const text = resolvedTextOf('hello world');
  const result = resolveStandalonePaneInput(target, new Map(), CATALOG, EMPTY_SETTINGS_OVERRIDES, text);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.kind, 'target-missing');
});

// コーディネーター指示: 配列対象はSetupレベル以外の全カスケードレベル
// （global → shape → inputMethod → layout）を通る。ここではlayoutレベルの上書きが
// 配列対象に効くことを確認する（globalレベルは他のテストで既に確認済み。
// `engine/setup.test.ts`「カスケードの追従」参照）。
test('resolveStandalonePaneInput: 配列対象はlayoutレベルの上書きに従う（Setupレベルだけを持たない）', () => {
  const target: AnalysisTarget = { kind: 'layout', layoutId: 'qwerty' };
  const text = resolvedTextOf('hello world');

  const written = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'layout', layoutId: 'qwerty' }, 'windowSize', 5);
  assert.ok(written.ok);
  if (!written.ok) return;

  const result = resolveStandalonePaneInput(target, new Map(), CATALOG, written.overrides, text);
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.input.cascade.windowSize.value, 5);
  assert.equal(result.input.cascade.windowSize.origin.kind, 'layout');
});

test('resolveStandalonePaneInput: 既定の物理配列が壊れていても配列対象の解決は失敗せず、既定の物理配列へfallbackする（レビュー指摘6）', () => {
  const target: AnalysisTarget = { kind: 'layout', layoutId: 'qwerty' };
  const text = resolvedTextOf('hello world');

  const written = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'defaultShapeId', 'deleted-shape');
  assert.ok(written.ok);
  if (!written.ok) return;

  const result = resolveStandalonePaneInput(target, new Map(), CATALOG, written.overrides, text);
  assert.ok(result.ok, '既定の物理配列が壊れていても解決自体は失敗しない');
  if (!result.ok) return;
  assert.equal(result.input.cascade.defaultShapeId.value, 'row-staggered', 'DEFAULT_SHAPE_IDへfallbackする');
  assert.equal(result.input.cascade.defaultShapeId.diagnostics.length, 1);
  assert.match(result.input.cascade.defaultShapeId.diagnostics[0]!.message, /見つからない/);
  assert.doesNotMatch(result.input.cascade.defaultShapeId.diagnostics[0]!.message, /deleted-shape/);
});
