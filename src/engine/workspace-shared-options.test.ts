import { EMPTY_PERSONAL_SPEED } from '#interpretation/timing/calibration-codec.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommand, emptyCommandHistory, undo } from '#input/commands/index.ts';
import { ALTERNATE_SCATTER_OPTIONS, DEFAULT_SCATTER_OPTIONS } from '#analyzers/scatter/options.ts';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import { emptyTextLibrary } from '#input/text/library.ts';
import { initialTextSelection } from '#input/text/selection.ts';
import type { KeydistAssets } from './commands.ts';
import { initialMultiTargetSelection } from './multi-target-selection.ts';
import { initialSingleTargetSelection } from './single-target-selection.ts';
import { WORKSPACE_LIBRARY_CODEC } from './workspace-codec.ts';
import {
  addStandalonePaneToNewWorkspaceCommand,
  addStandalonePaneToWorkspaceCommand,
  addWorkspacePaneCommand,
  setWorkspacePaneOptionsBindingCommand,
  setWorkspacePaneOptionsCommand,
} from './workspace-commands.ts';
import {
  addWorkspacePane,
  closeWorkspacePane,
  createWorkspace,
  defaultOptionsBinding,
  duplicateWorkspacePane,
  findWorkspace,
  BLANK_PANE_ID,
  followBinding,
  initialWorkspaceLibrary,
  newPaneOptions,
  OWN_OPTIONS,
  resolvePaneOptions,
  sharedOptions,
  withWorkspacePaneOptions,
  withWorkspacePaneOptionsBinding,
  INITIAL_LINK_GROUP_ID as G,
  type WorkspaceLibrary,
  type WorkspacePane,
} from './workspace.ts';
import type { GridSize } from './workspace-grid.ts';

const SIZE: GridSize = { w: 6, h: 10 };
const FLOW = 'bigram-flow';
const FINGER = 'finger-distance';
const SCATTER = 'scatter';

function pane(id: string, analyzerId: string, options: unknown = undefined, own = false): WorkspacePane {
  return {
    id,
    analyzerId,
    options,
    optionsBinding: own ? OWN_OPTIONS : sharedOptions(`${analyzerId}-1`),
    binding: followBinding(G),
  };
}

function optionsOf(library: WorkspaceLibrary, paneId: string): unknown {
  const workspace = findWorkspace(library, 'w')!;
  return resolvePaneOptions(workspace, workspace.panes.find((candidate) => candidate.id === paneId)!);
}

/** 共有に従うBigram Flowが2つ（a・b）と、指ごとの距離が1つ（f）。 */
function sample(): WorkspaceLibrary {
  let library = createWorkspace(initialWorkspaceLibrary(), () => 'w').library;
  library = addWorkspacePane(library, 'w', pane('a', FLOW, { source: 'within-hand' }), SIZE);
  library = addWorkspacePane(library, 'w', pane('b', FLOW), SIZE);
  library = addWorkspacePane(library, 'w', pane('f', FINGER), SIZE);
  return library;
}

function assetsWith(workspaces: WorkspaceLibrary): KeydistAssets {
  return {
    setupLibrary: { setups: [], overrides: emptyCascadeOverrides() },
    fingerAssignments: [],
    comboSets: [],
    textLibrary: emptyTextLibrary(),
    standaloneTextSelection: initialTextSelection(),
    standaloneAnalyzerOptions: {},
    multiTargetSelection: initialMultiTargetSelection(),
    singleTargetSelection: initialSingleTargetSelection(),
    workspaces,
    presetLibrary: { presets: [] },
    userLayouts: [],
    userRomajiRules: [],
    personalSpeed: EMPTY_PERSONAL_SPEED,
  };
}

test('共有に従うペインを足すと、組が無ければ渡された設定で組を作り、あれば共有の設定が勝つ', () => {
  const library = sample();
  const workspace = findWorkspace(library, 'w')!;
  assert.deepEqual(workspace.optionSets, [
    {
      id: 'bigram-flow-1',
      analyzerId: FLOW,
      options: { source: 'within-hand' },
    },
    { id: 'finger-distance-1', analyzerId: FINGER, options: undefined },
  ]);
  const withOtherOptions = addWorkspacePane(library, 'w', pane('c', FLOW, { source: 'all' }), SIZE);
  assert.deepEqual(findWorkspace(withOtherOptions, 'w')!.optionSets, workspace.optionSets);
  assert.deepEqual(optionsOf(withOtherOptions, 'c'), { source: 'within-hand' });
  assert.equal(findWorkspace(withOtherOptions, 'w')!.panes.find((p) => p.id === 'c')!.options, undefined);
});

