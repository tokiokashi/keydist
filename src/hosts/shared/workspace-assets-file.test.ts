import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { UserLayout } from '#input/layouts/user-layouts.ts';
import type { UserRomajiRule } from '#input/romaji/rules.ts';
import { emptyCascadeOverrides, withLevelOverrides } from '#input/settings/index.ts';
import { columnFingerAssignment, type FingerAssignment } from '#input/shapes/geometry.ts';
import type { Setup, SetupLibrary } from '#input/setup/index.ts';
import { emptyTextLibrary } from '#input/text/library.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import type { SettingsValueMap } from '#engine/settings-items.ts';
import { workspaceAssetsOf } from '#engine/workspace-assets.ts';
import { importWorkspacesCommand } from '#engine/workspace-import.ts';
import {
  addWorkspacePane,
  createWorkspace,
  followBinding,
  initialWorkspaceLibrary,
  INITIAL_LINK_GROUP_ID,
  OWN_OPTIONS,
  withWorkspaceTarget,
  type Workspace,
} from '#engine/workspace.ts';
import { PRESET_FILE_FORMAT, parseWorkspaceFile, presetFileBody } from './preset-file.ts';
import { workspaceImportResultText } from './workspace-import-result.ts';

/**
 * Workspaceの書き出しに同梱する資産と、読み込みでの付け替え。書き手（`presetFileBody`）から読み手（`parseWorkspaceFile`）、
 * 手元への書き込み（`importWorkspacesCommand`）までを本物で通す。
 */

const ROWS: UserLayout['rows'] = ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'];
const layout = (id: string, romaji?: string, rows: UserLayout['rows'] = ROWS): UserLayout => ({
  kind: 'alpha',
  id,
  name: id,
  rows,
  ...(romaji === undefined ? {} : { romaji }),
});
const OTHER_ROWS: UserLayout['rows'] = ['1234567890-=', 'poiuytrewq[]', "asdfghjkl;'", 'zxcvbnm,./'];
const rule = (id: string, spelling = 'shi'): UserRomajiRule => ({ id, name: id, base: 'kunrei', overrides: { し: spelling }, generateSokuon: true });
const FINGER_COLUMNS = ['RP', 'RR', 'RM', 'RI', 'RI', 'LI', 'LI', 'LM', 'LR', 'LP', 'LP', 'LP', 'LP'] as const;
const FINGER_ORDER = { LP: 9, LR: 8, LM: 7, LI: 6, RI: 3, RM: 2, RR: 1, RP: 0 } as const;
/** `variant`が違えば担当の割り当てが違う（0は基準、1以上は列の並びを回して変える）。 */
const finger = (id: string, variant = 0): FingerAssignment =>
  columnFingerAssignment(id, id, [...FINGER_COLUMNS.slice(variant), ...FINGER_COLUMNS.slice(0, variant)], FINGER_ORDER);
const setup = (id: string, number: number, layoutId: string): Setup => ({ id, number, layoutId, shapeId: 'row-staggered' });

type Library = SetupLibrary<SettingsValueMap>;
function library(setups: readonly Setup[], rules?: Record<string, Partial<Record<'romajiRuleId' | 'fingerAssignmentId', string>>>): Library {
  let overrides = emptyCascadeOverrides<SettingsValueMap>();
  for (const [setupId, values] of Object.entries(rules ?? {})) {
    overrides = withLevelOverrides(overrides, { kind: 'setup', setupId }, values as never);
  }
  return { setups, overrides };
}

interface Holdings {
  userLayouts: readonly UserLayout[];
  userRomajiRules: readonly UserRomajiRule[];
  fingerAssignments: readonly FingerAssignment[];
  setupLibrary: Library;
}

/** 書き手の手元: 参照される資産（user-a・user-b・rule-a/b/c・finger-a/b・s1）と、参照されない資産（user-z・rule-z・finger-z・s2）。 */
const EXPORTER: Holdings = {
  userLayouts: [layout('user-a', 'rule-a'), layout('user-b', 'rule-c'), layout('user-z', 'rule-z')],
  userRomajiRules: [rule('rule-a', 'shi'), rule('rule-b', 'si'), rule('rule-c', 'ci'), rule('rule-z', 'zi')],
  fingerAssignments: [finger('finger-a'), finger('finger-b', 1), finger('finger-z', 2)],
  setupLibrary: library([setup('s1', 1, 'user-b'), setup('s2', 2, 'user-z')], { s1: { romajiRuleId: 'rule-b', fingerAssignmentId: 'finger-b' } }),
};

