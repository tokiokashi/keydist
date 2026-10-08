import assert from 'node:assert/strict';
import test from 'node:test';
import { WORKSPACE_LIBRARY_CODEC } from './workspace-codec.ts';
import {
  addWorkspacePane,
  BLANK_PANE_ID,
  NO_BINDING,
  createWorkspace,
  findWorkspace,
  followBinding,
  INITIAL_LINK_GROUP_ID as G,
  withPaneInNewLinkGroup,
  initialWorkspaceLibrary,
  withWorkspaceGrid,
  withWorkspaceCompactPanes,
  withWorkspacePaneOptions,
  withWorkspaceTarget,
  withWorkspaceText,
  type WorkspaceLibrary,
  type WorkspacePane,
  OWN_OPTIONS,
} from './workspace.ts';
import { gridPaneIds, type GridSize } from './workspace-grid.ts';

const SIZE: GridSize = { w: 6, h: 10 };

const singlePane = (id: string): WorkspacePane => ({
  id,
  analyzerId: 'bigram-flow',
  options: undefined,
  optionsBinding: OWN_OPTIONS,
  binding: followBinding(G),
});
const setPane = (id: string): WorkspacePane => ({
  id,
  analyzerId: 'comparison',
  options: { visible: ['a'] },
  optionsBinding: OWN_OPTIONS,
  binding: {
    mode: 'fixed',
    target: {
      kind: 'set',
      selection: {
        targets: [{ kind: 'layout', layoutId: 'qwerty' }, { kind: 'setup', setupId: 's1' }],
        baseline: { kind: 'layout', layoutId: 'qwerty' },
      },
    },
  },
});

function sample(): WorkspaceLibrary {
  let library = createWorkspace(initialWorkspaceLibrary(), () => 'w1', '比べる').library;
  library = addWorkspacePane(library, 'w1', singlePane('p1'), SIZE);
  library = addWorkspacePane(library, 'w1', setPane('p2'), SIZE);
  library = addWorkspacePane(library, 'w1', singlePane('p3'), SIZE);
  library = withWorkspacePaneOptions(library, 'w1', 'p1', { showLabels: true });
  library = withWorkspaceText(library, 'w1', { ref: { kind: 'user', id: 'text-1' } });
  library = withWorkspaceTarget(library, 'w1', G, { kind: 'single', target: { kind: 'layout', layoutId: 'colemak-dh' } });
  library = withWorkspaceTarget(library, 'w1', G, {
    kind: 'set',
    selection: { targets: [{ kind: 'layout', layoutId: 'qwerty' }], baseline: undefined },
  });
  library = withPaneInNewLinkGroup(library, 'w1', 'p1', 'link-2', { kind: 'single', target: { kind: 'layout', layoutId: 'qwerty' } });
  library = addWorkspacePane(library, 'w1', { id: 'p4', analyzerId: BLANK_PANE_ID, options: undefined, optionsBinding: OWN_OPTIONS, binding: NO_BINDING }, SIZE);
  library = createWorkspace(library, () => 'w2').library;
  return library;
}

test('往復: encodeしてJSONを通し、decodeすると同じ値に戻る', () => {
  const library = sample();
  const json: unknown = JSON.parse(JSON.stringify(WORKSPACE_LIBRARY_CODEC.encode(library)));
  const decoded = WORKSPACE_LIBRARY_CODEC.decode(json);
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.diagnostics, []);
  assert.deepEqual(decoded.value, library);
});

test('保存形式は自前の格子で、載せるライブラリの形（`i`・panels）を含まない', () => {
  const encoded = JSON.stringify(WORKSPACE_LIBRARY_CODEC.encode(sample()));
  assert.equal(encoded.includes('"i"'), false);
  assert.equal(encoded.includes('"minW"'), false);
  assert.equal(encoded.includes('"panels"'), false);
  assert.equal(encoded.includes('"views"'), false);
  assert.equal(WORKSPACE_LIBRARY_CODEC.encode(sample()).version, 4);
});

test('将来の版・版の無い値は失敗として返す（黙って切り捨てない）', () => {
  const future = WORKSPACE_LIBRARY_CODEC.decode({ version: 99, workspaces: [] });
  assert.ok(!future.ok && future.reason.kind === 'future-version');
  const missing = WORKSPACE_LIBRARY_CODEC.decode({ workspaces: [] });
  assert.ok(!missing.ok && missing.reason.kind === 'missing-version');
  assert.ok(!WORKSPACE_LIBRARY_CODEC.decode(null).ok);
});

