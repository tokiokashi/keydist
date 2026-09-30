import assert from 'node:assert/strict';
import test from 'node:test';
import {
  layoutPaneIds,
  normalizeLayout,
  sameLayout,
  type WorkspaceLayoutNode,
} from '#engine/workspace-layout.ts';
import { fromDockviewLayout, toDockviewLayout, PANE_COMPONENT } from './layout-adapter.ts';

const group = (paneIds: readonly string[], weight = 1, activePaneId?: string): WorkspaceLayoutNode => ({
  kind: 'group',
  paneIds,
  ...(activePaneId === undefined ? {} : { activePaneId }),
  weight,
});
const split = (direction: 'row' | 'column', children: readonly WorkspaceLayoutNode[], weight = 1): WorkspaceLayoutNode => ({
  kind: 'split',
  direction,
  children,
  weight,
});

const OPTIONS = { width: 1000, height: 600, titleOf: (id: string) => `タイトル ${id}`, hideTabs: false };

test('toDockviewLayout: 横に並べた2つは、ルートが横向きの枝で、幅を重みの比で割る', () => {
  const json = toDockviewLayout(split('row', [group(['a'], 1), group(['b'], 3)]), OPTIONS);
  assert.equal(json.grid.orientation, 'HORIZONTAL');
  assert.equal(json.grid.width, 1000);
  assert.equal(json.grid.height, 600);
  const root = json.grid.root;
  assert.equal(root.type, 'branch');
  assert.equal(root.size, 600);
  const sizes = (root.data as { size: number }[]).map((child) => child.size);
  assert.deepEqual(sizes, [250, 750]);
  assert.deepEqual(Object.keys(json.panels).sort(), ['a', 'b']);
  assert.equal(json.panels.a!.contentComponent, PANE_COMPONENT);
  assert.equal(json.panels.a!.title, 'タイトル a');
  assert.deepEqual(json.panels.a!.params, { paneId: 'a' });
});

test('toDockviewLayout: 1つのgroupだけなら、子が1つの枝に包む', () => {
  const json = toDockviewLayout(group(['a']), OPTIONS);
  const root = json.grid.root;
  assert.equal(root.type, 'branch');
  const children = root.data as { type: string; size: number }[];
  assert.equal(children.length, 1);
  assert.equal(children[0]!.type, 'leaf');
  assert.equal(children[0]!.size, 1000);
});

test('toDockviewLayout: 縦の分割はルートが縦向きで、入れ子は直交する向きの大きさを持つ', () => {
  const layout = split('column', [group(['a'], 1), split('row', [group(['b'], 1), group(['c'], 1)], 1)]);
  const json = toDockviewLayout(layout, OPTIONS);
  assert.equal(json.grid.orientation, 'VERTICAL');
  assert.equal(json.grid.root.size, 1000);
  const [first, second] = json.grid.root.data as { type: string; size: number; data: unknown }[];
  assert.equal(first!.size, 300);
  assert.equal(second!.type, 'branch');
  assert.equal(second!.size, 300);
  const inner = (second!.data as { size: number }[]).map((node) => node.size);
  assert.deepEqual(inner, [500, 500]);
});

test('toDockviewLayout: タブの組と前面のペイン。タブを出さない指定ではgroupのヘッダーを隠す', () => {
  const layout = group(['a', 'b'], 1, 'b');
  const shown = toDockviewLayout(layout, OPTIONS);
  const leaf = (shown.grid.root.data as { data: { views: string[]; activeView: string; hideHeader?: boolean } }[])[0]!.data;
  assert.deepEqual(leaf.views, ['a', 'b']);
  assert.equal(leaf.activeView, 'b');
  assert.equal(leaf.hideHeader, undefined);
  const hidden = toDockviewLayout(layout, { ...OPTIONS, hideTabs: true });
  const hiddenLeaf = (hidden.grid.root.data as { data: { hideHeader?: boolean } }[])[0]!.data;
  assert.equal(hiddenLeaf.hideHeader, true);
});

test('往復: 自前の配置 → Dockviewの形 → 自前の配置で、並び・向き・タブ・比が保たれる', () => {
  const layouts: WorkspaceLayoutNode[] = [
    group(['a']),
    split('row', [group(['a'], 1), group(['b'], 2), group(['c'], 1)]),
    split('column', [group(['a'], 2), split('row', [group(['b'], 1), group(['c', 'd'], 3, 'd')], 1)]),
  ];
  for (const original of layouts) {
    const ids = layoutPaneIds(original);
    const restored = fromDockviewLayout(toDockviewLayout(original, OPTIONS), ids);
    assert.ok(sameLayout(restored, normalizeLayout(original, ids)), JSON.stringify({ original, restored }));
  }
});

test('往復: 画面の大きさを変えて読み直しても、重みの比は変わらない', () => {
  const original = split('row', [group(['a'], 1), group(['b'], 3)]);
  const wide = fromDockviewLayout(toDockviewLayout(original, { ...OPTIONS, width: 1600 }), ['a', 'b']);
  const narrow = fromDockviewLayout(toDockviewLayout(original, { ...OPTIONS, width: 400 }), ['a', 'b']);
  assert.ok(sameLayout(wide, narrow));
});

test('fromDockviewLayout: 画素の丸めで数画素ずれた形も、許容内なら同じ配置とみなす', () => {
  const original = split('row', [group(['a'], 1), group(['b'], 2)]);
  const json = toDockviewLayout(original, OPTIONS);
  const children = json.grid.root.data as { size: number }[];
  children[0]!.size += 3;
  children[1]!.size -= 3;
  const restored = fromDockviewLayout(json, ['a', 'b']);
  assert.ok(sameLayout(restored, original));
});

test('fromDockviewLayout: ペインの集まりと食い違う配置は直し、Dockviewに残ったペインの外を落とす', () => {
  const json = toDockviewLayout(split('row', [group(['a']), group(['ghost'])]), OPTIONS);
  const restored = fromDockviewLayout(json, ['a', 'b']);
  assert.deepEqual(layoutPaneIds(restored), ['a', 'b']);
});

test('fromDockviewLayout: 空のDockviewはペインが無ければ配置も無い', () => {
  const json = {
    grid: { root: { type: 'branch', size: 100, data: [] }, width: 100, height: 100, orientation: 'HORIZONTAL' },
    panels: {},
  } as unknown as Parameters<typeof fromDockviewLayout>[0];
  assert.equal(fromDockviewLayout(json, []), undefined);
});