function makeWorkspace(): Workspace {
  let lib = addWorkspacePane(
    [createWorkspace(initialWorkspaceLibrary(), () => 'w1', '比較').created],
    'w1',
    {
      id: 'fixed',
      analyzerId: 'compare-table',
      options: undefined,
      optionsBinding: OWN_OPTIONS,
      binding: {
        mode: 'fixed',
        target: {
          kind: 'set',
          selection: {
            targets: [
              { kind: 'layout', layoutId: 'user-a' },
              { kind: 'layout', layoutId: 'qwerty' },
            ],
            baseline: { kind: 'layout', layoutId: 'user-a' },
          },
        },
      },
    },
    { w: 6, h: 4 },
  );
  lib = addWorkspacePane(
    lib,
    'w1',
    { id: 'follow', analyzerId: 'bigram-flow', options: undefined, optionsBinding: OWN_OPTIONS, binding: followBinding(INITIAL_LINK_GROUP_ID) },
    { w: 6, h: 4 },
  );
  lib = withWorkspaceTarget(lib, 'w1', INITIAL_LINK_GROUP_ID, { kind: 'single', target: { kind: 'setup', setupId: 's1' } });
  return { ...lib[0]!, conditions: { romajiRuleId: 'rule-a', fingerAssignmentId: 'finger-a' } };
}

function fileOf(workspace: Workspace, holdings: Holdings): string {
  return JSON.stringify({
    format: PRESET_FILE_FORMAT,
    ...presetFileBody({ workspaces: [workspace], userAssets: workspaceAssetsOf([workspace], holdings) }),
  });
}

function assetsOf(workspaces: readonly Workspace[], holdings: Holdings): KeydistAssets {
  return {
    ...holdings,
    workspaces,
    textLibrary: emptyTextLibrary(),
  } as unknown as KeydistAssets;
}

/** ファイルを手元へ読み込んだ後の手元。 */
function importInto(local: KeydistAssets, text: string) {
  const parsed = parseWorkspaceFile(text);
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.message);
  if (!parsed.ok) throw new Error('unreachable');
  let n = 0;
  const plan = importWorkspacesCommand(parsed.workspaces, parsed.userAssets, () => `new-${++n}`, 'stamp');
  const outcome = plan.command(local);
  return { plan, outcome, after: outcome.kind === 'applied' ? ({ ...local, ...outcome.changes } as KeydistAssets) : local };
}

const idsOf = (items: readonly { readonly id: string }[]) => items.map((item) => item.id);

test('同梱: 参照をたどって届く自作の資産だけを入れる', () => {
  const bundle = workspaceAssetsOf([makeWorkspace()], EXPORTER);
  assert.deepEqual(idsOf(bundle.layouts), ['user-a', 'user-b']);
  assert.deepEqual(idsOf(bundle.romajiRules), ['rule-a', 'rule-b', 'rule-c']);
  assert.deepEqual(idsOf(bundle.fingerAssignments), ['finger-a', 'finger-b']);
  assert.deepEqual(idsOf(bundle.setups), ['s1']);
});

test('同梱: 組み込みだけを指すWorkspaceは何も同梱せず、ファイルにuserAssetsを出さない', () => {
  const created = createWorkspace(initialWorkspaceLibrary(), () => 'w0', '組み込み').created;
  const bundle = workspaceAssetsOf([created], EXPORTER);
  assert.deepEqual([bundle.layouts, bundle.romajiRules, bundle.fingerAssignments, bundle.setups], [[], [], [], []]);
  assert.equal('userAssets' in presetFileBody({ workspaces: [created], userAssets: bundle }), false);
});

test('同梱: ファイルに入れた資産を読み取れる', () => {
  const parsed = parseWorkspaceFile(fileOf(makeWorkspace(), EXPORTER));
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.deepEqual(idsOf(parsed.userAssets.layouts), ['user-a', 'user-b']);
  assert.deepEqual(idsOf(parsed.userAssets.setups), ['s1']);
});