test('壊れたWorkspace・ペインはその1件だけ診断つきで捨て、残りを読む', () => {
  const result = WORKSPACE_LIBRARY_CODEC.decode({
    version: 4,
    workspaces: [
      'not-an-object',
      { name: 'idなし' },
      {
        id: 'ok',
        name: '残る',
        panes: [
          { id: 'good', analyzerId: 'bigram-flow', binding: { mode: 'fixed', target: { kind: 'single', target: { kind: 'layout', layoutId: 'qwerty' } } } },
          { id: 'bad-target', analyzerId: 'bigram-flow', binding: { mode: 'fixed', target: { kind: 'single', target: { kind: 'nope' } } } },
          { id: 'bad-kind', analyzerId: 'bigram-flow', binding: { mode: 'fixed', target: { kind: 'weird' } } },
          { id: 'bad-mode', analyzerId: 'bigram-flow', binding: { mode: 'sometimes' } },
          { id: 'no-binding', analyzerId: 'bigram-flow' },
          { id: 'good', analyzerId: 'comparison', binding: { mode: 'follow' } },
          { analyzerId: 'bigram-flow', binding: { mode: 'follow' } },
        ],
      },
      { id: 'ok', name: '重複' },
    ],
  });
  assert.ok(result.ok);
  assert.deepEqual(result.value.map((w) => w.id), ['ok']);
  assert.deepEqual(result.value[0]!.panes.map((p) => p.id), ['good']);
  assert.ok(result.diagnostics.length >= 8);
});

test('従う組 / 固定と、組ごとの対象は往復で保たれる', () => {
  const decoded = WORKSPACE_LIBRARY_CODEC.decode(JSON.parse(JSON.stringify(WORKSPACE_LIBRARY_CODEC.encode(sample()))));
  assert.ok(decoded.ok);
  const workspace = findWorkspace(decoded.value, 'w1')!;
  assert.deepEqual(workspace.panes.map((p) => p.binding.mode), ['follow', 'fixed', 'follow', 'none']);
  assert.deepEqual(workspace.groups.map((g) => g.id), [G, 'link-2']);
  assert.deepEqual(workspace.groups[0]!.target.single.target, { kind: 'layout', layoutId: 'colemak-dh' });
  assert.equal(workspace.groups[0]!.target.set.targets.length, 1);
  assert.deepEqual(workspace.groups[1]!.target.single.target, { kind: 'layout', layoutId: 'qwerty' });
});

test('組が壊れていれば壊れた部分だけ空へ戻し、捨てた値には診断を出す', () => {
  const broken = WORKSPACE_LIBRARY_CODEC.decode({
    version: 4,
    workspaces: [{
      id: 'w',
      name: 'n',
      groups: [
        { id: 'a', target: { single: { kind: 'nope' }, set: { targets: [{ kind: 'layout', layoutId: 'qwerty' }] } } },
        { id: 'b', target: { set: 'not-an-object' } },
        { id: 'a' },
        'not-an-object',
      ],
    }],
  });
  assert.ok(broken.ok);
  const groups = broken.value[0]!.groups;
  assert.deepEqual(groups.map((g) => g.id), ['a', 'b']);
  assert.deepEqual(groups[0]!.target.single, { target: undefined });
  assert.equal(groups[0]!.target.set.targets.length, 1);
  assert.deepEqual(groups[1]!.target.set.targets, []);
  // 壊れた単体の対象・object形式でない集合・重複した組・object形式でない組の4件
  const paths = broken.diagnostics.map((d) => d.path);
  assert.ok(paths.some((path) => path.includes('groups[0].target.single')));
  assert.ok(paths.some((path) => path.includes('groups[1].target.set')));
  assert.ok(paths.some((path) => path === 'payload.workspaces[0].groups[2].id'));
  assert.ok(paths.some((path) => path === 'payload.workspaces[0].groups[3]'));
});

