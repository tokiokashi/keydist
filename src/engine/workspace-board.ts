import { MAX_BOARD_HEIGHT_REM, type Workspace, type WorkspaceLibrary } from './workspace.ts';
import type { WorkspaceLayout, WorkspaceLayoutNode } from './workspace-layout.ts';

/**
 * 板（ペインを並べる面）の高さの計算（#833）。配置が要る高さと、ペインを足した時の高さの配分。
 *
 * 板の高さは「画面の高さ」と「保存した高さ（`Workspace.boardHeightRem`）」の大きい方になる（描画側）。
 * 保存した高さを書くのは、ここ（自動で伸ばす）と、人が板の下端のつまみで変える時（`resolveBoardHeightRem`の結果をコマンドが書く）の2つ。
 * 自動で伸ばすのは**配置の形が変わった時**（ペインの追加・複製・分割・タブの移動。閉じる操作では計算しない）に、
 * 形が変わった縦の分割（`changedColumnKeys`）の各ペインが下限を割るなら伸ばす（人が狭めて比を決めた列は数えない）。比の変化（サッシのドラッグ）は形を変えないので、板を動かさない。
 * 縮めるのは人の操作（つまみ）だけで、自動では縮めない。
 *
 * ペインの下限（Analyzerごとの値）と余白は、ペインを描く側が知っているので、`BoardPolicy` として渡す。
 * この層はそれらの値を持たない。単位はすべてrem。
 */
