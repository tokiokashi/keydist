import type { SerializedDockview } from 'dockview-react';
import {
  normalizeLayout,
  type WorkspaceLayout,
  type WorkspaceLayoutDirection,
  type WorkspaceLayoutNode,
} from '#engine/workspace-layout.ts';

/**
 * Workspaceの配置（`engine/workspace-layout.ts`の自前の木）と、Dockviewの保存形式との変換。
 *
 * Dockviewの形はこのファイルの中だけに閉じる。資産（保存データ）には自前の木を持ち、
 * Dockviewを更新しても保存済みのWorkspaceが読めなくなるのはここの変換だけで済む
 * （#544 レビューゲート5「Dockviewの保存形式をそのまま資産のschemaにしていない」）。
 *
 * このファイルは型だけをDockviewから読む（`import type`）。実行時にDockviewを読まないので、
 * Nodeのunit testからそのまま呼べる。
 */

/** Dockviewが直列化に使う向きの名前。列挙型を実行時にimportしないため、文字列で持つ。 */
const HORIZONTAL = 'HORIZONTAL';
const VERTICAL = 'VERTICAL';

/** Dockviewに渡すペインの部品の名前（`WorkspaceDock`の`components`と揃える）。 */
export const PANE_COMPONENT = 'pane';

export interface DockviewLayoutOptions {
  /** 配置を並べる領域の大きさ（画素）。重みの比をこの大きさへ割り振る。 */
  readonly width: number;
  readonly height: number;
  /** ペインid → タブに出す名前。 */
  readonly titleOf: (paneId: string) => string;
  /** タブの帯を出さない（ペインの見出しだけにする）。 */
  readonly hideTabs: boolean;
}

type GridNode = SerializedDockview['grid']['root'];

function groupId(paneIds: readonly string[]): string {
  return `group-${paneIds[0]}`;
}

/**
 * 自前の配置をDockviewの保存形式へ変える。ルートは常に枝で、ルートがgroup1つなら、
 * 子が1つの枝に包む（Dockviewの形）。
 */
export function toDockviewLayout(layout: WorkspaceLayoutNode, options: DockviewLayoutOptions): SerializedDockview {
  const { width, height } = options;
  const panes: SerializedDockview['panels'] = {};

  const serialize = (
    node: WorkspaceLayoutNode,
    w: number,
    h: number,
    parent: WorkspaceLayoutDirection,
  ): GridNode => {
    const size = parent === 'row' ? w : h;
    if (node.kind === 'group') {
      for (const id of node.paneIds) {
        panes[id] = { id, contentComponent: PANE_COMPONENT, title: options.titleOf(id), params: { paneId: id } };
      }
      return {
        type: 'leaf',
        size,
        data: {
          id: groupId(node.paneIds),
          views: [...node.paneIds],
          activeView: node.activePaneId ?? node.paneIds[0]!,
          ...(options.hideTabs ? { hideHeader: true } : {}),
        },
      };
    }
    const total = node.children.reduce((sum, child) => sum + child.weight, 0);
    return {
      type: 'branch',
      size,
      data: node.children.map((child) => {
        const fraction = child.weight / total;
        return serialize(
          child,
          node.direction === 'row' ? w * fraction : w,
          node.direction === 'column' ? h * fraction : h,
          node.direction,
        );
      }),
    };
  };

  const orientation = layout.kind === 'split' && layout.direction === 'column' ? VERTICAL : HORIZONTAL;
  const rootDirection: WorkspaceLayoutDirection = orientation === HORIZONTAL ? 'row' : 'column';
  const root: GridNode = layout.kind === 'split'
    ? { ...serialize(layout, width, height, rootDirection === 'row' ? 'column' : 'row'), size: rootDirection === 'row' ? height : width }
    : { type: 'branch', size: height, data: [serialize(layout, width, height, 'row')] };

  const firstGroup = layoutFirstGroupId(layout);
  return {
    grid: { root, width, height, orientation: orientation as SerializedDockview['grid']['orientation'] },
    panels: panes,
    ...(firstGroup === undefined ? {} : { activeGroup: firstGroup }),
  };
}

function layoutFirstGroupId(layout: WorkspaceLayoutNode): string | undefined {
  if (layout.kind === 'group') return groupId(layout.paneIds);
  return layoutFirstGroupId(layout.children[0]!);
}

/**
 * Dockviewの保存形式から自前の配置を作る。重みは兄弟どうしの割合（小数4桁）にする。
 * ペインの集まり（`paneIds`）と食い違う部分は`normalizeLayout`が直す。
 */
export function fromDockviewLayout(serialized: SerializedDockview, paneIds: readonly string[]): WorkspaceLayout {
  const walk = (node: GridNode, direction: WorkspaceLayoutDirection): WorkspaceLayoutNode | undefined => {
    const size = typeof node.size === 'number' && node.size > 0 ? node.size : 1;
    if (node.type === 'leaf') {
      const data = node.data as { views?: readonly string[]; activeView?: string };
      const views = Array.isArray(data.views) ? data.views : [];
      if (views.length === 0) return undefined;
      return {
        kind: 'group',
        paneIds: views,
        ...(data.activeView === undefined ? {} : { activePaneId: data.activeView }),
        weight: size,
      };
    }
    const children = (Array.isArray(node.data) ? node.data : [])
      // 枝の子は、親と直交する向きに並ぶ
      .map((child) => walk(child as GridNode, direction === 'row' ? 'column' : 'row'))
      .filter((child): child is WorkspaceLayoutNode => child !== undefined);
    if (children.length === 0) return undefined;
    return { kind: 'split', direction, children: roundedFractions(children), weight: size };
  };

  const rootDirection: WorkspaceLayoutDirection = serialized.grid.orientation === (VERTICAL as unknown) ? 'column' : 'row';
  const root = walk(serialized.grid.root, rootDirection);
  return normalizeLayout(root, paneIds);
}

/** 兄弟の重みを、合計1の割合（小数4桁）へ直す。画素の大きさそのものは保存しない。 */
function roundedFractions(children: readonly WorkspaceLayoutNode[]): WorkspaceLayoutNode[] {
  const total = children.reduce((sum, child) => sum + child.weight, 0);
  return children.map((child) => ({ ...child, weight: Math.max(0.0001, Math.round((child.weight / total) * 10000) / 10000) }));
}