test('defaultOptionsBinding: Analyzerの組があればそれに、無ければ最初の組のidに従う', () => {
  const workspace = findWorkspace(sample(), 'w')!;
  assert.deepEqual(defaultOptionsBinding(workspace, FLOW), sharedOptions('bigram-flow-1'));
  assert.deepEqual(defaultOptionsBinding(workspace, 'comparison'), sharedOptions('comparison-1'));
});

test('別のAnalyzerの組が同じidを持っていても、ペインを足すと重ならないidで組が作られる', () => {
  let library = createWorkspace(initialWorkspaceLibrary(), () => 'w').library;
  library = library.map((workspace) => ({
    ...workspace,
    optionSets: [{ id: 'bigram-flow-1', analyzerId: FINGER, options: undefined }],
  }));
  const workspace = findWorkspace(library, 'w')!;
  const binding = defaultOptionsBinding(workspace, FLOW);
  assert.deepEqual(binding, sharedOptions('bigram-flow-2'));
  const next = addWorkspacePane(library, 'w', { ...pane('a', FLOW, { source: 'within-hand' }), optionsBinding: binding }, SIZE);
  const after = findWorkspace(next, 'w')!;
  assert.deepEqual(
    after.panes.map((p) => p.id),
    ['a'],
  );
  assert.deepEqual(after.optionSets, [
    { id: 'bigram-flow-1', analyzerId: FINGER, options: undefined },
    {
      id: 'bigram-flow-2',
      analyzerId: FLOW,
      options: { source: 'within-hand' },
    },
  ]);
  assert.deepEqual(optionsOf(next, 'a'), { source: 'within-hand' });
});

test('共有に従う片方の設定を変えると、もう片方も変わる。このペインだけのペインと、違うAnalyzerは変わらない', () => {
  let library = sample();
  library = addWorkspacePane(library, 'w', pane('own', FLOW, { source: 'all' }, true), SIZE);
  const next = withWorkspacePaneOptions(library, 'w', 'a', {
    source: 'cross-hand',
  });
  assert.deepEqual(optionsOf(next, 'a'), { source: 'cross-hand' });
  assert.deepEqual(optionsOf(next, 'b'), { source: 'cross-hand' });
  assert.deepEqual(optionsOf(next, 'own'), { source: 'all' });
  assert.equal(optionsOf(next, 'f'), undefined);
  // ペイン自身の欄は書かない
  assert.equal(findWorkspace(next, 'w')!.panes.find((p) => p.id === 'a')!.options, undefined);
  // 同じ中身なら何もしない
  assert.equal(withWorkspacePaneOptions(next, 'w', 'b', { source: 'cross-hand' }), next);
});

test('このペインだけの設定にする時は今の設定を写し、共有へ戻すと共有の設定になる', () => {
  const library = sample();
  const own = withWorkspacePaneOptionsBinding(library, 'w', 'b', {
    kind: 'own',
  });
  assert.deepEqual(optionsOf(own, 'b'), { source: 'within-hand' });
  // 共有の設定が変わっても、このペインだけのペインは変わらない
  const changed = withWorkspacePaneOptions(own, 'w', 'a', { source: 'all' });
  assert.deepEqual(optionsOf(changed, 'a'), { source: 'all' });
  assert.deepEqual(optionsOf(changed, 'b'), { source: 'within-hand' });
  const writtenOwn = withWorkspacePaneOptions(changed, 'w', 'b', {
    source: 'cross-hand',
  });
  assert.deepEqual(optionsOf(writtenOwn, 'a'), { source: 'all' });
  // 共有へ戻すと、このペインだけの設定は捨てて共有の設定を読む
  const back = withWorkspacePaneOptionsBinding(writtenOwn, 'w', 'b', {
    kind: 'shared',
  });
  assert.deepEqual(optionsOf(back, 'b'), { source: 'all' });
  assert.equal(findWorkspace(back, 'w')!.panes.find((p) => p.id === 'b')!.options, undefined);
  // 持ち方が変わらない時は何もしない
  assert.equal(withWorkspacePaneOptionsBinding(library, 'w', 'b', { kind: 'shared' }), library);
  assert.equal(withWorkspacePaneOptionsBinding(own, 'w', 'b', { kind: 'own' }), own);
});

