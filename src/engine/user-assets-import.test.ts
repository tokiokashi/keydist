import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommand, emptyCommandHistory } from '#input/commands/index.ts';
import type { UserLayout } from '#input/layouts/user-layouts.ts';
import type { UserRomajiRule } from '#input/romaji/rules.ts';
import { columnFingerAssignment, type FingerAssignment } from '#input/shapes/geometry.ts';
import { emptyCascadeOverrides, levelOverrides } from '#input/settings/index.ts';
import { DEFAULT_BUILTIN_TEXT_ID } from '#input/text/builtin.ts';
import { emptyTextLibrary, type UserText } from '#input/text/library.ts';
import { initialTextSelection } from '#input/text/selection.ts';
import { EMPTY_PERSONAL_SPEED, type PersonalSpeed } from '#interpretation/timing/calibration-codec.ts';
import type { KeydistAssets } from './commands.ts';
import { initialMultiTargetSelection } from './multi-target-selection.ts';
import { initialSingleTargetSelection } from './single-target-selection.ts';
import {
  USER_ASSETS_FILE_FORMAT,
  parseUserAssetsFile,
  userAssetsFileBody,
  userAssetsFileExportProblem,
  type ImportPolicies,
} from './user-assets-file.ts';
import { EMPTY_USER_ASSETS_EXTRAS } from './user-assets-extras.ts';
import { importUserAssetsCommand, userAssetsImportConflicts, type UserAssetsFileContents } from './user-assets-import.ts';
import {
  addWorkspacePane,
  createWorkspace,
  followBinding,
  initialWorkspaceLibrary,
  INITIAL_LINK_GROUP_ID,
  OWN_OPTIONS,
  withWorkspaceTarget,
} from './workspace.ts';
import type { Workspace } from './workspace.ts';

const STAMP = 'stamp';
const ROWS: UserLayout['rows'] = ['', 'poiuytrewq[]', "asdfghjkl;'", 'zxcvbnm,./'];

const RULE: UserRomajiRule = { id: 'rule-a', name: '自作の規則', base: 'kunrei', overrides: { し: 'shi' }, generateSokuon: true };
const LAYOUT: UserLayout = { kind: 'alpha', id: 'user-a', name: '自作A', rows: ROWS, romaji: 'rule-a' };
const FINGER: FingerAssignment = columnFingerAssignment(
  'finger-a',
  '自作の指',
  ['RP', 'RR', 'RM', 'RI', 'RI', 'LI', 'LI', 'LM', 'LR', 'LP', 'LP', 'LP', 'LP'],
  { LP: 9, LR: 8, LM: 7, LI: 6, RI: 3, RM: 2, RR: 1, RP: 0 },
);
const TEXT: UserText = { id: 'text-a', name: '自作の文章', text: 'こんにちは' };
const SPEED: PersonalSpeed = {
  calibration: {
    actionsPerSecond: 5,
    sameHandDifferentFingerActionsPerSecond: 4,
    sameHandDifferentFingerActionsPerSecondByPair: {},
    fingerRepeatMs: {},
    fingerMoveMsPerUnit: {},
    fallbackRepeatMs: 200,
    fallbackMoveMsPerUnit: 100,
    measuredAt: 1,
  },
};

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
    presetLibrary: { presets: [] },
    userLayouts: [],
    userRomajiRules: [],
    personalSpeed: EMPTY_PERSONAL_SPEED,
  };
}

/** 自作の配列を対象にし、自作のテキストを選んだWorkspace。 */
function workspaceOf(id: string, name: string, textId = TEXT.id): Workspace {
  const base = createWorkspace(initialWorkspaceLibrary(), () => id, name).created;
  let library = addWorkspacePane(
    [base],
    id,
    { id: 'p1', analyzerId: 'bigram-flow', options: undefined, optionsBinding: OWN_OPTIONS, binding: followBinding(INITIAL_LINK_GROUP_ID) },
    { w: 6, h: 10 },
  );
  library = withWorkspaceTarget(library, id, INITIAL_LINK_GROUP_ID, { kind: 'single', target: { kind: 'layout', layoutId: LAYOUT.id } });
  return { ...library[0]!, text: { ref: { kind: 'user', id: textId } } };
}

