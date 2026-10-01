import type { SerializedDockview } from 'dockview-react';
import type { WorkspaceLayoutNode } from '#engine/workspace-layout.ts';

/**
 * 【試作 #833】板の高さを自動で伸ばす案の、計算の部分。マージしない。
 * `?board=a|b|c` で案を切り替えて見比べる（何も付けない・`main`は今の作り）。
 */
export type BoardMode = 'main' | 'a' | 'b' | 'c';

export function parseBoardMode(search: string): BoardMode {
  const value = new URLSearchParams(search).get('board');
  return value === 'a' || value === 'b' || value === 'c' ? value : 'main';
}

/** ペイン1つの高さの下限（タブの帯を含む、画素）。Analyzerごとに持つ値の仮置き。 */
export const PANE_FLOOR: Readonly<Record<string, number>> = {
  'bigram-flow': 520,
  'n-sensitivity': 480,
  comparison: 280,
};
export const DEFAULT_FLOOR = 360;

/** 案Cの、縦に1段積むごとの最小の高さ。 */
export const ROW_MIN = 480;

/** Dockviewのgroupが縮められる下限（既定）。 */
const GROUP_MIN = 100;
/** ペインの間の余白（`WorkspaceDock.tsx`の`PANE_GAP`と同じ）。子の高さの和には含まれず、枝の高さには含まれる。 */
const GAP = 8;

/**
 * 配置の比を保ったまま、どのペインも下限を割らない板の高さ。
 * 縦の分割は、各子が「自分の下限 ÷ 自分の占める割合」を満たす必要があるので、その最大。
 */
export function requiredHeight(node: WorkspaceLayoutNode, floorOf: (paneId: string) => number): number {
  if (node.kind === 'group') return Math.max(...node.paneIds.map(floorOf));
  if (node.direction === 'row') return Math.max(...node.children.map((child) => requiredHeight(child, floorOf)));
  const total = node.children.reduce((sum, child) => sum + child.weight, 0);
  return Math.max(...node.children.map((child) => requiredHeight(child, floorOf) / (child.weight / total)));
}

/** 配置の形（ペインの出入りと分割）だけの文字列。比（重み）は含めない。 */
export function shapeKey(node: WorkspaceLayoutNode): string {
  if (node.kind === 'group') return `g(${node.paneIds.join(',')})`;
  return `${node.direction[0]}[${node.children.map(shapeKey).join(' ')}]`;
}

/** 縦に積まれた段の数（案C）。列ごとの段の和の最大。 */
export function stackDepth(node: WorkspaceLayoutNode): number {
  if (node.kind === 'group') return 1;
  if (node.direction === 'row') return Math.max(...node.children.map(stackDepth));
  return node.children.reduce((sum, child) => sum + stackDepth(child), 0);
}

// ---- 案A: サッシを動かしたペインだけが変わり、下のペインは動かない（板が追従する） ----

type GridNode = Required<SerializedDockview['grid']['root']>;
type Branch = { size: number; data: GridNode[] };

function isVertical(orientation: unknown, depth: number): boolean {
  const rootVertical = orientation === 'VERTICAL';
  return depth % 2 === 0 ? rootVertical : !rootVertical;
}