test('従う先の組が無い時は、ペインの今の設定で組を作る', () => {
  let library = createWorkspace(initialWorkspaceLibrary(), () => 'w').library;
  library = addWorkspacePane(library, 'w', pane('o', FLOW, { source: 'all' }, true), SIZE);
  const shared = withWorkspacePaneOptionsBinding(library, 'w', 'o', {
    kind: 'shared',
  });
  assert.deepEqual(findWorkspace(shared, 'w')!.optionSets, [{ id: 'bigram-flow-1', analyzerId: FLOW, options: { source: 'all' } }]);
  assert.deepEqual(optionsOf(shared, 'o'), { source: 'all' });
});

test('別のAnalyzerの組へは従えない。無いペインは何もしない', () => {
  const library = sample();
  assert.equal(
    withWorkspacePaneOptionsBinding(library, 'w', 'f', {
      kind: 'shared',
      set: 'bigram-flow-1',
    }),
    library,
  );
  assert.equal(withWorkspacePaneOptionsBinding(library, 'w', 'missing', { kind: 'own' }), library);
});

test('ペインを全部閉じても組は残り、次に足したペインが従う', () => {
  let library = sample();
  for (const id of ['a', 'b', 'f']) library = closeWorkspacePane(library, 'w', id);
  assert.equal(findWorkspace(library, 'w')!.optionSets.length, 2);
  library = addWorkspacePane(library, 'w', pane('n', FLOW), SIZE);
  assert.deepEqual(optionsOf(library, 'n'), { source: 'within-hand' });
});

test('複製は解析設定の持ち方を写す', () => {
  const library = duplicateWorkspacePane(sample(), 'w', 'a', 'a2');
  const copy = findWorkspace(library, 'w')!.panes.find((p) => p.id === 'a2')!;
  assert.deepEqual(copy.optionsBinding, sharedOptions('bigram-flow-1'));
});

test('コマンド: 共有の設定の変更も持ち方の切り替えも、元に戻す1回で戻る', () => {
  const assets = assetsWith(sample());
  const history = emptyCommandHistory<KeydistAssets>();
  const written = applyCommand(assets, history, setWorkspacePaneOptionsCommand('w', 'a', { source: 'all' }));
  assert.deepEqual(optionsOf(written.assets.workspaces, 'b'), {
    source: 'all',
  });
  const undone = undo(written.assets, written.history);
  assert.deepEqual(optionsOf(undone.assets.workspaces, 'a'), {
    source: 'within-hand',
  });
  assert.deepEqual(optionsOf(undone.assets.workspaces, 'b'), {
    source: 'within-hand',
  });

  const own = applyCommand(assets, history, setWorkspacePaneOptionsBindingCommand('w', 'a', { kind: 'own' }));
  assert.equal(findWorkspace(own.assets.workspaces, 'w')!.panes.find((p) => p.id === 'a')!.optionsBinding.mode, 'own');
  const ownUndone = undo(own.assets, own.history);
  assert.equal(findWorkspace(ownUndone.assets.workspaces, 'w')!.panes.find((p) => p.id === 'a')!.optionsBinding.mode, 'shared');
});