/** 読み手の手元: 同じidで中身の違う資産を、同梱される全種類について持つ。 */
const CLASHING: Holdings = {
  userLayouts: [layout('user-a', 'rule-a', OTHER_ROWS), layout('user-b', 'rule-c', OTHER_ROWS)],
  userRomajiRules: [rule('rule-a', 'xa'), rule('rule-b', 'xb'), rule('rule-c', 'xc')],
  fingerAssignments: [finger('finger-a', 3), finger('finger-b', 4)],
  setupLibrary: library([setup('s1', 1, 'user-b')]),
};

test('読み込み: 同じidで中身の違う資産が手元にあっても、Workspaceは同梱した資産を指す', () => {
  // 既定の配り方では出ない番号を持たせ、付け替えた対象のkeyに同じ番号が残ることを確かめる
  const exported: Workspace = { ...makeWorkspace(), colorSlots: { 'layout:user-a': 4, 'layout:qwerty': 1 } };
  const { after, plan } = importInto(assetsOf([], CLASHING), fileOf(exported, EXPORTER));
  const added = after.workspaces[0]!;
  const ownLayout = (id: string) => after.userLayouts.find((item) => item.id === id);
  // 固定のペインの集合と基準
  const fixed = added.panes.find((pane) => pane.id === 'fixed')!.binding;
  assert.ok(fixed.mode === 'fixed' && fixed.target.kind === 'set');
  if (!(fixed.mode === 'fixed' && fixed.target.kind === 'set')) return;
  const [first, builtin] = fixed.target.selection.targets;
  assert.ok(first?.kind === 'layout');
  if (first?.kind !== 'layout') return;
  assert.notEqual(first.layoutId, 'user-a');
  assert.deepEqual(ownLayout(first.layoutId)?.rows, ROWS);
  assert.deepEqual(builtin, { kind: 'layout', layoutId: 'qwerty' });
  assert.deepEqual(fixed.target.selection.baseline, first);
  // 従うペインの組の対象（Setup）と、Setupがたどる先
  const single = added.groups[0]!.target.single.target;
  assert.ok(single?.kind === 'setup');
  if (single?.kind !== 'setup') return;
  assert.notEqual(single.setupId, 's1');
  const importedSetup = after.setupLibrary.setups.find((item) => item.id === single.setupId)!;
  assert.deepEqual(ownLayout(importedSetup.layoutId)?.rows, ROWS);
  assert.notEqual(importedSetup.layoutId, 'user-b');
  const setupOverrides = after.setupLibrary.overrides.setup?.[importedSetup.id] as Record<string, string> | undefined;
  assert.deepEqual(after.userRomajiRules.find((item) => item.id === setupOverrides?.romajiRuleId)?.overrides, { し: 'si' });
  assert.notEqual(setupOverrides?.romajiRuleId, 'rule-b');
  assert.deepEqual(
    after.fingerAssignments.find((item) => item.id === setupOverrides?.fingerAssignmentId),
    {
      ...finger('finger-b', 1),
      id: setupOverrides?.fingerAssignmentId,
      name: `finger-b (2)`,
    },
  );
  // 配列が推奨する規則
  const recommended = ownLayout(importedSetup.layoutId)?.romaji;
  assert.deepEqual(after.userRomajiRules.find((item) => item.id === recommended)?.overrides, { し: 'ci' });
  assert.notEqual(recommended, 'rule-c');
  // Workspaceの条件
  const conditions = added.conditions as Record<string, string>;
  assert.deepEqual(after.userRomajiRules.find((item) => item.id === conditions.romajiRuleId)?.overrides, { し: 'shi' });
  assert.notEqual(conditions.romajiRuleId, 'rule-a');
  assert.equal(after.fingerAssignments.find((item) => item.id === conditions.fingerAssignmentId)?.name, 'finger-a (2)');
  // 手元の資産は残り、同梱の資産が参照先として揃うので注記は出ない
  assert.deepEqual(ownLayout('user-a')?.rows, OTHER_ROWS);
  assert.deepEqual(plan.entries()?.[0]?.missing, []);
  // 色の番号は付け替えた対象のkeyで持つ
  assert.deepEqual(added.colorSlots, { [`layout:${first.layoutId}`]: 4, 'layout:qwerty': 1 });
});

