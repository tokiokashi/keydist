import { analysisTargetKey, type AnalysisTarget } from '#input/setup/index.ts';
import { assignColorSlots, type ColorSlotsByKey } from './multi-target-selection.ts';
import type { Workspace } from './workspace.ts';

/**
 * Workspaceの対象の色。
 *
 * 色は画面全体（全ペインの対象の和）を1つの集合として、Workspaceが1つだけ持つ。
 * 集合を見るペインごとに配ると、同じ対象が別のペインで別の色になり、ペインをまたいで
 * 見比べる時に線を追えなくなるため。配り方の規則は個別画面と同じ（`assignColorSlots`）:
 * 加えた順に配る・外しても他の対象の色は動かさない・並べ替えでも色は対象に付いて動く。
 *
 * 値は対象のkey（`analysisTargetKey`）→ 色の番号。番号から色への対応は表示側が持つ。
 */
export type WorkspaceColorSlots = ColorSlotsByKey;

export function initialWorkspaceColorSlots(): WorkspaceColorSlots {
  return {};
}

/**
 * 画面に出ている集合の対象を、組（並び順）→ 固定のペイン（並び順）の順に重複なく並べる。
 * 色を新しく配る時の順がこれになる。同じ操作で複数の対象が増えた時だけ効く並びで、
 * 既に色を持つ対象はこの順に関係なく番号を持ち越す。
 */
function workspaceSetTargets(workspace: Pick<Workspace, 'groups' | 'panes'>): readonly AnalysisTarget[] {
  const seen = new Set<string>();
  const result: AnalysisTarget[] = [];
  const push = (targets: readonly AnalysisTarget[]) => {
    for (const target of targets) {
      const key = analysisTargetKey(target);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(target);
    }
  };
  for (const group of workspace.groups) push(group.target.set.targets);
  for (const pane of workspace.panes) {
    if (pane.binding.mode === 'fixed' && pane.binding.target.kind === 'set') push(pane.binding.target.selection.targets);
  }
  return result;
}

function sameSlots(a: WorkspaceColorSlots, b: WorkspaceColorSlots): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/**
 * 集合の和に合わせて色を配り直した色の割り当てを返す。和に残っている対象は今の番号のまま、
 * 和から消えた対象の番号は空け（次に加えた対象が使う）、新しい対象にだけ配る。
 * `known`は今の割り当て（既定はWorkspace自身の）。個別画面から写して始める時など、
 * 別の出どころの番号から始めたい時に渡す。
 */
export function assignWorkspaceColors(
  workspace: Pick<Workspace, 'groups' | 'panes' | 'colorSlots'>,
  known: ReadonlyMap<string, number> = new Map(Object.entries(workspace.colorSlots)),
): WorkspaceColorSlots {
  const targets = workspaceSetTargets(workspace);
  const slots = assignColorSlots(targets, known);
  return Object.fromEntries(targets.map((target, index) => [analysisTargetKey(target), slots[index]!]));
}

/**
 * 色を配り直したWorkspaceを返す。変わらなければ同じ参照を返す（書き込みのno-op判定のため）。
 * 対象が増減しうる書き込みの後に必ずこれを通す（`workspace.ts`の`updateWorkspace`）。
 */
export function withWorkspaceColors(workspace: Workspace, known?: ReadonlyMap<string, number>): Workspace {
  const colorSlots = assignWorkspaceColors(workspace, known);
  return sameSlots(workspace.colorSlots, colorSlots) ? workspace : { ...workspace, colorSlots };
}
