import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { initialStandaloneText, withStandaloneLanguageOverride, withStandaloneText } from '#input/text/standalone-text.ts';
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

test('resolveStandalonePaneInput: 日本語テキスト + QWERTYはローマ字入力として解決する', () => {
  const text = withStandaloneText(initialStandaloneText(), 'あいうえお');
  const result = resolveStandalonePaneInput(setupFor('qwerty'), CATALOG, EMPTY_SETTINGS_OVERRIDES, text);
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.input.romajiRuleId, 'kunrei');
});

test('resolveStandalonePaneInput: 英語テキスト + かな配列は「このテキストには使えない」失敗になる', () => {
  const text = withStandaloneText(initialStandaloneText(), 'hello world');
  const result = resolveStandalonePaneInput(setupFor('nicola'), CATALOG, EMPTY_SETTINGS_OVERRIDES, text);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.kind, 'incompatible-text');
});

test('resolveStandalonePaneInput: 言語の手動上書きが自動判定より優先される', () => {
  // かなを含むが、英語として扱うよう手動指定する。
  const text = withStandaloneLanguageOverride(
    withStandaloneText(initialStandaloneText(), 'テスト test'),
    'en',
  );
  assert.equal(text.language.detected, 'ja');
  const result = resolveStandalonePaneInput(setupFor('qwerty'), CATALOG, EMPTY_SETTINGS_OVERRIDES, text);
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.input.romajiRuleId, null);
});

test('resolveStandalonePaneInput: 参照が壊れたSetup（配列が存在しない）はreferenceエラー', () => {
  const text = initialStandaloneText();
  const result = resolveStandalonePaneInput(setupFor('ghost-layout'), CATALOG, EMPTY_SETTINGS_OVERRIDES, text);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.kind, 'reference');
});