export interface BoardPolicy {
  /**
   * ペイン1つの高さの下限 [rem]（見出し・余白を含む）。ペインを足す時に板を伸ばす目安と、高さの配分の比に使う。
   * 人が板の下端のつまみで縮める下限には使わない（`minPaneRem`）。
   */
  readonly floorRemOfAnalyzer: (analyzerId: string) => number;
  /**
   * 人が縮められるペイン1つの高さ [rem]。これを割ると、並べる面（Dockview）がペインを縮められない。
   * 下限（`floorRemOfAnalyzer`）を割ったペインは、ペインの中でスクロールして受ける。
   */
  readonly minPaneRem: number;
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

function paneIdsFloor(node: Extract<WorkspaceLayoutNode, { kind: 'group' }>, floorRemOf: (paneId: string) => number): number {
  return Math.max(...node.paneIds.map(floorRemOf));
}

/** 中の比を見ずに、どのペインも下限を満たす高さ（下限の和 + 間の余白）。人が比を決めた縦の分割を数える時に使う。 */
function naturalHeightRem(node: WorkspaceLayoutNode, floorRemOf: (paneId: string) => number, gapRem: number): number {
  if (node.kind === 'group') return paneIdsFloor(node, floorRemOf);
  const needs = node.children.map((child) => naturalHeightRem(child, floorRemOf, gapRem));
  if (node.direction === 'row') return Math.max(...needs);
  return needs.reduce((sum, need) => sum + need, 0) + gapRem * (node.children.length - 1);
}

/**
 * 板の外周の余白を除いた、node の高さ [rem]。
 * `changed`に入る縦の分割は、各子が自分の下限を割らない割合を満たす最小の高さ（今の重みで「下限 ÷ 割合」の最大）。
 * 入らない縦の分割は、人が比を決めたものとして、その比では割らない。変わった分割の中にあれば下限の和 + 間
 * （`inside`）、外にあれば0（板を伸ばす理由にしない）。人が狭めた比で割ると、数千remまで膨らむため。
 * `changed`が無ければ、すべての縦の分割を比で数える。
 */
function requiredNodeHeightRem(
  node: WorkspaceLayoutNode,
  floorRemOf: (paneId: string) => number,
  gapRem: number,
  changed: ReadonlySet<string> | undefined,
  inside: boolean,
): number {
  if (node.kind === 'group') return paneIdsFloor(node, floorRemOf);
  if (node.direction === 'column' && changed !== undefined && !changed.has(layoutShapeKey(node))) {
    return inside ? naturalHeightRem(node, floorRemOf, gapRem) : 0;
  }
  const nextInside = inside || node.direction === 'column';
  const needs = node.children.map((child) => requiredNodeHeightRem(child, floorRemOf, gapRem, changed, nextInside));
  // 横に並べた子は、どれも同じ高さをもらう
  if (node.direction === 'row') return Math.max(...needs);
  // 縦に並べた子は、間の余白を除いた高さを重みの比で分け合う
  const total = node.children.reduce((sum, child) => sum + child.weight, 0);
  const gaps = gapRem * (node.children.length - 1);
  return Math.max(...node.children.map((child, i) => needs[i]! / (child.weight / total))) + gaps;
}

/** 配置の比を保ったまま、どのペインも下限を割らない板の高さ [rem]。ペインが無ければ0。`changed`は`changedColumnKeys`。 */
export function requiredBoardHeightRem(
  layout: WorkspaceLayout,
  floorRemOf: (paneId: string) => number,
  policy: Pick<BoardPolicy, 'paddingRem' | 'gapRem'>,
  changed?: ReadonlySet<string>,
): number {
  if (layout === undefined) return 0;
  return requiredNodeHeightRem(layout, floorRemOf, policy.gapRem, changed, false) + policy.paddingRem;
}

function isSubsequence(small: readonly string[], large: readonly string[]): boolean {
  let i = 0;
  for (const item of large) if (item === small[i]) i += 1;
  return i === small.length;
}

/**
 * 前の配置から見て「形が変わった」縦の分割（`layoutShapeKey`の集合）。
 * 縦の分割は、子の形が前のどれかの縦の分割の子の形の部分列になっている時（前の列からペインの段を取り除いただけ、
 * または何も変えていない時）に限り、変わっていない。それ以外はすべて変わった扱いで、新しいペイン・他所から来たペイン・
 * 段の入れ替え・段の中の組み替えを含む。変わった分割を囲む縦の分割も変わった扱い（子の形が変わるので部分列にならない）。
 * 比べる相手は前の列の「子」の形で、祖先や根の列と部分集合の関係にあるだけでは変わっていない扱いにしない
 * （根が縦の配置だと、中のドラッグがすべて「増えていない」になってしまう）。
 */
export function changedColumnKeys(layout: WorkspaceLayoutNode, previous: WorkspaceLayout): Set<string> {
  const previousChildKeys: string[][] = [];
  const collect = (node: WorkspaceLayoutNode) => {
    if (node.kind === 'group') return;
    if (node.direction === 'column') previousChildKeys.push(node.children.map(layoutShapeKey));
    node.children.forEach(collect);
  };
  if (previous !== undefined) collect(previous);

  const changed = new Set<string>();
  const walk = (node: WorkspaceLayoutNode) => {
    if (node.kind === 'group') return;
    node.children.forEach(walk);
    if (node.direction !== 'column') return;
    const keys = node.children.map(layoutShapeKey);
    if (!previousChildKeys.some((before) => isSubsequence(keys, before))) changed.add(layoutShapeKey(node));
  };
  walk(layout);
  return changed;
}

/**
 * 形が変わった縦の分割（`changedColumnKeys`）は、子の高さを各子の下限に比例させる（等分にしない）。
 * 足すたびに、足したペインを含む列と、それを囲む列の他のペインの比も動く。変わっていない分割（形が同じ・段を取り除いただけ）の
 * 比は、人が調整したサッシとして動かさない。比に使う子の必要高さも、変わっていない縦の分割は下限の和で数える。
 */
export function distributeByFloor(
  layout: WorkspaceLayoutNode,
  previous: WorkspaceLayout,
  floorRemOf: (paneId: string) => number,
  gapRem: number,
): WorkspaceLayoutNode {
  const changed = changedColumnKeys(layout, previous);
  const walk = (node: WorkspaceLayoutNode): WorkspaceLayoutNode => {
    if (node.kind === 'group') return node;
    const children = node.children.map(walk);
    if (node.direction !== 'column' || !changed.has(layoutShapeKey(node))) return { ...node, children };
    const needs = children.map((child) => requiredNodeHeightRem(child, floorRemOf, gapRem, changed, true));
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
  // 板を伸ばす理由にするのは、形が変わった縦の分割だけ。人が比を決めた分割（変わっていない列）は数えない
  const required = requiredBoardHeightRem(distributed, floorRemOf, policy, changedColumnKeys(layout, before.layout));
  const need = Math.min(MAX_BOARD_HEIGHT_REM, Math.ceil(required * 100) / 100);
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

/** つまみで伸ばせる上限を、1画面の何倍にするか。 */
const BOARD_MAX_SCREENS = 4;

/**
 * 各ペインを`floorRemOf`まで縮めた時の板の高さ [rem]（その和 + 間の余白 + 外周の余白）。比は見ない。ペインが無ければ0。
 * 人がつまみで縮める下限には、ペインを足す目安の下限ではなく、縮められる限界（`BoardPolicy.minPaneRem`）を渡す（#896）。
 */
export function minBoardHeightRem(
  layout: WorkspaceLayout,
  floorRemOf: (paneId: string) => number,
  policy: Pick<BoardPolicy, 'paddingRem' | 'gapRem'>,
): number {
  if (layout === undefined) return 0;
  return naturalHeightRem(layout, floorRemOf, policy.gapRem) + policy.paddingRem;
}

/** 板の下端のつまみが扱える高さの範囲 [rem]。 */
export interface BoardResizeBounds {
  /** 縮められる下限。 */
  readonly minRem: number;
  /** 伸ばせる上限。1画面の4倍。ペインの下限の和・今の高さがそれより大きければそちら（`MAX_BOARD_HEIGHT_REM`を超えない）。 */
  readonly maxRem: number;
  /** 1画面ぶんの高さ。板は保存値がこれ以下なら1画面なので、これ以下を保存する意味は無い。 */
  readonly oneScreenRem: number;
}

/**
 * 板の高さの範囲。縮める下限は「ペインを縮められる限界の和」（`minRem`）と「1画面」の大きい方で、1画面より小さくはならない
 * （板は画面の高さを下回らない）。ペインを足す目安の下限（Analyzerごと）は縮める下限に使わない。目安を割ったペインは
 * ペインの中でスクロールするので、人が縮めてよい（#896）。
 * 今の高さ（`currentRem`）が`minRem`を割っている時は、その今の高さまで。操作しただけで板が跳ね上がらないようにする。
 */
export function boardResizeBounds(minRem: number, oneScreenRem: number, currentRem: number): BoardResizeBounds {
  const floor = Math.max(minRem, oneScreenRem);
  const maxRem = Math.min(MAX_BOARD_HEIGHT_REM, Math.max(oneScreenRem * BOARD_MAX_SCREENS, minRem, currentRem));
  return { minRem: Math.min(floor, Math.max(currentRem, oneScreenRem)), maxRem, oneScreenRem };
}

/**
 * つまみで望んだ高さを、保存する値にする。範囲に収め、0.01remに丸める。
 * 1画面以下になる時は`undefined`（保存しない = 自動で1画面）。
 */
export function resolveBoardHeightRem(requestedRem: number, bounds: BoardResizeBounds): number | undefined {
  if (!Number.isFinite(requestedRem)) return undefined;
  const clamped = Math.min(bounds.maxRem, Math.max(bounds.minRem, requestedRem));
  const rounded = Math.round(clamped * 100) / 100;
  return rounded <= bounds.oneScreenRem + 0.01 ? undefined : rounded;
}
