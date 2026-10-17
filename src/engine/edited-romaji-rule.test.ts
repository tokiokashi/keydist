import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommand, emptyCommandHistory } from '#input/commands/index.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { buildUserCatalog } from '#input/layouts/user-catalog.ts';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import { withSpelling } from '#input/romaji/rule-edit.ts';
import type { UserRomajiRule } from '#input/romaji/rules.ts';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import { emptyTextLibrary } from '#input/text/library.ts';
import { initialTextSelection } from '#input/text/selection.ts';
import { EMPTY_PERSONAL_SPEED } from '#interpretation/timing/calibration-codec.ts';
import { createUserRomajiRuleCommand, setUserRomajiRuleContentCommand, type KeydistAssets } from './commands.ts';
import { initialMultiTargetSelection } from './multi-target-selection.ts';
import { generateEngineTrace, interpretEngineTrace } from './pipeline.ts';
import { resolveEngineInput } from './resolved-input.ts';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride } from './settings-items.ts';
import { initialSingleTargetSelection } from './single-target-selection.ts';
import { initialWorkspaceLibrary } from './workspace.ts';

const SHAPES = new Map(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape] as const));
const TEXT = 'こんにちは、きょうはしゃしんをとりにいきます。じゃがいもをたべました。';

function emptyAssets(): KeydistAssets {
  return {
    setupLibrary: { setups: [], overrides: emptyCascadeOverrides() },
    fingerAssignments: [],
    textLibrary: emptyTextLibrary(),
    standaloneTextSelection: initialTextSelection(),
    standaloneAnalyzerOptions: {},
    multiTargetSelection: initialMultiTargetSelection(),
    singleTargetSelection: initialSingleTargetSelection(),
    workspaces: [],
    workspaceLibrary: initialWorkspaceLibrary(),
    userLayouts: [],
    userRomajiRules: [],
    presetLibrary: { presets: [] },
    personalSpeed: EMPTY_PERSONAL_SPEED,
  } as unknown as KeydistAssets;
}

/** 規則`rule`を全体で選び、QWERTYでTEXTを打った時の打鍵と指標を測る。画面と同じ解決の経路を通す。 */
function measure(rule: UserRomajiRule) {
  const global = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'romajiRuleId', rule.id);
  assert.ok(global.ok);
  const user = buildUserCatalog([], [rule]);
  const result = resolveEngineInput({
    target: { kind: 'layout', layoutId: 'qwerty' },
    setups: new Map(),
    catalog: { layouts: new Map([...LAYOUT_BY_ID, ...user.layouts]), shapes: SHAPES },
    userLayouts: user.userLayouts,
    customRomajiRules: user.romajiRules,
    overrides: global.overrides,
    text: TEXT,
    language: 'ja',
  });
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error));
  if (!result.ok) throw new Error('unreachable');
  assert.equal(result.input.romajiRuleId, rule.id);
  const trace = generateEngineTrace(result.input);
  assert.equal(trace.trace.skipped, 0);
  return { strokes: trace.trace.strokes, metrics: interpretEngineTrace(trace, result.input).metrics };
}

/** 画面の操作と同じく、作成→綴りの書き換えをコマンドで通し、保存された規則を返す。 */
function createAndEdit(): UserRomajiRule {
  let step = applyCommand(
    emptyAssets(),
    emptyCommandHistory<KeydistAssets>(),
    createUserRomajiRuleCommand(() => 'romaji-edited', '私の綴り', 'kunrei'),
  );
  for (const [kana, roman] of [
    ['し', 'shi'],
    ['ち', 'chi'],
    ['じゃ', 'ja'],
    ['きょ', 'kyo'],
  ] as const) {
    const stored = step.assets.userRomajiRules[0]!;
    const overrides = withSpelling(stored.overrides, kana, roman);
    assert.ok(overrides);
    step = applyCommand(
      step.assets,
      step.history,
      setUserRomajiRuleContentCommand(stored.id, { base: stored.base, generateSokuon: stored.generateSokuon, overrides }),
    );
  }
  return step.assets.userRomajiRules[0]!;
}

test('画面の編集で保存した規則は、同じ規則を直接与えた時と同じ打鍵・同じ数値になる', () => {
  const stored = createAndEdit();
  // 直接与える側は、編集関数を通さず中身を手で書く
  const direct: UserRomajiRule = {
    id: 'romaji-edited',
    name: '私の綴り',
    base: 'kunrei',
    overrides: { し: 'shi', ち: 'chi', じゃ: 'ja', きょ: 'kyo' },
    generateSokuon: true,
  };
  assert.deepEqual(stored, direct);

  const viaEditor = measure(stored);
  const viaDirect = measure(direct);
  assert.ok(viaEditor.strokes.length > 0);
  assert.deepEqual(viaEditor.strokes, viaDirect.strokes);
  assert.deepEqual(viaEditor.metrics, viaDirect.metrics);
  // 差分の無い規則の数値とは別になる（比較が空振りしていないことの確認）
  const plain = measure({ ...direct, overrides: {} });
  assert.notDeepEqual(viaEditor.strokes, plain.strokes);
  assert.notDeepEqual(viaEditor.metrics, plain.metrics);
});

test('基底と促音の生成を書き換えた規則も、同じ規則を直接与えた時と同じ数値になる', () => {
  const created = applyCommand(
    emptyAssets(),
    emptyCommandHistory<KeydistAssets>(),
    createUserRomajiRuleCommand(() => 'romaji-azik', 'AZIK風', 'kunrei'),
  );
  const step = applyCommand(
    created.assets,
    created.history,
    setUserRomajiRuleContentCommand('romaji-azik', { base: 'azik', overrides: { し: 'si' }, generateSokuon: false }),
  );
  const stored = step.assets.userRomajiRules[0]!;
  const direct: UserRomajiRule = { id: 'romaji-azik', name: 'AZIK風', base: 'azik', overrides: { し: 'si' }, generateSokuon: false };
  assert.deepEqual(stored, direct);
  assert.deepEqual(measure(stored), measure(direct));
});
