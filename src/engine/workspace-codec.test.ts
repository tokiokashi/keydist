import assert from 'node:assert/strict';
import test from 'node:test';
import { WORKSPACE_LIBRARY_CODEC } from './workspace-codec.ts';
import {
  addWorkspacePane,
  createWorkspace,
  findWorkspace,
  followBinding,
  INITIAL_LINK_GROUP_ID as G,
  withPaneInNewLinkGroup,
  initialWorkspaceLibrary,
  withWorkspaceLayout,
  withWorkspacePaneOptions,
  withWorkspaceTarget,
  withWorkspaceText,
  type WorkspaceLibrary,
  type WorkspacePane,
} from './workspace.ts';
import { layoutPaneIds } from './workspace-layout.ts';

const singlePane = (id: string): WorkspacePane => ({
  id,
  analyzerId: 'bigram-flow',
  options: undefined,
  binding: followBinding(G),
});
const setPane = (id: string): WorkspacePane => ({
  id,
  analyzerId: 'comparison',
  options: { visible: ['a'] },
  binding: {
    mode: 'fixed',
    target: {
      kind: 'set',
      selection: {
        targets: [{ kind: 'layout', layoutId: 'qwerty' }, { kind: 'setup', setupId: 's1' }],
        baseline: { kind: 'layout', layoutId: 'qwerty' },
        colorSlots: [0, 1],
      },
    },
  },
});

