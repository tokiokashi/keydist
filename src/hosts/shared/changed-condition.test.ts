import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { AnalysisTarget, Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride, type SettingsCascadeOverrides } from '#engine/settings-items.ts';
import { changedConditionLabels, setPaneConditionScope, singlePaneConditionScope } from './changed-condition.ts';
import type { PaneText } from './reading-evaluation.ts';
import type { PaneCatalog } from './resolve-pane-input.ts';

const CATALOG: PaneCatalog = {
  setupCatalog: {
    layouts: LAYOUT_BY_ID,
    shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
  },
  userLayouts: new Map(),
};

const SETUP: Setup = { id: 'setup-1', number: 1, layoutId: 'qwerty', shapeId: 'row-staggered' };
const SETUPS: ReadonlyMap<string, Setup> = new Map([[SETUP.id, SETUP]]);
const QWERTY: AnalysisTarget = { kind: 'layout', layoutId: 'qwerty' };
const DVORAK: AnalysisTarget = { kind: 'layout', layoutId: 'dvorak' };
const SETUP_TARGET: AnalysisTarget = { kind: 'setup', setupId: SETUP.id };

function textOf(language: 'en' | 'ja'): PaneText {
  return { text: language === 'ja' ? 'あいうえお' : 'hello world', language } as PaneText;
}

function overridden(...writes: readonly [Parameters<typeof setSettingsOverride>[1], Parameters<typeof setSettingsOverride>[2], unknown][]) {
  let overrides: SettingsCascadeOverrides = EMPTY_SETTINGS_OVERRIDES;
  for (const [level, id, value] of writes) {
    const written = setSettingsOverride(overrides, level, id, value as never);
    assert.ok(written.ok);
    if (written.ok) overrides = written.overrides;
  }
  return overrides;
}

function labelsOf(
  targets: readonly AnalysisTarget[],
  overrides: SettingsCascadeOverrides,
  language: 'en' | 'ja' = 'en',
  excludeIds: readonly string[] = [],
) {
  return changedConditionLabels({
    targets,
    setups: SETUPS,
    catalog: CATALOG,
    overrides,
    text: textOf(language),
    scope: setPaneConditionScope(language),
    excludeIds,
  });
}

function check(...args: Parameters<typeof labelsOf>): boolean {
  return labelsOf(...args).length > 0;
}

test('changedConditionLabels: 何も上書きしていなければ偽', () => {
  assert.equal(check([QWERTY, DVORAK], EMPTY_SETTINGS_OVERRIDES), false);
});

test('changedConditionLabels: 全体のレベルで既定と違う値にすると真', () => {
  assert.equal(check([QWERTY], overridden([{ kind: 'global' }, 'windowSize', 5])), true);
});

test('changedConditionLabels: Setupのレベルの上書きは、そのSetupを含む時だけ数える', () => {
  const overrides = overridden([{ kind: 'setup', setupId: SETUP.id }, 'windowSize', 5]);
  assert.equal(check([SETUP_TARGET], overrides), true);
  assert.equal(check([QWERTY, DVORAK], overrides), false);
  assert.equal(check([QWERTY, SETUP_TARGET], overrides), true);
});

test('changedConditionLabels: ペインが除く項目の変更は数えない', () => {
  const overrides = overridden([{ kind: 'global' }, 'windowSize', 5]);
  assert.equal(check([QWERTY], overrides, 'en', ['windowSize']), false);
});

test('changedConditionLabels: 英語のテキストでは効かない「日本語の記号の評価」の変更は数えない', () => {
  const overrides = overridden([{ kind: 'global' }, 'keepSymbols', false]);
  assert.equal(check([QWERTY], overrides, 'ja'), true);
  assert.equal(check([QWERTY], overrides, 'en'), false);
});

test('changedConditionLabels: 英語のテキストでは効かない「日本語の英数字の評価」の変更は数えない', () => {
  const overrides = overridden([{ kind: 'global' }, 'keepAlphanumerics', true]);
  assert.equal(check([QWERTY], overrides, 'ja'), true);
  assert.equal(check([QWERTY], overrides, 'en'), false);
});

test('changedConditionLabels: 複数の対象で変わった項目の名前を、重複なく返す', () => {
  const overrides = overridden([{ kind: 'global' }, 'windowSize', 5], [{ kind: 'setup', setupId: SETUP.id }, 'windowSize', 4]);
  assert.deepEqual(labelsOf([QWERTY, SETUP_TARGET], overrides), ['先読みN']);
});

test('changedConditionLabels: 解決できない対象は数えない', () => {
  const missing: AnalysisTarget = { kind: 'setup', setupId: 'no-such-setup' };
  assert.equal(check([missing], overridden([{ kind: 'global' }, 'windowSize', 5])), false);
});

test('singlePaneConditionScope: 宣言された条件だけを足し、設定項目でないidは通さない', () => {
  const scope = singlePaneConditionScope(['windowSize', 'not-an-item'], 'en');
  assert.deepEqual(scope.extraIds, ['windowSize']);
  assert.deepEqual(scope.textInapplicableIds, ['keepSymbols', 'keepAlphanumerics']);
});