/** 全種類の資産と設定を持つ手元。 */
function fullAssets(): KeydistAssets {
  return {
    ...emptyAssets(),
    userRomajiRules: [RULE],
    userLayouts: [LAYOUT],
    fingerAssignments: [FINGER],
    setupLibrary: {
      setups: [{ id: 'setup-a', number: 1, layoutId: LAYOUT.id, shapeId: 'row-staggered', label: '練習用' }],
      overrides: { setup: { 'setup-a': { windowSize: 5, fingerAssignmentId: FINGER.id, romajiRuleId: RULE.id } } },
    },
    textLibrary: { texts: [TEXT], builtinReadingCorrections: { [DEFAULT_BUILTIN_TEXT_ID]: { 吾輩: 'わがはい' } } },
    presetLibrary: { presets: [{ id: 'preset-a', name: '五つ', values: { windowSize: 5, romajiRuleId: RULE.id } }] },
    workspaces: [workspaceOf('workspace-a', '比較')],
    personalSpeed: SPEED,
    standaloneAnalyzerOptions: { 'bigram-flow': { source: 'within-hand' } },
  };
}

/** 書き出して、読み取り直した中身。 */
function fileOf(assets: KeydistAssets): UserAssetsFileContents {
  const parsed = parseUserAssetsFile(JSON.stringify({ format: USER_ASSETS_FILE_FORMAT, ...userAssetsFileBody(assets) }));
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.message);
  return { bundle: parsed.bundle, userTexts: parsed.userTexts, extras: parsed.extras };
}

function layoutOnlyFile(layout: UserLayout): UserAssetsFileContents {
  return {
    bundle: { layouts: [layout], romajiRules: [], fingerAssignments: [], setups: [] },
    userTexts: { texts: [], builtinReadingCorrections: {} },
    extras: EMPTY_USER_ASSETS_EXTRAS,
  };
}

function importInto(current: KeydistAssets, file: UserAssetsFileContents, policies?: ImportPolicies) {
  const plan = importUserAssetsCommand(file.bundle, STAMP, {
    userTexts: file.userTexts,
    extras: file.extras,
    ...(policies === undefined ? {} : { policies }),
  });
  const step = applyCommand(current, emptyCommandHistory<KeydistAssets>(), plan.command);
  return { assets: step.assets, outcome: step.outcome, entries: plan.entries() ?? [] };
}

test('全資産を書き出して空の保存先へ読み込むと、各資産が元と等しくなる。もう一度読んでも変わらない', () => {
  const source = fullAssets();
  const file = fileOf(source);
  const first = importInto(emptyAssets(), file);
  const { assets } = first;
  assert.deepEqual(assets.userLayouts, source.userLayouts);
  assert.deepEqual(assets.userRomajiRules, source.userRomajiRules);
  assert.deepEqual(assets.fingerAssignments, source.fingerAssignments);
  assert.deepEqual(assets.setupLibrary.setups, source.setupLibrary.setups);
  assert.deepEqual(levelOverrides(assets.setupLibrary.overrides, { kind: 'setup', setupId: 'setup-a' }), {
    windowSize: 5,
    fingerAssignmentId: FINGER.id,
    romajiRuleId: RULE.id,
  });
  assert.deepEqual(assets.textLibrary, source.textLibrary);
  assert.deepEqual(assets.presetLibrary, source.presetLibrary);
  assert.deepEqual(assets.workspaces, source.workspaces);
  assert.deepEqual(assets.personalSpeed, source.personalSpeed);
  assert.deepEqual(assets.standaloneAnalyzerOptions, source.standaloneAnalyzerOptions);
  const again = importInto(assets, file);
  assert.equal(again.outcome.kind, 'no-op');
  assert.ok(again.entries.every((entry) => entry.outcome.kind === 'skipped-same'));
});