test('組が1つも読めなければ空の組を1つ作り、診断を出す。従う組が無いペインは先頭の組へ従わせる', () => {
  const missing = WORKSPACE_LIBRARY_CODEC.decode({ version: 4, workspaces: [{ id: 'w', name: 'n' }] });
  assert.ok(missing.ok);
  assert.deepEqual(missing.value[0]!.groups.map((g) => g.id), [G]);
  assert.deepEqual(missing.value[0]!.groups[0]!.target.single, { target: undefined });
  assert.ok(missing.diagnostics.some((d) => d.path === 'payload.workspaces[0].groups'));

  const result = WORKSPACE_LIBRARY_CODEC.decode({
    version: 4,
    workspaces: [{
      id: 'w',
      name: 'n',
      groups: [{ id: 'x', target: {} }],
      panes: [
        { id: 'p1', analyzerId: 'bigram-flow', optionsBinding: { mode: 'own' }, binding: { mode: 'follow', group: 'x' } },
        { id: 'p2', analyzerId: 'bigram-flow', optionsBinding: { mode: 'own' }, binding: { mode: 'follow', group: 'gone' } },
        { id: 'p3', analyzerId: 'bigram-flow', optionsBinding: { mode: 'own' }, binding: { mode: 'follow' } },
        { id: 'p4', analyzerId: 'bigram-flow' },
        { id: 'p5', analyzerId: 'bigram-flow', binding: 'oops' },
      ],
    }],
  });
  assert.ok(result.ok);
  assert.deepEqual(result.value[0]!.panes.map((p) => p.id), ['p1', 'p2', 'p3']);
  assert.deepEqual(result.value[0]!.panes.map((p) => p.binding), [followBinding('x'), followBinding('x'), followBinding('x')]);
  // 従う組が無い2件・持ち方が無い1件・object形式でない1件
  assert.equal(result.diagnostics.length, 4);
  // 持ち方が無い場合とobject形式でない場合は、別の文で伝える
  const messages = result.diagnostics.map((d) => d.message);
  assert.ok(messages.some((m) => m.includes('対象の持ち方が無い')));
  assert.ok(messages.some((m) => m.includes('object形式でない')));
});

test('ペインの集合の選択がobject形式でなければ診断を出してペインを捨てる', () => {
  const result = WORKSPACE_LIBRARY_CODEC.decode({
    version: 4,
    workspaces: [{
      id: 'w',
      name: 'n',
      panes: [{ id: 'p', analyzerId: 'comparison', binding: { mode: 'fixed', target: { kind: 'set', selection: 'oops' } } }],
    }],
  });
  assert.ok(result.ok);
  assert.deepEqual(result.value[0]!.panes, []);
  assert.ok(result.diagnostics.some((d) => d.path.endsWith('.selection')));
});

test('名前・テキストの選択が壊れていれば既定へ戻し、診断を出す', () => {
  const result = WORKSPACE_LIBRARY_CODEC.decode({
    version: 4,
    workspaces: [{ id: 'w', name: 42, text: { ref: { kind: 'builtin', id: 'no-such-text' } } }],
  });
  assert.ok(result.ok);
  assert.equal(result.value[0]!.name, '新しいWorkspace');
  assert.equal(result.value[0]!.text.ref.kind, 'builtin');
  assert.notEqual(result.value[0]!.text.ref.id, 'no-such-text');
  assert.ok(result.diagnostics.length >= 2);
});

test('配置がペインと食い違っていてもペインを失わず、並びを直して読む', () => {
  const result = WORKSPACE_LIBRARY_CODEC.decode({
    version: 4,
    workspaces: [{
      id: 'w',
      name: 'n',
      panes: [singlePane('a'), singlePane('b'), singlePane('c')].map((p) => ({
        id: p.id,
        analyzerId: p.analyzerId,
        binding: { mode: 'follow' },
      })),
      grid: [
        // 列からはみ出す・負の位置・重なり・知らないペイン・数でない値は、範囲に収めるか捨てる
        { id: 'a', x: 20, y: 0, w: 8, h: 8 },
        { id: 'a', x: 0, y: 0, w: 6, h: 8 },
        { id: 'ghost', x: 0, y: 0, w: 2, h: 2 },
        { id: 'c', x: -3, y: 0, w: 'wide', h: 8 },
        'broken',
      ],
    }],
  });
  assert.ok(result.ok);
  const workspace = findWorkspace(result.value, 'w')!;
  assert.deepEqual([...gridPaneIds(workspace.grid)].sort(), ['a', 'b', 'c']);
  for (const item of workspace.grid) {
    assert.ok(item.x >= 0 && item.x + item.w <= 24 && item.y >= 0 && item.w >= 1 && item.h >= 1, JSON.stringify(item));
  }
  for (const [i, a] of workspace.grid.entries()) {
    for (const b of workspace.grid.slice(i + 1)) {
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.equal(overlap, false, `${a.id}と${b.id}が重なっている`);
    }
  }
  assert.ok(result.diagnostics.some((d) => d.path.includes('grid')));
});

