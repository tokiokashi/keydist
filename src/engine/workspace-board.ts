import { MAX_BOARD_HEIGHT_REM, type Workspace, type WorkspaceLibrary } from './workspace.ts';
import type { WorkspaceLayout, WorkspaceLayoutNode } from './workspace-layout.ts';

/**
 * 板（ペインを並べる面）の高さの計算（#833）。配置が要る高さと、ペインを足した時の高さの配分。
 *
 * 板の高さは「画面の高さ」と「保存した高さ（`Workspace.boardHeightRem`）」の大きい方になる（描画側）。
 * 保存した高さを書くのはここだけで、**配置の形が変わった時**（ペインの追加・複製・閉じる・分割・タブの移動）に、
 * 各ペインが下限を割るなら伸ばす。比の変化（サッシのドラッグ）は形を変えないので、板を動かさない。
 * 縮めるのは人の操作だけ（自動では縮めない）。
 *
 * ペインの下限（Analyzerごとの値）と余白は、ペインを描く側が知っているので、`BoardPolicy` として渡す。
 * この層はそれらの値を持たない。単位はすべてrem。
 */
export interface BoardPolicy {
  /** ペイン1つの高さの下限 [rem]（見出し・余白を含む）。 */
  readonly floorRemOfAnalyzer: (analyzerId: string) => number;
  /** 板の外周の余白（上下の合計）[rem]。 */
  readonly paddingRem: number;
  /** 縦に並ぶペインの間の余白 [rem]。 */
  readonly gapRem: number;
}

/** 配置の形（ペインの出入り・分割・タブの組）だけの文字列。重み（比）・前面のタブ・タブの並び順は含めない（タブの並べ替えで他の比を動かさないため）。 */
export function layoutShapeKey(node: WorkspaceLayoutNode): string {
  if (node.kind === 'group') return `g(${[...node.paneIds].sort().join(',')})`;
  return `${node.direction === 'row' ? 'r' : 'c'}[${node.children.map(layoutShapeKey).join(' ')}]`;
}

/** 板の外周の余白を除いた、node の高さ [rem]。縦の分割は、各子が自分の下限を割らない割合を満たす最小の高さ。 */
function requiredNodeHeightRem(node: WorkspaceLayoutNode, floorRemOf: (paneId: string) => number, gapRem: number): number {
  if (node.kind === 'group') return Math.max(...node.paneIds.map(floorRemOf));
  const needs = node.children.map((child) => requiredNodeHeightRem(child, floorRemOf, gapRem));
  // 横に並べた子は、どれも同じ高さをもらう
  if (node.direction === 'row') return Math.max(...needs);
  // 縦に並べた子は、間の余白を除いた高さを重みの比で分け合う
  const total = node.children.reduce((sum, child) => sum + child.weight, 0);
  const gaps = gapRem * (node.children.length - 1);
  return Math.max(...node.children.map((child, i) => needs[i]! / (child.weight / total))) + gaps;
}

/** 配置の比を保ったまま、どのペインも下限を割らない板の高さ [rem]。ペインが無ければ0。 */
export function requiredBoardHeightRem(
  layout: WorkspaceLayout,
  floorRemOf: (paneId: string) => number,
  policy: Pick<BoardPolicy, 'paddingRem' | 'gapRem'>,
): number {
  if (layout === undefined) return 0;
  return requiredNodeHeightRem(layout, floorRemOf, policy.gapRem) + policy.paddingRem;
}

/**
 * 新しく現れた形の縦の分割は、子の高さを各子の下限に比例させる（等分にしない）。
 * 前の配置に同じ形の部分が無い縦の分割だけが対象で、前からある部分の比（人が調整したサッシ）は動かさない。
 * 足すたびに、足したペインを含む列の他のペインの比も動く。
 */
export function distributeByFloor(
  layout: WorkspaceLayoutNode,
  previous: WorkspaceLayout,
  floorRemOf: (paneId: string) => number,
  gapRem: number,
): WorkspaceLayoutNode {
  const known = new Set<string>();
  const collect = (node: WorkspaceLayoutNode) => {
    known.add(layoutShapeKey(node));
    if (node.kind === 'split') node.children.forEach(collect);
  };
  if (previous !== undefined) collect(previous);

  const walk = (node: WorkspaceLayoutNode): WorkspaceLayoutNode => {
    if (node.kind === 'group') return node;
    const children = node.children.map(walk);
    if (node.direction === 'row' || known.has(layoutShapeKey(node))) return { ...node, children };
    const needs = children.map((child) => requiredNodeHeightRem(child, floorRemOf, gapRem));
    const total = needs.reduce((sum, need) => sum + need, 0);
    return {
      ...node,
      children: children.map((child, i) => ({ ...child, weight: Math.max(0.0001, Math.round((needs[i]! / total) * 10000) / 10000) })),
    };
  };
  return walk(layout);
}

/**
 * 配置が変わった後のWorkspaceに、板の高さを合わせる。形が変わっていなければ何もしない。
 * `redistribute`なら新しい形の縦の分割を下限の比に配り直す（ペインを足す・複製する・並びを組み替える時）。
 * 板の高さは伸ばすだけで、必要な高さが保存値以下なら動かさない。
 */
export function fitBoardToLayout(
  before: Workspace,
  after: Workspace,
  policy: BoardPolicy,
  redistribute: boolean,
): Workspace {
  const layout = after.layout;
  if (layout === undefined) return after;
  if (before.layout !== undefined && layoutShapeKey(before.layout) === layoutShapeKey(layout)) return after;

  const analyzerOf = new Map(after.panes.map((pane) => [pane.id, pane.analyzerId]));
  const floorRemOf = (paneId: string) => policy.floorRemOfAnalyzer(analyzerOf.get(paneId) ?? '');
  const distributed = redistribute ? distributeByFloor(layout, before.layout, floorRemOf, policy.gapRem) : layout;
  const need = Math.min(MAX_BOARD_HEIGHT_REM, Math.ceil(requiredBoardHeightRem(distributed, floorRemOf, policy) * 100) / 100);
  const boardHeightRem = need > (after.boardHeightRem ?? 0) ? need : after.boardHeightRem;
  return {
    ...after,
    layout: distributed,
    ...(boardHeightRem === undefined ? {} : { boardHeightRem }),
  };
}

/** 1つのWorkspaceだけ、前の手持ちとの差を見て板の高さを合わせる（コマンドの共通部分）。 */
export function fitLibraryBoard(
  before: WorkspaceLibrary,
  after: WorkspaceLibrary,
  workspaceId: string,
  policy: BoardPolicy | undefined,
  redistribute: boolean,
): WorkspaceLibrary {
  if (policy === undefined || after === before) return after;
  const previous = before.find((workspace) => workspace.id === workspaceId);
  const current = after.find((workspace) => workspace.id === workspaceId);
  if (previous === undefined || current === undefined) return after;
  const fitted = fitBoardToLayout(previous, current, policy, redistribute);
  return fitted === current ? after : after.map((workspace) => (workspace === current ? fitted : workspace));
}