function sample(): WorkspaceLibrary {
  let library = createWorkspace(initialWorkspaceLibrary(), () => 'w1', '比べる').library;
  library = addWorkspacePane(library, 'w1', singlePane('p1'));
  library = addWorkspacePane(library, 'w1', setPane('p2'));
  library = addWorkspacePane(library, 'w1', singlePane('p3'));
  library = withWorkspacePaneOptions(library, 'w1', 'p1', { showLabels: true });
  library = withWorkspaceText(library, 'w1', { ref: { kind: 'user', id: 'text-1' } });
  library = withWorkspaceTarget(library, 'w1', G, { kind: 'single', target: { kind: 'layout', layoutId: 'colemak-dh' } });
  library = withWorkspaceTarget(library, 'w1', G, {
    kind: 'set',
    selection: { targets: [{ kind: 'layout', layoutId: 'qwerty' }], baseline: undefined, colorSlots: [0] },
  });
  library = withPaneInNewLinkGroup(library, 'w1', 'p1', 'link-2', { kind: 'single', target: { kind: 'layout', layoutId: 'qwerty' } });
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

test('保存形式は自前の木で、載せるライブラリの形（grid・panels）を含まない', () => {
  const encoded = JSON.stringify(WORKSPACE_LIBRARY_CODEC.encode(sample()));
  assert.equal(encoded.includes('"grid"'), false);
  assert.equal(encoded.includes('"panels"'), false);
  assert.equal(encoded.includes('"views"'), false);
  assert.equal(WORKSPACE_LIBRARY_CODEC.encode(sample()).version, 3);
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
    version: 3,
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
  assert.deepEqual(workspace.panes.map((p) => p.binding.mode), ['follow', 'fixed', 'follow']);
  assert.deepEqual(workspace.groups.map((g) => g.id), [G, 'link-2']);
  assert.deepEqual(workspace.groups[0]!.target.single.target, { kind: 'layout', layoutId: 'colemak-dh' });
  assert.equal(workspace.groups[0]!.target.set.targets.length, 1);
  assert.deepEqual(workspace.groups[1]!.target.single.target, { kind: 'layout', layoutId: 'qwerty' });
});

test('組が壊れていれば壊れた部分だけ空へ戻し、捨てた値には診断を出す', () => {
  const broken = WORKSPACE_LIBRARY_CODEC.decode({
    version: 3,
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
  const missing = WORKSPACE_LIBRARY_CODEC.decode({ version: 3, workspaces: [{ id: 'w', name: 'n' }] });
  assert.ok(missing.ok);
  assert.deepEqual(missing.value[0]!.groups.map((g) => g.id), [G]);
  assert.deepEqual(missing.value[0]!.groups[0]!.target.single, { target: undefined });
  assert.ok(missing.diagnostics.some((d) => d.path === 'payload.workspaces[0].groups'));

  const result = WORKSPACE_LIBRARY_CODEC.decode({
    version: 3,
    workspaces: [{
      id: 'w',
      name: 'n',
      groups: [{ id: 'x', target: {} }],
      panes: [
        { id: 'p1', analyzerId: 'bigram-flow', binding: { mode: 'follow', group: 'x' } },
        { id: 'p2', analyzerId: 'bigram-flow', binding: { mode: 'follow', group: 'gone' } },
        { id: 'p3', analyzerId: 'bigram-flow', binding: { mode: 'follow' } },
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
    version: 3,
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
    version: 3,
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
    version: 3,
    workspaces: [{
      id: 'w',
      name: 'n',
      panes: [singlePane('a'), singlePane('b'), singlePane('c')].map((p) => ({
        id: p.id,
        analyzerId: p.analyzerId,
        binding: { mode: 'follow' },
      })),
      layout: {
        kind: 'split',
        direction: 'row',
        children: [
          { kind: 'group', paneIds: ['a', 'ghost'] },
          { kind: 'split', direction: 'sideways', children: [] },
          { kind: 'group', paneIds: ['c'], weight: -1 },
        ],
      },
    }],
  });
  assert.ok(result.ok);
  const workspace = findWorkspace(result.value, 'w')!;
  assert.deepEqual([...layoutPaneIds(workspace.layout)].sort(), ['a', 'b', 'c']);
  assert.ok(result.diagnostics.some((d) => d.path.includes('layout')));
});

test('配置が無くてもペインは横に並ぶ。ペインが無ければ配置も無い', () => {
  const result = WORKSPACE_LIBRARY_CODEC.decode({
    version: 3,
    workspaces: [
      { id: 'w', name: 'n', panes: [{ id: 'a', analyzerId: 'x', binding: { mode: 'follow' } }, { id: 'b', analyzerId: 'x', binding: { mode: 'follow' } }] },
      { id: 'empty', name: 'e' },
    ],
  });
  assert.ok(result.ok);
  assert.deepEqual(layoutPaneIds(findWorkspace(result.value, 'w')!.layout), ['a', 'b']);
  assert.equal(findWorkspace(result.value, 'empty')!.layout, undefined);
});

test('知らないAnalyzerのペインは捨てずに残す', () => {
  const result = WORKSPACE_LIBRARY_CODEC.decode({
    version: 3,
    workspaces: [{ id: 'w', name: 'n', panes: [{ id: 'a', analyzerId: 'future-analyzer', options: { z: 1 }, binding: { mode: 'follow' } }] }],
  });
  assert.ok(result.ok);
  const pane = result.value[0]!.panes[0]!;
  assert.equal(pane.analyzerId, 'future-analyzer');
  assert.deepEqual(pane.options, { z: 1 });
});

test('配置の入れ子が深すぎる値は、その部分を捨てても落ちない', () => {
  let node: Record<string, unknown> = { kind: 'group', paneIds: ['a'] };
  for (let i = 0; i < 200; i += 1) node = { kind: 'split', direction: i % 2 === 0 ? 'row' : 'column', children: [node, { kind: 'group', paneIds: [] }] };
  const result = WORKSPACE_LIBRARY_CODEC.decode({
    version: 3,
    workspaces: [{ id: 'w', name: 'n', panes: [{ id: 'a', analyzerId: 'x', binding: { mode: 'follow' } }], layout: node }],
  });
  assert.ok(result.ok);
  assert.deepEqual(layoutPaneIds(result.value[0]!.layout), ['a']);
  assert.ok(result.diagnostics.some((d) => d.message.includes('深すぎる')));
});

test('配置を書き換えた値も往復する', () => {
  let library = sample();
  library = withWorkspaceLayout(library, 'w1', {
    kind: 'split',
    direction: 'column',
    weight: 1,
    children: [{ kind: 'group', paneIds: ['p1'], weight: 2 }, { kind: 'group', paneIds: ['p2'], weight: 1 }],
  });
  const decoded = WORKSPACE_LIBRARY_CODEC.decode(JSON.parse(JSON.stringify(WORKSPACE_LIBRARY_CODEC.encode(library))));
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.value, library);
});

test('splitのchildrenが配列でなければ診断を1件積み、ペインは失わない。undefinedは診断なし', () => {
  const decode = (children: unknown) => WORKSPACE_LIBRARY_CODEC.decode({
    version: 3,
    workspaces: [{
      id: 'w',
      name: 'n',
      panes: ['a', 'b'].map((id) => ({ id, analyzerId: 'x', binding: { mode: 'follow' } })),
      layout: { kind: 'split', direction: 'row', children },
    }],
  });
  for (const broken of ['abc', { 0: 1 }, 3, null]) {
    const result = decode(broken);
    assert.ok(result.ok);
    assert.deepEqual(result.diagnostics.map((d) => d.path).filter((path) => path.includes('layout')), ['payload.workspaces[0].layout.children'], `値: ${JSON.stringify(broken)}`);
    assert.deepEqual([...layoutPaneIds(result.value[0]!.layout)].sort(), ['a', 'b'], '空のsplitはnormalizeLayoutが直し、ペインは残る');
  }
  const absent = decode(undefined);
  assert.ok(absent.ok);
  assert.deepEqual(absent.diagnostics.filter((d) => d.path.includes('layout')), []);
});