test('個別画面から足す: 同じAnalyzerのペインがあれば、共有と同じ設定でもこのペインだけの設定にする。無ければ共有と同じなら従い、違えばこのペインだけ、組が無ければ作る', () => {
  const assets = assetsWith(sample());
  const history = emptyCommandHistory<KeydistAssets>();
  const same = applyCommand(
    assets,
    history,
    addStandalonePaneToWorkspaceCommand(
      'w',
      {
        paneId: 'same',
        analyzerId: FLOW,
        options: { source: 'within-hand' },
        matchesShared: true,
      },
      SIZE,
    ),
  );
  const different = applyCommand(
    same.assets,
    same.history,
    addStandalonePaneToWorkspaceCommand('w', { paneId: 'diff', analyzerId: FLOW, options: { source: 'all' } }, SIZE),
  );
  const created = applyCommand(
    different.assets,
    different.history,
    addStandalonePaneToWorkspaceCommand('w', { paneId: 'new', analyzerId: 'comparison', options: { visible: ['a'] } }, SIZE),
  );
  const workspace = findWorkspace(created.assets.workspaces, 'w')!;
  const byId = (id: string) => workspace.panes.find((p) => p.id === id)!;
  assert.deepEqual(byId('same').optionsBinding, OWN_OPTIONS);
  assert.deepEqual(byId('same').options, { source: 'within-hand' });
  assert.deepEqual(byId('diff').optionsBinding, OWN_OPTIONS);
  assert.deepEqual(byId('diff').options, { source: 'all' });
  assert.deepEqual(byId('new').optionsBinding, sharedOptions('comparison-1'));
  assert.deepEqual(resolvePaneOptions(workspace, byId('new')), {
    visible: ['a'],
  });
  // 共有の設定は書き換わっていない
  assert.deepEqual(optionsOf(created.assets.workspaces, 'a'), {
    source: 'within-hand',
  });
});

test('個別画面から足す: 同じAnalyzerのペインが全部このペインだけで組が残っていても、このペインだけで始める', () => {
  // 組は残るが従うペインは無い。同じAnalyzerのペインは「ある」ので、このペインだけで始める
  let library = sample();
  library = withWorkspacePaneOptionsBinding(library, 'w', 'a', { kind: 'own' });
  library = withWorkspacePaneOptionsBinding(library, 'w', 'b', { kind: 'own' });
  const assets = assetsWith(library);
  const history = emptyCommandHistory<KeydistAssets>();
  const added = applyCommand(
    assets,
    history,
    addStandalonePaneToWorkspaceCommand(
      'w',
      {
        paneId: 'x',
        analyzerId: FLOW,
        options: { source: 'all' },
        matchesShared: false,
      },
      SIZE,
    ),
  );
  const x = findWorkspace(added.assets.workspaces, 'w')!.panes.find((p) => p.id === 'x')!;
  assert.deepEqual(x.optionsBinding, OWN_OPTIONS);
  assert.deepEqual(x.options, { source: 'all' });
});

test('個別画面から足す: 同じAnalyzerのペインが全て閉じられていれば、残った組と同じ値の設定は組に従う', () => {
  let library = sample();
  for (const id of ['a', 'b']) library = closeWorkspacePane(library, 'w', id);
  const added = applyCommand(
    assetsWith(library),
    emptyCommandHistory<KeydistAssets>(),
    addStandalonePaneToWorkspaceCommand('w', { paneId: 'y', analyzerId: FLOW, options: { source: 'within-hand' }, matchesShared: true }, SIZE),
  );
  const y = findWorkspace(added.assets.workspaces, 'w')!.panes.find((p) => p.id === 'y')!;
  assert.deepEqual(y.optionsBinding, sharedOptions('bigram-flow-1'));
});

test('個別画面から足す: 散布図でも、同じAnalyzerのペインがあればこのペインだけ、組が無ければ組を作る', () => {
  let library = createWorkspace(initialWorkspaceLibrary(), () => 'w').library;
  const history = emptyCommandHistory<KeydistAssets>();
  const first = applyCommand(
    assetsWith(library),
    history,
    addStandalonePaneToWorkspaceCommand('w', { paneId: 's1', analyzerId: SCATTER, options: DEFAULT_SCATTER_OPTIONS }, SIZE),
  );
  const second = applyCommand(
    first.assets,
    first.history,
    addStandalonePaneToWorkspaceCommand(
      'w',
      {
        paneId: 's2',
        analyzerId: SCATTER,
        options: DEFAULT_SCATTER_OPTIONS,
        matchesShared: true,
      },
      SIZE,
    ),
  );
  library = second.assets.workspaces;
  const workspace = findWorkspace(library, 'w')!;
  assert.deepEqual(workspace.panes.find((p) => p.id === 's1')!.optionsBinding, sharedOptions('scatter-1'));
  assert.deepEqual(workspace.panes.find((p) => p.id === 's2')!.optionsBinding, OWN_OPTIONS);
  assert.deepEqual(workspace.panes.find((p) => p.id === 's2')!.options, DEFAULT_SCATTER_OPTIONS);
});

