/**
 * Workspaceのペインの並び（配置）。
 *
 * ペインを載せるライブラリ（Dockview）の保存形式をそのまま資産にすると、ライブラリを
 * 更新した時に保存済みのWorkspaceが読めなくなり、ライブラリを替える時に資産の形も
 * 巻き込む（#544 レビューゲート5）。そのためこの資産は自前の小さな木で持ち、
 * ライブラリとの変換は載せる側（`hosts/workspace/`）が行う。
 *
 * 木の葉は「タブでまとめて出すペインの組」（`group`）、枝は「並べる方向つきの分割」（`split`）。
 * `weight` は同じ枝の兄弟どうしの大きさの比で、画面の大きさそのものは持たない
 * （画面の大きさが変わっても、同じ比で並べ直せるようにするため）。
 *
 * 不変条件（`normalizeLayout` が保証する）:
 * - 資産に載っているペインは、どれもちょうど1つのgroupに入る。載っていないペインは入らない
 * - groupは空にならない。splitは子を2つ以上持つ
 * - splitの子に、同じ向きのsplitを直接置かない（親へ畳む）
 * - `weight` は正の有限数
 */
export type WorkspaceLayoutDirection = 'row' | 'column';

export interface WorkspaceGroupNode {
  readonly kind: 'group';
  readonly paneIds: readonly string[];
  /** タブのうち前面に出しているペイン。省略なら先頭。 */
  readonly activePaneId?: string;
  readonly weight: number;
}

export interface WorkspaceSplitNode {
  readonly kind: 'split';
  readonly direction: WorkspaceLayoutDirection;
  readonly children: readonly WorkspaceLayoutNode[];
  readonly weight: number;
}

export type WorkspaceLayoutNode = WorkspaceGroupNode | WorkspaceSplitNode;

/** ペインが1つも無い時は木も無い。 */
export type WorkspaceLayout = WorkspaceLayoutNode | undefined;

/** 配置に載っているペインのidを、画面の並び（左→右・上→下）の順に返す。 */
export function layoutPaneIds(layout: WorkspaceLayout): readonly string[] {
  if (layout === undefined) return [];
  if (layout.kind === 'group') return layout.paneIds;
  return layout.children.flatMap((child) => layoutPaneIds(child));
}

function validWeight(weight: unknown): number {
  return typeof weight === 'number' && Number.isFinite(weight) && weight > 0 ? weight : 1;
}

/**
 * 不変条件を満たす形へ直す。外から来た値（保存データ）と、編集の途中でできた形の両方に使う。
 * `paneIds` は資産に載っているペイン。木に無いペインは、右端に新しいgroupとして足す
 * （ペインを失わないため）。
 */
export function normalizeLayout(layout: WorkspaceLayout, paneIds: readonly string[]): WorkspaceLayout {
  const known = new Set(paneIds);
  const placed = new Set<string>();

  const walk = (node: WorkspaceLayoutNode): WorkspaceLayoutNode | undefined => {
    if (node.kind === 'group') {
      const ids: string[] = [];
      for (const id of node.paneIds) {
        // 未知のペインと、2回目以降の出現（同じペインを2か所に置かない）は捨てる
        if (!known.has(id) || placed.has(id)) continue;
        placed.add(id);
        ids.push(id);
      }
      if (ids.length === 0) return undefined;
      const active = node.activePaneId !== undefined && ids.includes(node.activePaneId) ? node.activePaneId : undefined;
      return {
        kind: 'group',
        paneIds: ids,
        ...(active === undefined ? {} : { activePaneId: active }),
        weight: validWeight(node.weight),
      };
    }
    const children: WorkspaceLayoutNode[] = [];
    for (const child of node.children) {
      const next = walk(child);
      if (next === undefined) continue;
      if (next.kind === 'split' && next.direction === node.direction) {
        // 同じ向きの入れ子は親へ畳む。子の重みは、子が親の中で占める割合に按分する
        const total = next.children.reduce((sum, c) => sum + c.weight, 0);
        for (const grand of next.children) {
          children.push({ ...grand, weight: next.weight * (grand.weight / total) });
        }
      } else {
        children.push(next);
      }
    }
    if (children.length === 0) return undefined;
    if (children.length === 1) return { ...children[0]!, weight: validWeight(node.weight) };
    return { kind: 'split', direction: node.direction, children, weight: validWeight(node.weight) };
  };

  let root = layout === undefined ? undefined : walk(layout);
  for (const id of paneIds) {
    if (placed.has(id)) continue;
    placed.add(id);
    root = appendGroup(root, id);
  }
  return root === undefined ? undefined : { ...root, weight: 1 };
}