test('書き出した資産と設定の種類を、内訳が種類ごとに1件以上返す', () => {
  const kinds = new Set(importInto(emptyAssets(), fileOf(fullAssets())).entries.map((entry) => entry.assetKind));
  assert.deepEqual(
    [...kinds].sort(),
    [
      'analyzer-options',
      'builtin-text-reading',
      'finger-assignment',
      'layout',
      'personal-speed',
      'preset',
      'romaji-rule',
      'setup',
      'text',
      'workspace',
    ].sort(),
  );
});

test('全データのファイルを別名で読み込むと、Workspaceとプリセットは読み込み後の資産を指す', () => {
  const hand = {
    ...emptyAssets(),
    userRomajiRules: [{ ...RULE, overrides: { し: 'si' } }],
    userLayouts: [HAND_LAYOUT],
    textLibrary: { texts: [{ ...TEXT, text: '手元の文章' }] },
  };
  const { assets } = importInto(hand, fileOf(fullAssets()));
  const layout = assets.userLayouts.find((candidate) => candidate.id !== LAYOUT.id)!;
  const rule = assets.userRomajiRules.find((candidate) => candidate.id !== RULE.id)!;
  const text = assets.textLibrary.texts.find((candidate) => candidate.id !== TEXT.id)!;
  assert.equal(text.text, 'こんにちは');
  const workspace = assets.workspaces[0]!;
  assert.deepEqual(workspace.text.ref, { kind: 'user', id: text.id });
  assert.deepEqual(workspace.groups[0]!.target.single.target, { kind: 'layout', layoutId: layout.id });
  assert.equal(assets.presetLibrary.presets[0]!.values.romajiRuleId, rule.id);
  assert.equal(assets.setupLibrary.setups[0]!.layoutId, layout.id);
});