test('個別画面から新しいWorkspaceを作って足す経路は、1つ目のペインとして従来どおり組を作って従う', () => {
  const start = assetsWith(initialWorkspaceLibrary());
  const added = applyCommand(
    start,
    emptyCommandHistory<KeydistAssets>(),
    addStandalonePaneToNewWorkspaceCommand('n', { paneId: 'p', analyzerId: SCATTER, options: ALTERNATE_SCATTER_OPTIONS }, SIZE),
  );
  const workspace = findWorkspace(added.assets.workspaces, 'n')!;
  assert.deepEqual(workspace.panes[0]!.optionsBinding, sharedOptions('scatter-1'));
  assert.deepEqual(workspace.optionSets, [
    {
      id: 'scatter-1',
      analyzerId: SCATTER,
      options: ALTERNATE_SCATTER_OPTIONS,
    },
  ]);
});

test('codec: 組とペインの持ち方は往復で保たれ、従う先の組が無いペインはこのペインだけの設定に戻す', () => {
  const library = withWorkspacePaneOptionsBinding(sample(), 'w', 'b', {
    kind: 'own',
  });
  const decoded = WORKSPACE_LIBRARY_CODEC.decode(JSON.parse(JSON.stringify(WORKSPACE_LIBRARY_CODEC.encode(library))));
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.value, library);
  assert.equal(decoded.diagnostics.length, 0);

  const encoded = JSON.parse(JSON.stringify(WORKSPACE_LIBRARY_CODEC.encode(library))) as { workspaces: { optionSets: unknown[] }[] };
  encoded.workspaces[0]!.optionSets = [];
  const broken = WORKSPACE_LIBRARY_CODEC.decode(encoded);
  assert.ok(broken.ok);
  assert.ok(broken.value[0]!.panes.every((p) => p.optionsBinding.mode === 'own'));
  // aとfの2つが共有の組を失った（bは元からこのペインだけ）
  assert.equal(broken.diagnostics.length, 2);
});

test('codec: 別のAnalyzerの組を指すペインは、このペインだけの設定に戻す', () => {
  const encoded = JSON.parse(JSON.stringify(WORKSPACE_LIBRARY_CODEC.encode(sample()))) as {
    workspaces: { panes: { id: string; optionsBinding: unknown }[] }[];
  };
  encoded.workspaces[0]!.panes.find((p) => p.id === 'f')!.optionsBinding = {
    mode: 'shared',
    set: 'bigram-flow-1',
  };
  const decoded = WORKSPACE_LIBRARY_CODEC.decode(encoded);
  assert.ok(decoded.ok);
  assert.equal(decoded.value[0]!.panes.find((p) => p.id === 'f')!.optionsBinding.mode, 'own');
});

test('codec: 版2以前の保存は読まない', () => {
  assert.equal(WORKSPACE_LIBRARY_CODEC.decode({ version: 2, workspaces: [] }).ok, false);
});

function workspaceOf(panes: readonly WorkspacePane[], optionSets: readonly { id: string; analyzerId: string; options: unknown }[]) {
  return { panes, optionSets };
}

test('newPaneOptions: 同じAnalyzerのペインがあれば、並びで最初のペインに今効いている値を写したこのペインだけで始める（Analyzerは2種類）', () => {
  const cases: readonly { id: string; value: unknown; other: unknown }[] = [
    {
      id: SCATTER,
      value: DEFAULT_SCATTER_OPTIONS,
      other: ALTERNATE_SCATTER_OPTIONS,
    },
    { id: FLOW, value: { source: 'within-hand' }, other: { source: 'all' } },
  ];
  for (const { id, value, other } of cases) {
    // 最初のペインが共有に従う: 組の値を写す
    const shared = workspaceOf([pane('p1', id), pane('p2', id, other, true)], [{ id: `${id}-1`, analyzerId: id, options: value }]);
    assert.deepEqual(newPaneOptions(shared, id), {
      options: value,
      optionsBinding: OWN_OPTIONS,
    });
    // 最初のペインがこのペインだけ: 組に別の値が残っていても、そのペインの値を写す
    const own = workspaceOf([pane('p1', id, other, true), pane('p2', id)], [{ id: `${id}-1`, analyzerId: id, options: value }]);
    assert.deepEqual(newPaneOptions(own, id), {
      options: other,
      optionsBinding: OWN_OPTIONS,
    });
  }
});