test('読み込み: 同じ中身のSetupが別のidで手元にあれば、Workspaceはその手元のSetupを指し、参照先が無い注記は出ない', () => {
  const local: Holdings = {
    userLayouts: EXPORTER.userLayouts.slice(0, 2),
    userRomajiRules: EXPORTER.userRomajiRules.slice(0, 3),
    fingerAssignments: EXPORTER.fingerAssignments.slice(0, 2),
    setupLibrary: library([setup('mine', 1, 'user-b')], { mine: { romajiRuleId: 'rule-b', fingerAssignmentId: 'finger-b' } }),
  };
  const { after, plan } = importInto(assetsOf([], local), fileOf(makeWorkspace(), EXPORTER));
  assert.deepEqual(idsOf(after.setupLibrary.setups), ['mine']);
  assert.deepEqual(after.workspaces[0]!.groups[0]!.target.single.target, { kind: 'setup', setupId: 'mine' });
  assert.deepEqual(plan.entries()?.[0]?.missing, []);
  const result = workspaceImportResultText(plan.entries() ?? [], [], plan.assetEntries());
  assert.deepEqual(result.lines, []);
  assert.equal(result.summary, '1件のWorkspaceを読み込みました');
});

test('読み込み: 手元に何も無い保存先へは、同梱した資産をそのidで足す', () => {
  const { after, plan } = importInto(
    assetsOf([], { userLayouts: [], userRomajiRules: [], fingerAssignments: [], setupLibrary: library([]) }),
    fileOf(makeWorkspace(), EXPORTER),
  );
  assert.deepEqual(idsOf(after.userLayouts), ['user-a', 'user-b']);
  assert.deepEqual(idsOf(after.setupLibrary.setups), ['s1']);
  assert.deepEqual(plan.entries()?.[0]?.missing, []);
  assert.equal(
    workspaceImportResultText(plan.entries() ?? [], [], plan.assetEntries()).summary,
    '1件のWorkspaceを読み込みました。同梱の資産8件を足しました',
  );
});

test('読み込み: 同じファイルを二度読んでも、資産もWorkspaceも増えない', () => {
  const text = fileOf(makeWorkspace(), EXPORTER);
  const first = importInto(assetsOf([], CLASHING), text);
  const second = importInto(first.after, text);
  assert.equal(second.outcome.kind, 'no-op');
  assert.equal(second.after.workspaces.length, 1);
  assert.equal(second.after.userLayouts.length, first.after.userLayouts.length);
  assert.equal(second.after.userRomajiRules.length, first.after.userRomajiRules.length);
  assert.equal(second.after.fingerAssignments.length, first.after.fingerAssignments.length);
  assert.equal(second.after.setupLibrary.setups.length, first.after.setupLibrary.setups.length);
  assert.equal(second.plan.entries()?.[0]?.outcome.kind, 'skipped-same');
});

test('読み込み: 組み込みだけを指すWorkspaceは、資産に触らず今と同じ結果になる', () => {
  const created = createWorkspace(initialWorkspaceLibrary(), () => 'w0', '組み込み').created;
  const { after, outcome } = importInto(assetsOf([], CLASHING), fileOf(created, EXPORTER));
  assert.ok(outcome.kind === 'applied');
  assert.deepEqual(Object.keys(outcome.changes), ['workspaces']);
  assert.equal(after.userLayouts, CLASHING.userLayouts);
  assert.deepEqual(after.workspaces[0], created);
});

test('読み込み: 同梱の無いファイルは、参照をそのままにして今と同じに読む', () => {
  const text = JSON.stringify({ format: PRESET_FILE_FORMAT, ...presetFileBody({ workspaces: [makeWorkspace()] }) });
  const { after, plan } = importInto(assetsOf([], CLASHING), text);
  assert.deepEqual(after.workspaces[0], makeWorkspace());
  assert.equal(plan.assetEntries()?.length, 0);
});

test('読み取り: 同梱の資産が種類ごとの上限を超えるファイルは断る', () => {
  const layouts = Array.from({ length: 101 }, (_, index) => layout(`user-${index}`));
  const text = JSON.stringify({
    format: PRESET_FILE_FORMAT,
    ...presetFileBody({ workspaces: [makeWorkspace()] }),
    userAssets: { layouts },
  });
  const parsed = parseWorkspaceFile(text);
  assert.equal(parsed.ok, false);
});

test('読み取り: 同梱の資産の壊れた項目は捨てて、残りを読み、件数を伝える', () => {
  const text = JSON.stringify({
    format: PRESET_FILE_FORMAT,
    ...presetFileBody({ workspaces: [makeWorkspace()] }),
    userAssets: { layouts: [layout('user-a'), { id: 'broken' }] },
  });
  const parsed = parseWorkspaceFile(text);
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.deepEqual(idsOf(parsed.userAssets.layouts), ['user-a']);
  assert.deepEqual(parsed.dropped, ['1件の同梱の資産の項目は読み込めませんでした']);
});

