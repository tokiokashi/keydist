import { findWorkspaceAnalyzer } from './analyzer-registry.ts';
import type { LinkGroupSummary } from './group-summary.ts';
import type { LinkGroup, WorkspacePane, WorkspacePaneTarget } from '#engine/workspace.ts';
import type { PaneChrome, PaneEnvironment, PaneTargetBindingControl } from '#hosts/shared/panes/pane-environment.ts';
import type { PaneMenuItem } from '#hosts/shared/PaneHeaderParts.tsx';

/**
 * Workspaceのペイン1枚が、器（`WorkspacePage`）から受け取るもの。ペインは資産（`KeydistAssets`）や
 * `dispatch`を直接持たず、書き込みの入口はここに並んだ関数に限る（値の変更をコマンドへ結ぶのは器の仕事）。
 */
export interface WorkspacePaneRuntime {
  readonly env: PaneEnvironment;
  /** 解析設定の変更を資産へ反映する（間引き済み）。 */
  readonly commitPaneOptions: (paneId: string, options: unknown) => void;
  /**
   * ペインが今映す対象。従うならWorkspaceの対象、固定ならペイン自身の対象。
   * Analyzerが期待する形（`kind`）と合わなければ`undefined`。
   */
  readonly paneTarget: (pane: WorkspacePane, kind: WorkspacePaneTarget['kind']) => WorkspacePaneTarget | undefined;
  /**
   * ペインの対象を選ぶ。固定のペインは自分の対象を、従うペインはWorkspaceの対象を書き換える
   * （隣の従うペインも一緒に変わる）。
   */
  readonly setPaneTarget: (paneId: string, target: WorkspacePaneTarget) => void;
  /** 連動の組。従うペインの対象の持ち主で、番号は並びの順（1から）。 */
  readonly groups: readonly LinkGroup[];
  /** `groups`と同じ並びの、組ごとの対象の要約（ピンのメニューで組を見分ける）。 */
  readonly groupSummaries: readonly LinkGroupSummary[];
  /**
   * ペインの対象の持ち方を切り替える。固定にする時・新しい組へ移す時は、今映している対象を
   * そのまま持つ（押した瞬間に見た目が変わらない）。
   */
  readonly bindPane: (paneId: string, choice: PaneBindingChoice) => void;
  readonly duplicatePane: (paneId: string) => void;
  readonly closePane: (paneId: string) => void;
}

export type PaneBindingChoice =
  | { readonly kind: 'fixed' }
  | { readonly kind: 'group'; readonly id: string }
  | { readonly kind: 'new-group' };

/**
 * ペインの⋯の中身（docs/architecture.md「ペイン」）。「拡大表示」は入れていない
 * （モーダルにするかDockviewの最大化にするかは実物を見て決める）。
 */
export function paneMenuItems(
  runtime: Pick<WorkspacePaneRuntime, 'duplicatePane' | 'closePane'>,
  paneId: string,
  resetOptions: () => void,
): readonly PaneMenuItem[] {
  return [
    { id: 'duplicate', label: '複製', description: '解析設定と対象を写して、右隣に並べる', onSelect: () => runtime.duplicatePane(paneId) },
    { id: 'reset-options', label: '解析設定を初期値に戻す', description: '対象と条件は変わらない', onSelect: resetOptions },
    { id: 'close', label: '閉じる', onSelect: () => runtime.closePane(paneId) },
  ];
}

/** Workspaceのペインの枠まわり。h2で、見出しは固定せず、⋯と「従う / 固定」の切り替えを持つ。 */
export function workspacePaneChrome(
  runtime: WorkspacePaneRuntime,
  pane: WorkspacePane,
  resetOptions: () => void,
): PaneChrome {
  return {
    headingLevel: 2,
    showPaneNameInSettings: true,
    menuItems: paneMenuItems(runtime, pane.id, resetOptions),
    targetBinding: bindingControl(runtime, pane),
  };
}

/** 連動の組の名前（並びの番号で見分ける）。 */
export function linkGroupLabel(index: number): string {
  return `リンク ${index + 1}`;
}

function bindingControl(runtime: WorkspacePaneRuntime, pane: WorkspacePane): PaneTargetBindingControl {
  const followed = pane.binding.mode === 'follow' ? pane.binding.group : undefined;
  const index = runtime.groups.findIndex((group) => group.id === followed);
  return {
    follows: followed !== undefined,
    ...(index === -1 ? {} : { groupNumber: index + 1 }),
    items: [
      {
        id: 'fixed',
        label: '固定',
        description: 'このペインだけ',
        selected: followed === undefined,
        onSelect: () => runtime.bindPane(pane.id, { kind: 'fixed' }),
      },
      ...runtime.groups.map((group, i) => ({
        id: `group-${group.id}`,
        label: linkGroupLabel(i),
        description: summaryOf(runtime, i, pane),
        selected: group.id === followed,
        onSelect: () => runtime.bindPane(pane.id, { kind: 'group', id: group.id }),
      })),
      {
        id: 'new-group',
        label: '新しいリンク',
        description: '今の対象で作る',
        selected: false,
        onSelect: () => runtime.bindPane(pane.id, { kind: 'new-group' }),
      },
    ],
  };
}

/** メニューに出す組の対象の要約。ペインのAnalyzerが見る形（Single / Multi）の側を出す。 */
function summaryOf(runtime: WorkspacePaneRuntime, index: number, pane: WorkspacePane): string | undefined {
  const summary = runtime.groupSummaries[index];
  if (summary === undefined) return undefined;
  const kind = findWorkspaceAnalyzer(pane.analyzerId)?.cardinality;
  return kind === 'set' ? summary.set : summary.single;
}
