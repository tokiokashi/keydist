import assert from 'node:assert/strict';
import test from 'node:test';
import { WORKSPACE_LIBRARY_CODEC } from './workspace-codec.ts';
import {
  addWorkspacePane,
  createWorkspace,
  findWorkspace,
  FOLLOW_BINDING,
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
  binding: FOLLOW_BINDING,
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
  library = withWorkspacePaneOptions(library, 'w1', 'p1', { showLabels: true });
  library = withWorkspaceText(library, 'w1', { ref: { kind: 'user', id: 'text-1' } });
  library = withWorkspaceTarget(library, 'w1', { kind: 'single', target: { kind: 'layout', layoutId: 'colemak-dh' } });
  library = withWorkspaceTarget(library, 'w1', {
    kind: 'set',
    selection: { targets: [{ kind: 'layout', layoutId: 'qwerty' }], baseline: undefined, colorSlots: [0] },
  });
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
  assert.equal(WORKSPACE_LIBRARY_CODEC.encode(sample()).version, 2);
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
    version: 2,
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

test('従う / 固定とWorkspaceの対象は往復で保たれ、Workspaceの対象が壊れていれば壊れた側だけ空へ戻す', () => {
  const decoded = WORKSPACE_LIBRARY_CODEC.decode(JSON.parse(JSON.stringify(WORKSPACE_LIBRARY_CODEC.encode(sample()))));
  assert.ok(decoded.ok);
  const workspace = findWorkspace(decoded.value, 'w1')!;
  assert.deepEqual(workspace.panes.map((p) => p.binding.mode), ['follow', 'fixed']);
  assert.deepEqual(workspace.target.single.target, { kind: 'layout', layoutId: 'colemak-dh' });
  assert.equal(workspace.target.set.targets.length, 1);

  const broken = WORKSPACE_LIBRARY_CODEC.decode({
    version: 2,
    workspaces: [{ id: 'w', name: 'n', target: { single: { kind: 'nope' }, set: { targets: [{ kind: 'layout', layoutId: 'qwerty' }] } } }],
  });
  assert.ok(broken.ok);
  assert.deepEqual(broken.value[0]!.target.single, { target: undefined });
  assert.equal(broken.value[0]!.target.set.targets.length, 1);
  assert.ok(broken.diagnostics.length >= 1);
  const missing = WORKSPACE_LIBRARY_CODEC.decode({ version: 2, workspaces: [{ id: 'w', name: 'n' }] });
  assert.ok(missing.ok);
  assert.deepEqual(missing.value[0]!.target.single, { target: undefined });
  assert.deepEqual(missing.value[0]!.target.set.targets, []);
});

test('名前・テキストの選択が壊れていれば既定へ戻し、診断を出す', () => {
  const result = WORKSPACE_LIBRARY_CODEC.decode({
    version: 2,
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
    version: 2,
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
    version: 2,
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
    version: 2,
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
    version: 2,
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
