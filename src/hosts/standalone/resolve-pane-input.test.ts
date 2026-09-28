import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
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
  const text = resolvedTextOf('あいうえお');
  const result = resolveStandalonePaneInput(setupFor('qwerty'), CATALOG, EMPTY_SETTINGS_OVERRIDES, text);
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.input.romajiRuleId, 'kunrei');
});

test('resolveStandalonePaneInput: 英語テキスト + かな配列は「このテキストには使えない」失敗になる', () => {
  const text = resolvedTextOf('hello world');
  const result = resolveStandalonePaneInput(setupFor('nicola'), CATALOG, EMPTY_SETTINGS_OVERRIDES, text);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.kind, 'incompatible-text');
});

test('resolveStandalonePaneInput: 言語の手動上書きが自動判定より優先される', () => {
  // かなを含むが、英語として扱うよう手動指定する。
  const text = resolvedTextOf('テスト test', 'en');
  assert.equal(detectTextLanguage('テスト test'), 'ja');
  const result = resolveStandalonePaneInput(setupFor('qwerty'), CATALOG, EMPTY_SETTINGS_OVERRIDES, text);
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.input.romajiRuleId, null);
});

test('resolveStandalonePaneInput: 参照が壊れたSetup（配列が存在しない）はreferenceエラー', () => {
  const text = resolvedTextOf('吾輩は猫である');
  const result = resolveStandalonePaneInput(setupFor('ghost-layout'), CATALOG, EMPTY_SETTINGS_OVERRIDES, text);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.kind, 'reference');
});