test('配置が無くてもペインは並ぶ。ペインが無ければ配置も無い', () => {
  const result = WORKSPACE_LIBRARY_CODEC.decode({
    version: 4,
    workspaces: [
      { id: 'w', name: 'n', panes: [{ id: 'a', analyzerId: 'x', binding: { mode: 'follow' } }, { id: 'b', analyzerId: 'x', binding: { mode: 'follow' } }] },
      { id: 'empty', name: 'e' },
    ],
  });
  assert.ok(result.ok);
  assert.deepEqual(gridPaneIds(findWorkspace(result.value, 'w')!.grid), ['a', 'b']);
  assert.deepEqual(findWorkspace(result.value, 'empty')!.grid, []);
});

test('知らないAnalyzerのペインは捨てずに残す', () => {
  const result = WORKSPACE_LIBRARY_CODEC.decode({
    version: 4,
    workspaces: [{ id: 'w', name: 'n', panes: [{ id: 'a', analyzerId: 'future-analyzer', options: { z: 1 }, binding: { mode: 'follow' } }] }],
  });
  assert.ok(result.ok);
  const pane = result.value[0]!.panes[0]!;
  assert.equal(pane.analyzerId, 'future-analyzer');
  assert.deepEqual(pane.options, { z: 1 });
});

test('配置を書き換えた値も往復する', () => {
  let library = sample();
  library = withWorkspaceGrid(library, 'w1', [
    { id: 'p1', x: 0, y: 0, w: 8, h: 6 },
    { id: 'p2', x: 8, y: 0, w: 4, h: 12 },
  ]);
  const decoded = WORKSPACE_LIBRARY_CODEC.decode(JSON.parse(JSON.stringify(WORKSPACE_LIBRARY_CODEC.encode(library))));
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.value, library);
});

test('詰める設定は往復する。詰めない（既定）は値を持たず、読み込みでも空きを詰めない', () => {
  const library = withWorkspaceCompactPanes(sample(), 'w1', true);
  const encoded = WORKSPACE_LIBRARY_CODEC.encode(library);
  assert.equal(JSON.stringify(encoded).includes('compactPanes'), true);
  const decoded = WORKSPACE_LIBRARY_CODEC.decode(JSON.parse(JSON.stringify(encoded)));
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.value, library);
  assert.equal(JSON.stringify(WORKSPACE_LIBRARY_CODEC.encode(sample())).includes('compactPanes'), false);

  const raw = (compactPanes: unknown) => WORKSPACE_LIBRARY_CODEC.decode({
    version: 4,
    workspaces: [{
      id: 'w',
      name: 'n',
      panes: ['a', 'b'].map((id) => ({ id, analyzerId: 'x', binding: { mode: 'follow' } })),
      grid: [{ id: 'a', x: 0, y: 4, w: 6, h: 4 }, { id: 'b', x: 12, y: 9, w: 6, h: 4 }],
      compactPanes,
    }],
  });
  const off = raw(undefined);
  assert.ok(off.ok);
  assert.deepEqual(off.value[0]!.grid.map((i) => i.y), [4, 9]);
  assert.equal(off.value[0]!.compactPanes, undefined);
  // 真以外（壊れた値）は既定の詰めない
  const broken = raw('yes');
  assert.ok(broken.ok);
  assert.equal(broken.value[0]!.compactPanes, undefined);
  const on = raw(true);
  assert.ok(on.ok);
  assert.deepEqual(on.value[0]!.grid.map((i) => i.y), [0, 0]);
});

test('gridが配列でなければ診断を1件積み、ペインは失わない。undefinedは診断なし', () => {
  const decode = (grid: unknown) => WORKSPACE_LIBRARY_CODEC.decode({
    version: 4,
    workspaces: [{
      id: 'w',
      name: 'n',
      panes: ['a', 'b'].map((id) => ({ id, analyzerId: 'x', binding: { mode: 'follow' } })),
      grid,
    }],
  });
  for (const broken of ['abc', { 0: 1 }, 3, null]) {
    const result = decode(broken);
    assert.ok(result.ok);
    assert.deepEqual(result.diagnostics.map((d) => d.path).filter((path) => path.includes('grid')), ['payload.workspaces[0].grid'], `値: ${JSON.stringify(broken)}`);
    assert.deepEqual([...gridPaneIds(result.value[0]!.grid)].sort(), ['a', 'b'], '枠が無いペインは空いている場所へ置く');
  }
  const absent = decode(undefined);
  assert.ok(absent.ok);
  assert.deepEqual(absent.diagnostics.filter((d) => d.path.includes('grid')), []);
});
