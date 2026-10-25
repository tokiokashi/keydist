import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import { DEFAULT_FINGER_ASSIGNMENT, PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import { emptyTextLibrary } from '#input/text/library.ts';
import type { KeydistAssets } from './commands.ts';
import {
  addWorkspacePane,
  createWorkspace,
  followBinding,
  initialWorkspaceLibrary,
  INITIAL_LINK_GROUP_ID,
  OWN_OPTIONS,
  withWorkspaceCompactPanes,
  withWorkspaceTarget,
  type Workspace,
  type WorkspacePaneTarget,
} from './workspace.ts';
import { WORKSPACE_LIBRARY_CODEC } from './workspace-codec.ts';
import { EMPTY_USER_ASSETS_BUNDLE } from './user-assets-file.ts';
import { importWorkspacesCommand, mergeWorkspaces, missingWorkspaceReferences, type WorkspaceReferenceHoldings } from './workspace-import.ts';

const HOLDINGS: WorkspaceReferenceHoldings = {
  setupLibrary: { setups: [], overrides: emptyCascadeOverrides() },
  userLayouts: [],
  fingerAssignments: [],
  userRomajiRules: [],
  textLibrary: emptyTextLibrary(),
};

function workspace(id: string, name = id): Workspace {
  return createWorkspace(initialWorkspaceLibrary(), () => id, name).created;
}

/** 組の対象を差し替えたWorkspace。ペインを1つ足して、組が従われている状態にする（従われない組は見えない対象として数えない）。 */
function withGroupTarget(base: Workspace, target: WorkspacePaneTarget): Workspace {
  let library = addWorkspacePane(
    [base],
    base.id,
    {
      id: 'p1',
      analyzerId: 'bigram-flow',
      options: undefined,
      optionsBinding: OWN_OPTIONS,
      binding: followBinding(INITIAL_LINK_GROUP_ID),
    },
    { w: 6, h: 10 },
  );
  library = withWorkspaceTarget(library, base.id, INITIAL_LINK_GROUP_ID, target);
  return library[0]!;
}

test('参照先: 手元にある組み込みの配列だけを指すWorkspaceは注記しない', () => {
  const used = withGroupTarget(workspace('w1'), { kind: 'single', target: { kind: 'layout', layoutId: 'qwerty' } });
  assert.deepEqual(missingWorkspaceReferences(used, HOLDINGS), []);
});

test('参照先: この端末に無い配列・Setupを、種類ごとに1度ずつ挙げる', () => {
  const used = withGroupTarget(workspace('w1'), {
    kind: 'set',
    selection: {
      targets: [
        { kind: 'layout', layoutId: 'gone-1' },
        { kind: 'layout', layoutId: 'gone-2' },
        { kind: 'setup', setupId: 'gone-setup' },
      ],
      baseline: undefined,
    },
  });
  assert.deepEqual([...missingWorkspaceReferences(used, HOLDINGS)].sort(), ['layout', 'setup']);
  const setups = {
    ...HOLDINGS,
    setupLibrary: { ...HOLDINGS.setupLibrary, setups: [{ id: 'gone-setup', number: 1, layoutId: 'qwerty', shapeId: 'row-staggered' }] },
  };
  assert.deepEqual(missingWorkspaceReferences(used, setups), ['layout']);
});

test('参照先: Workspaceの条件が指す指の割当・ローマ字規則・物理配列と、自作のテキスト', () => {
  const used: Workspace = {
    ...workspace('w1'),
    conditions: { fingerAssignmentId: 'mine', romajiRuleId: 'mine', defaultShapeId: 'mine', windowSize: 4 },
    text: { ref: { kind: 'user', id: 'text-1' } },
  };
  assert.deepEqual([...missingWorkspaceReferences(used, HOLDINGS)].sort(), ['finger-assignment', 'romaji-rule', 'shape', 'text']);
  const known: Workspace = {
    ...workspace('w2'),
    conditions: { fingerAssignmentId: DEFAULT_FINGER_ASSIGNMENT.id, romajiRuleId: 'qwerty', defaultShapeId: PHYSICAL_SHAPES['row-staggered'].id },
  };
  assert.deepEqual(missingWorkspaceReferences(known, HOLDINGS), []);
});

test('読み込み: 足したWorkspaceだけが参照先の注記を持つ。足さなかったものは持たない', () => {
  const gone: Workspace = { ...workspace('w1'), text: { ref: { kind: 'user', id: 'text-1' } } };
  const first = mergeWorkspaces([], [gone], HOLDINGS, () => 'x');
  assert.deepEqual(first.entries[0]!.missing, ['text']);
  const second = mergeWorkspaces(first.library, [gone], HOLDINGS, () => 'x');
  assert.deepEqual(second.entries[0]!.missing, []);
});

test('読み込み: 新しいidが手元のidと重なったら、重ならないものが出るまで発行し直す', () => {
  const local = [workspace('w1', '比較'), workspace('taken')];
  const incoming: Workspace = { ...workspace('w1', '比較'), conditions: { windowSize: 6 } };
  const ids = ['taken', 'fresh'];
  const result = mergeWorkspaces(local, [incoming], HOLDINGS, () => ids.shift()!);
  assert.deepEqual(
    result.library.map((item) => item.id),
    ['w1', 'taken', 'fresh'],
  );
  assert.equal(result.library[2]!.name, '比較 (2)');
});

test('読み込み: 別名は手元で使われていない最初の番号を取る', () => {
  const local = [workspace('w1', '比較'), workspace('w2', '比較 (2)')];
  const incoming: Workspace = { ...workspace('w1', '比較'), conditions: { windowSize: 6 } };
  const result = mergeWorkspaces(local, [incoming], HOLDINGS, () => 'fresh');
  assert.equal(result.library[2]!.name, '比較 (3)');
});

function assetsWith(workspaces: readonly Workspace[]): KeydistAssets {
  return { ...HOLDINGS, workspaces } as unknown as KeydistAssets;
}

test('コマンド: 足すものがあれば手持ちを書き、内訳は適用した時の突き合わせから返す', () => {
  const plan = importWorkspacesCommand([workspace('w1', '新しい')], EMPTY_USER_ASSETS_BUNDLE, () => 'x', 'stamp');
  assert.equal(plan.entries(), undefined);
  const outcome = plan.command(assetsWith([]));
  assert.ok(outcome.kind === 'applied');
  assert.deepEqual(
    (outcome.changes.workspaces ?? []).map((item) => item.id),
    ['w1'],
  );
  assert.equal(plan.entries()?.[0]?.outcome.kind, 'added');
});

test('コマンド: 足すものが無ければno-op。内訳は読み取れる', () => {
  const existing = workspace('w1', '新しい');
  const plan = importWorkspacesCommand([existing], EMPTY_USER_ASSETS_BUNDLE, () => 'x', 'stamp');
  assert.equal(plan.command(assetsWith([existing])).kind, 'no-op');
  assert.equal(plan.entries()?.[0]?.outcome.kind, 'skipped-same');
});

test('突き合わせ: 空きを残したまま詰める設定をオンにしたWorkspaceを書き出して読み込んでも、Workspaceは増えない', () => {
  const base = addWorkspacePane(
    addWorkspacePane(
      [workspace('w1', '比較')],
      'w1',
      {
        id: 'a',
        analyzerId: 'bigram-flow',
        options: undefined,
        optionsBinding: OWN_OPTIONS,
        binding: followBinding(INITIAL_LINK_GROUP_ID),
      },
      { w: 6, h: 4 },
    ),
    'w1',
    {
      id: 'b',
      analyzerId: 'bigram-flow',
      options: undefined,
      optionsBinding: OWN_OPTIONS,
      binding: followBinding(INITIAL_LINK_GROUP_ID),
    },
    { w: 6, h: 4 },
  );
  const gapped = [
    { id: 'a', x: 0, y: 4, w: 6, h: 4 },
    { id: 'b', x: 12, y: 9, w: 6, h: 4 },
  ];
  const local = withWorkspaceCompactPanes([{ ...base[0]!, grid: gapped }], 'w1', true);
  const file = JSON.parse(JSON.stringify(WORKSPACE_LIBRARY_CODEC.encode(local)));
  const incoming = WORKSPACE_LIBRARY_CODEC.decode(file);
  assert.ok(incoming.ok);
  const result = mergeWorkspaces(local, incoming.value, HOLDINGS, () => 'fresh');
  assert.equal(result.library.length, 1);
  assert.equal(result.entries[0]!.outcome.kind, 'skipped-same');
});