const HAND_LAYOUT: UserLayout = {
  kind: 'alpha',
  id: 'user-a',
  name: '手元の配列',
  rows: ['', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'],
  romaji: 'rule-a',
};
const changed = {
  layout: HAND_LAYOUT,
  rule: { ...RULE, name: '手元の規則', overrides: { し: 'si' } },
  finger: { ...FINGER, name: '手元の指' },
};

/** 手元に、ファイルと同じidで中身の違う資産を1つずつ持たせる。 */
function conflictingHand(): KeydistAssets {
  const source = fullAssets();
  return {
    ...source,
    userLayouts: [changed.layout],
    userRomajiRules: [changed.rule],
    fingerAssignments: [{ ...changed.finger, baseFinger: { ...changed.finger.baseFinger, KeyZ: 'RP' } }],
    setupLibrary: {
      setups: [{ id: 'setup-a', number: 7, layoutId: 'qwerty', shapeId: 'row-staggered', label: '手元のSetup' }],
      overrides: { setup: { 'setup-a': { windowSize: 3 } } },
    },
    textLibrary: {
      texts: [{ ...TEXT, name: '手元の文章', text: '手元' }],
      builtinReadingCorrections: { [DEFAULT_BUILTIN_TEXT_ID]: { 吾輩: 'わがはい手元' } },
    },
    presetLibrary: { presets: [{ id: 'preset-a', name: '手元の五つ', values: { windowSize: 3 } }] },
    workspaces: [{ ...workspaceOf('workspace-a', '手元の比較', 'other-text'), panes: [] }],
    personalSpeed: { calibration: { ...SPEED.calibration!, actionsPerSecond: 9 } },
    standaloneAnalyzerOptions: { 'bigram-flow': { source: 'all' } },
  };
}

test('重なりの検出: 同じidで中身の違う資産がある種類を、置き換えと別名の可否つきで返す', () => {
  const conflicts = userAssetsImportConflicts(conflictingHand(), fileOf(fullAssets()), STAMP);
  const byKind = new Map(conflicts.map((conflict) => [conflict.kind, conflict] as const));
  assert.deepEqual(
    [...byKind.keys()].sort(),
    [
      'analyzer-options',
      'builtin-text-reading',
      'finger-assignment',
      'layout',
      'personal-speed',
      'preset',
      'romaji-rule',
      'setup',
      'text',
      'workspace',
    ].sort(),
  );
  assert.equal(byKind.get('layout')!.canRename, true);
  assert.equal(byKind.get('personal-speed')!.canRename, false);
  assert.equal(byKind.get('builtin-text-reading')!.canRename, false);
  assert.deepEqual(userAssetsImportConflicts(fullAssets(), fileOf(fullAssets()), STAMP), []);
});

test('重なりの検出: 組み込みと同じidの配列だけの重なりは、置き換えを選べない', () => {
  const file = layoutOnlyFile({ ...LAYOUT, id: 'qwerty', romaji: 'kunrei' });
  const [conflict] = userAssetsImportConflicts(emptyAssets(), file, STAMP);
  assert.equal(conflict!.kind, 'layout');
  assert.equal(conflict!.canOverwrite, false);
  assert.equal(conflict!.canRename, true);
});

test('既定の扱い（別名で追加）では、手元の資産を残し、読み込んだ側を別のidで足す。個人速度と解析設定は手元を残す', () => {
  const hand = conflictingHand();
  const { assets } = importInto(hand, fileOf(fullAssets()));
  assert.deepEqual(assets.userLayouts[0], hand.userLayouts[0]);
  assert.equal(assets.userLayouts.length, 2);
  assert.equal(assets.userRomajiRules.length, 2);
  assert.equal(assets.fingerAssignments.length, 2);
  assert.equal(assets.setupLibrary.setups.length, 2);
  assert.equal(assets.textLibrary.texts.length, 2);
  assert.equal(assets.presetLibrary.presets.length, 2);
  assert.equal(assets.workspaces.length, 2);
  assert.deepEqual(assets.textLibrary.builtinReadingCorrections, hand.textLibrary.builtinReadingCorrections);
  assert.equal(assets.personalSpeed, hand.personalSpeed);
  assert.equal(assets.standaloneAnalyzerOptions, hand.standaloneAnalyzerOptions);
});

test('上書き: 手元の同じidの資産を、読み込んだ中身で置き換える。件数は増えない', () => {
  const hand = conflictingHand();
  const source = fullAssets();
  const policies: ImportPolicies = Object.fromEntries(
    [
      'layout',
      'romaji-rule',
      'finger-assignment',
      'setup',
      'text',
      'builtin-text-reading',
      'preset',
      'workspace',
      'personal-speed',
      'analyzer-options',
    ].map((kind) => [kind, 'overwrite']),
  );
  const { assets, entries } = importInto(hand, fileOf(source), policies);
  assert.deepEqual(assets.userLayouts, source.userLayouts);
  assert.deepEqual(assets.userRomajiRules, source.userRomajiRules);
  assert.deepEqual(assets.fingerAssignments, source.fingerAssignments);
  assert.deepEqual(assets.textLibrary, source.textLibrary);
  assert.deepEqual(assets.presetLibrary, source.presetLibrary);
  assert.deepEqual(assets.workspaces, source.workspaces);
  assert.deepEqual(assets.personalSpeed, source.personalSpeed);
  assert.deepEqual(assets.standaloneAnalyzerOptions, source.standaloneAnalyzerOptions);
  // Setupは手元のidと番号を残し、配列・物理配列・ラベル・Setupのレベルの条件を置き換える
  assert.deepEqual(assets.setupLibrary.setups, [{ id: 'setup-a', number: 7, layoutId: LAYOUT.id, shapeId: 'row-staggered', label: '練習用' }]);
  assert.deepEqual(levelOverrides(assets.setupLibrary.overrides, { kind: 'setup', setupId: 'setup-a' }), {
    windowSize: 5,
    fingerAssignmentId: FINGER.id,
    romajiRuleId: RULE.id,
  });
  assert.ok(entries.every((entry) => entry.outcome.kind === 'overwritten'));
});

test('上書き: ファイルのSetupにSetupのレベルの条件が無ければ、手元の条件も消える', () => {
  const hand = conflictingHand();
  const source = fullAssets();
  const file = fileOf({ ...source, setupLibrary: { ...source.setupLibrary, overrides: emptyCascadeOverrides() } });
  const { assets } = importInto(hand, file, { setup: 'overwrite' });
  assert.equal(levelOverrides(assets.setupLibrary.overrides, { kind: 'setup', setupId: 'setup-a' }), undefined);
});

test('読み込まない: 手元の資産を一切変えず、何も書かない。参照は手元の同じidの資産を指す', () => {
  const hand = conflictingHand();
  const policies: ImportPolicies = Object.fromEntries(
    [
      'layout',
      'romaji-rule',
      'finger-assignment',
      'setup',
      'text',
      'builtin-text-reading',
      'preset',
      'workspace',
      'personal-speed',
      'analyzer-options',
    ].map((kind) => [kind, 'skip']),
  );
  const result = importInto(hand, fileOf(fullAssets()), policies);
  assert.equal(result.outcome.kind, 'no-op');
  assert.equal(result.assets, hand);
  assert.ok(result.entries.every((entry) => entry.outcome.kind === 'kept-own'));
});

test('読み込まない: 重なる配列だけを読み込まなくても、ほかの種類は足す', () => {
  const hand = { ...conflictingHand(), setupLibrary: emptyAssets().setupLibrary, workspaces: [], presetLibrary: emptyAssets().presetLibrary };
  const { assets } = importInto(hand, fileOf(fullAssets()), { layout: 'skip' });
  assert.deepEqual(assets.userLayouts, hand.userLayouts);
  assert.equal(assets.setupLibrary.setups[0]!.layoutId, LAYOUT.id);
  assert.equal(assets.workspaces.length, 1);
});

test('上書き: 組み込みと同じidの配列は置き換えられないので、別のidで足す', () => {
  const file = layoutOnlyFile({ ...LAYOUT, id: 'qwerty', name: '組み込みと同じid', romaji: 'kunrei' });
  const { assets, entries } = importInto(emptyAssets(), file, { layout: 'overwrite' });
  assert.equal(assets.userLayouts.length, 1);
  assert.notEqual(assets.userLayouts[0]!.id, 'qwerty');
  assert.equal(entries[0]!.outcome.kind, 'added-renamed');
});

test('読み込まない: 組み込みと同じidの配列は足さない', () => {
  const file = layoutOnlyFile({ ...LAYOUT, id: 'qwerty', name: '組み込みと同じid', romaji: 'kunrei' });
  const { assets, entries } = importInto(emptyAssets(), file, { layout: 'skip' });
  assert.deepEqual(assets.userLayouts, []);
  assert.equal(entries[0]!.outcome.kind, 'skipped-builtin');
});

test('ファイルの大きさの上限: 全種類の資産と、localStorageの枠（約524万字）をかなのテキストで使い切った量を入れても、書き出せて読み込める', () => {
  const source = fullAssets();
  const text = 'あ'.repeat(5_240_000 - 20_000);
  const assets = {
    ...source,
    textLibrary: { ...source.textLibrary, texts: [...source.textLibrary.texts, { id: 'text-big', name: '大きい文章', text }] },
  };
  const body = userAssetsFileBody(assets);
  assert.equal(userAssetsFileExportProblem(body), undefined);
  const parsed = parseUserAssetsFile(JSON.stringify({ format: USER_ASSETS_FILE_FORMAT, ...body }, null, 2));
  assert.ok(parsed.ok);
  assert.equal(parsed.userTexts.texts.find((candidate) => candidate.id === 'text-big')?.text.length, text.length);
});