/** 最後の枠の右に新しいgroupを足す（ルートが横の分割ならその末尾へ、そうでなければ横に並べる）。 */
function appendGroup(root: WorkspaceLayoutNode | undefined, paneId: string): WorkspaceLayoutNode {
  const group: WorkspaceGroupNode = { kind: 'group', paneIds: [paneId], weight: 1 };
  if (root === undefined) return group;
  if (root.kind === 'split' && root.direction === 'row') {
    // 既存の並びの大きさの平均を新しい枠に割り当てる（急に細い枠や太い枠にしない）
    const average = root.children.reduce((sum, c) => sum + c.weight, 0) / root.children.length;
    return { ...root, children: [...root.children, { ...group, weight: average }] };
  }
  return { kind: 'split', direction: 'row', children: [{ ...root, weight: 1 }, group], weight: 1 };
}

/** ペインを追加した配置（右端に新しい枠）。 */
export function layoutWithPane(layout: WorkspaceLayout, paneId: string): WorkspaceLayout {
  const next = appendGroup(layout, paneId);
  return normalizeLayout(next, [...layoutPaneIds(layout), paneId]);
}

/**
 * `referencePaneId` のペインの右隣に、新しい枠としてペインを置く（複製）。
 * 参照先が見つからなければ末尾へ置く。
 */
export function layoutWithPaneNextTo(layout: WorkspaceLayout, referencePaneId: string, paneId: string): WorkspaceLayout {
  const ids = [...layoutPaneIds(layout), paneId];
  if (layout === undefined || !layoutPaneIds(layout).includes(referencePaneId)) return layoutWithPane(layout, paneId);

  const insert = (node: WorkspaceLayoutNode): WorkspaceLayoutNode => {
    if (node.kind === 'group') {
      // 参照先のgroupを、[参照先のgroup, 新しいgroup]の横並びに置き換える。重みは元の枠の半分ずつ
      const half = node.weight / 2;
      return {
        kind: 'split',
        direction: 'row',
        weight: node.weight,
        children: [{ ...node, weight: half }, { kind: 'group', paneIds: [paneId], weight: half }],
      };
    }
    const index = node.children.findIndex((child) => layoutPaneIds(child).includes(referencePaneId));
    const target = node.children[index]!;
    if (node.direction === 'row' && target.kind === 'group') {
      const half = target.weight / 2;
      const children = [...node.children];
      children.splice(index, 1, { ...target, weight: half }, { kind: 'group', paneIds: [paneId], weight: half });
      return { ...node, children };
    }
    const children = [...node.children];
    children[index] = insert(target);
    return { ...node, children };
  };
  return normalizeLayout(insert(layout), ids);
}

/** ペインを取り除いた配置。空になった枠は消え、残りの大きさの比は保つ。 */
export function layoutWithoutPane(layout: WorkspaceLayout, paneId: string): WorkspaceLayout {
  return normalizeLayout(layout, layoutPaneIds(layout).filter((id) => id !== paneId));
}

/** 重みの差がこの割合以内なら、同じ配置とみなす（画面の大きさを整数の画素へ丸める誤差を吸収するため）。 */
export const LAYOUT_WEIGHT_TOLERANCE = 0.01;

function fractions(nodes: readonly WorkspaceLayoutNode[]): readonly number[] {
  const total = nodes.reduce((sum, node) => sum + node.weight, 0);
  return nodes.map((node) => node.weight / total);
}

function sameNode(a: WorkspaceLayoutNode, b: WorkspaceLayoutNode, tolerance: number): boolean {
  if (a.kind === 'group' && b.kind === 'group') {
    return a.paneIds.length === b.paneIds.length
      && a.paneIds.every((id, index) => id === b.paneIds[index])
      && (a.activePaneId ?? a.paneIds[0]) === (b.activePaneId ?? b.paneIds[0]);
  }
  if (a.kind === 'split' && b.kind === 'split') {
    if (a.direction !== b.direction || a.children.length !== b.children.length) return false;
    const fa = fractions(a.children);
    const fb = fractions(b.children);
    return a.children.every((child, index) =>
      Math.abs(fa[index]! - fb[index]!) <= tolerance && sameNode(child, b.children[index]!, tolerance));
  }
  return false;
}

/** 配置の同一性。並び・向き・タブの組・前面のペインが同じで、重みの比が許容内なら同じ。 */
export function sameLayout(a: WorkspaceLayout, b: WorkspaceLayout, tolerance: number = LAYOUT_WEIGHT_TOLERANCE): boolean {
  if (a === undefined || b === undefined) return a === b;
  return sameNode(a, b, tolerance);
}

/** 重みの比まで含めて厳密に同じか（保存する値の同値判定用）。 */
export function sameLayoutExactly(a: WorkspaceLayout, b: WorkspaceLayout): boolean {
  return sameLayout(a, b, 0);
}