test('newPaneOptions: 同じAnalyzerのペインが無ければ、組が残っていても共有に従う。余白のペインは数えない', () => {
  for (const id of [SCATTER, FLOW]) {
    const leftover = workspaceOf([pane('f', FINGER)], [{ id: `${id}-1`, analyzerId: id, options: { stale: true } }]);
    assert.deepEqual(newPaneOptions(leftover, id), {
      options: undefined,
      optionsBinding: sharedOptions(`${id}-1`),
    });
    const blank = workspaceOf([pane('b', BLANK_PANE_ID, undefined, true)], []);
    assert.deepEqual(newPaneOptions(blank, id), {
      options: undefined,
      optionsBinding: sharedOptions(`${id}-1`),
    });
  }
});

test('newPaneOptions: 別のAnalyzerの組がidを使っていても、重ならない組のidを返す', () => {
  const taken = workspaceOf([], [{ id: `${SCATTER}-1`, analyzerId: FLOW, options: undefined }]);
  assert.deepEqual(newPaneOptions(taken, SCATTER).optionsBinding, sharedOptions(`${SCATTER}-2`));
});

test('このペインだけで足したペインを元に戻すと足す前に戻り、組は増えも変わりもしない', () => {
  const before = sample();
  const workspace = findWorkspace(before, 'w')!;
  const { options, optionsBinding } = newPaneOptions(workspace, FLOW);
  const added = applyCommand(
    assetsWith(before),
    emptyCommandHistory<KeydistAssets>(),
    addWorkspacePaneCommand(
      'w',
      {
        id: 'n',
        analyzerId: FLOW,
        options,
        optionsBinding,
        binding: followBinding(G),
      },
      SIZE,
    ),
  );
  const after = findWorkspace(added.assets.workspaces, 'w')!;
  assert.deepEqual(after.optionSets, workspace.optionSets);
  assert.deepEqual(after.panes.find((p) => p.id === 'n')!.optionsBinding, OWN_OPTIONS);
  assert.deepEqual(after.panes.find((p) => p.id === 'n')!.options, {
    source: 'within-hand',
  });
  // 足したペインの設定を変えても組は変わらない
  const edited = applyCommand(added.assets, added.history, setWorkspacePaneOptionsCommand('w', 'n', { source: 'all' }));
  assert.deepEqual(findWorkspace(edited.assets.workspaces, 'w')!.optionSets, workspace.optionSets);
  const undone = undo(added.assets, added.history);
  assert.deepEqual(findWorkspace(undone.assets.workspaces, 'w'), workspace);
});

test('このペインだけで足したペインも、複製は持ち方を写し、共有に従うへ切り替えると先頭の組に従う', () => {
  const base = sample();
  const { options, optionsBinding } = newPaneOptions(findWorkspace(base, 'w')!, FLOW);
  const library = addWorkspacePane(
    base,
    'w',
    {
      id: 'n',
      analyzerId: FLOW,
      options,
      optionsBinding,
      binding: followBinding(G),
    },
    SIZE,
  );
  const copied = findWorkspace(duplicateWorkspacePane(library, 'w', 'n', 'n2'), 'w')!.panes.find((p) => p.id === 'n2')!;
  assert.deepEqual(copied.optionsBinding, OWN_OPTIONS);
  const switched = applyCommand(
    assetsWith(library),
    emptyCommandHistory<KeydistAssets>(),
    setWorkspacePaneOptionsBindingCommand('w', 'n', { kind: 'shared' }),
  );
  assert.deepEqual(findWorkspace(switched.assets.workspaces, 'w')!.panes.find((p) => p.id === 'n')!.optionsBinding, sharedOptions('bigram-flow-1'));
});