test('結果の文: 重なって別の名前で足した資産は、理由を一覧に出す', () => {
  const result = workspaceImportResultText(
    [],
    [],
    [
      {
        assetKind: 'layout',
        name: '自作A',
        outcome: { kind: 'added-renamed', addedName: '自作A (2)', addedId: 'x', overlap: { with: 'own', name: '自作A' } },
      },
      { assetKind: 'setup', name: 'S', outcome: { kind: 'skipped-same', existingName: 'S' } },
    ],
  );
  assert.equal(result.summary, '読み込んだWorkspaceはありません。同じ中身のものが既にあります。同梱の資産1件を足しました');
  assert.deepEqual(result.lines, ['配列「自作A」は、手元に重なる資産があり中身が違うため、「自作A (2)」として足しました']);
});

/** 面で定義する配列。ローマ字の規則を持たない。 */
const FACE_LAYOUT: UserLayout = {
  kind: 'kana',
  id: 'user-face',
  name: '面の配列',
  faces: [
    { trigger: [], inputRole: 'layer', outputs: { a: 'あ', s: 'か', d: 'さ', f: '゛' } },
    { trigger: ['thumb-l'], mode: 'simultaneous', triggerPersistence: 'single', inputRole: 'modifier', layer: '左親指', outputs: { a: 'ぁ', s: 'い' } },
  ],
  composition: { dakuten: true, handakuten: false },
};
const FACE_HOLDINGS: Holdings = {
  userLayouts: [FACE_LAYOUT, layout('user-z', 'rule-z')],
  userRomajiRules: [rule('rule-z', 'zi')],
  fingerAssignments: [],
  setupLibrary: library([]),
};

function faceWorkspace(): Workspace {
  const lib = addWorkspacePane(
    [createWorkspace(initialWorkspaceLibrary(), () => 'w1', '面').created],
    'w1',
    {
      id: 'fixed',
      analyzerId: 'compare-table',
      options: undefined,
      optionsBinding: OWN_OPTIONS,
      binding: { mode: 'fixed', target: { kind: 'single', target: { kind: 'layout', layoutId: 'user-face' } } },
    },
    { w: 6, h: 4 },
  );
  return lib[0]!;
}

test('面で定義する配列: 同梱され（推奨の規則を持たないので規則は同梱しない）、空の手元へ同じ配列が戻る', () => {
  const bundle = workspaceAssetsOf([faceWorkspace()], FACE_HOLDINGS);
  assert.deepEqual(idsOf(bundle.layouts), ['user-face']);
  assert.deepEqual(bundle.romajiRules, []);
  const { after } = importInto(
    assetsOf([], { userLayouts: [], userRomajiRules: [], fingerAssignments: [], setupLibrary: library([]) }),
    fileOf(faceWorkspace(), FACE_HOLDINGS),
  );
  assert.deepEqual(after.userLayouts, [FACE_LAYOUT]);
  assert.deepEqual(after.workspaces[0]!.panes[0]!.binding, faceWorkspace().panes[0]!.binding);
});

test('面で定義する配列: 同じidで中身の違う配列が手元にあっても、Workspaceは同梱した配列を指す', () => {
  const clashing: UserLayout = { ...FACE_LAYOUT, composition: { dakuten: true, handakuten: true } };
  const local: Holdings = { userLayouts: [clashing], userRomajiRules: [], fingerAssignments: [], setupLibrary: library([]) };
  const { after } = importInto(assetsOf([], local), fileOf(faceWorkspace(), FACE_HOLDINGS));
  assert.deepEqual(after.userLayouts[0], clashing);
  const binding = after.workspaces[0]!.panes[0]!.binding;
  assert.ok(binding.mode === 'fixed' && binding.target.kind === 'single' && binding.target.target.kind === 'layout');
  if (!(binding.mode === 'fixed' && binding.target.kind === 'single' && binding.target.target.kind === 'layout')) return;
  const { layoutId } = binding.target.target;
  assert.notEqual(layoutId, 'user-face');
  const imported = after.userLayouts.find((item) => item.id === layoutId)!;
  assert.deepEqual(imported.faces, FACE_LAYOUT.faces);
  assert.deepEqual(imported.composition, FACE_LAYOUT.composition);
});