function childrenOf(node: GridNode): GridNode[] {
  return Array.isArray(node.data) ? (node.data as GridNode[]) : [];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 最も外側の、子の高さが変わった縦の枝。サッシはその枝の中にある。 */
function findDragged(before: GridNode, after: GridNode, orientation: unknown, depth: number): { path: number[]; sizes: number[] } | undefined {
  if (before.type !== 'branch' || after.type !== 'branch') return undefined;
  const a = childrenOf(before);
  const b = childrenOf(after);
  if (a.length !== b.length) return undefined;
  if (isVertical(orientation, depth)) {
    const diffs = a.map((child, i) => b[i]!.size - child.size);
    if (diffs.some((d) => Math.abs(d) > 1)) return { path: [], sizes: diffs };
  }
  for (let i = 0; i < a.length; i++) {
    const found = findDragged(a[i]!, b[i]!, orientation, depth + 1);
    if (found !== undefined) return { path: [i, ...found.path], sizes: found.sizes };
  }
  return undefined;
}

/** 枝の下に必要な高さ。縦の枝は子の高さの和、横の枝は子の最大。`follow`の子は、自分の中身に合わせて高さを持ち直す。 */
function natural(node: GridNode, orientation: unknown, depth: number, follow: ReadonlySet<GridNode>): number {
  if (node.type !== 'branch') return 0;
  const children = childrenOf(node);
  if (isVertical(orientation, depth)) {
    let sum = 0;
    for (const child of children) {
      const need = natural(child, orientation, depth + 1, follow);
      if (follow.has(child)) child.size = Math.max(need, GROUP_MIN);
      sum += child.size;
    }
    return sum + Math.max(0, children.length - 1) * GAP;
  }
  return Math.max(0, ...children.map((child) => natural(child, orientation, depth + 1, follow)));
}

/** 高さ`height`に合わせる。縦の枝は、余りと不足を最後の子に持たせる。 */
function fit(node: GridNode, orientation: unknown, depth: number, height: number): void {
  if (node.type !== 'branch') return;
  const children = childrenOf(node);
  if (isVertical(orientation, depth)) {
    const sum = children.reduce((s, child) => s + child.size, 0) + Math.max(0, children.length - 1) * GAP;
    const last = children[children.length - 1];
    if (last !== undefined) last.size = Math.max(GROUP_MIN, last.size + (height - sum));
    for (const child of children) fit(child, orientation, depth + 1, child.size);
  } else {
    for (const child of children) fit(child, orientation, depth + 1, height);
  }
}

export interface FixedLayout {
  readonly json: SerializedDockview;
  readonly height: number;
}

/**
 * サッシを動かした後の形（`after`）を、案Aの動きに直す。サッシより上の段は動かした結果のまま、下の段は動かす前の高さのまま。
 * 板の高さは、全部の列のうち一番高いものと画面の高さ（`avail`）の大きい方になる。動いたサッシが無ければundefined。
 */
export function followSash(before: SerializedDockview, after: SerializedDockview, avail: number): FixedLayout | undefined {
  const orientation = after.grid.orientation;
  const found = findDragged(before.grid.root as GridNode, after.grid.root as GridNode, orientation, 0);
  if (found === undefined) return undefined;
  const next = clone(after);
  // 動いたサッシの位置。伸びた子が1つで、縮んだ子が前にあれば伸びた子の直前、後ろにあれば伸びた子の直後
  const grown = found.sizes.findIndex((d) => d > 1);
  if (grown < 0) return undefined;
  const shrankBefore = found.sizes.slice(0, grown).some((d) => d < -1);
  const sash = shrankBefore ? grown - 1 : grown;

  // 道筋を辿って、動いた枝と、その祖先（道筋）を集める
  let node: GridNode = next.grid.root as GridNode;
  const follow = new Set<GridNode>();
  let beforeNode: GridNode = before.grid.root as GridNode;
  for (const index of found.path) {
    node = childrenOf(node)[index]!;
    beforeNode = childrenOf(beforeNode)[index]!;
    follow.add(node);
  }
  const children = childrenOf(node);
  const oldChildren = childrenOf(beforeNode);
  children.forEach((child, i) => {
    if (i > sash) child.size = oldChildren[i]!.size;
  });
  // 動いた枝の祖先のうち、縦の枝の子（＝道筋）は、中身が変わった分だけ高さを持ち直す
  follow.delete(node);

  const need = natural(next.grid.root as GridNode, orientation, 0, follow);
  const height = Math.max(avail, Math.round(need));
  fit(next.grid.root as GridNode, orientation, 0, height);
  next.grid.height = height;
  if (!isVertical(orientation, 0)) next.grid.root.size = height;
  return { json: next, height };
}

/** 板の高さだけを変える（案A・Bの下端のハンドル）。縦の枝は最後の段が増減を受ける（案A） */
export function resizeBoard(json: SerializedDockview, height: number): SerializedDockview {
  const next = clone(json);
  fit(next.grid.root as GridNode, next.grid.orientation, 0, height);
  next.grid.height = height;
  if (!isVertical(next.grid.orientation, 0)) next.grid.root.size = height;
  return next;
}

export type { Branch };
