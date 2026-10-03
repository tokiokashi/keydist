import { findWorkspaceAnalyzer } from './analyzer-registry.ts';
import { summarizePaneTarget, type LinkGroupSummary } from './group-summary.ts';
import type { LinkGroup, WorkspacePane, WorkspacePaneTarget } from '#engine/workspace.ts';
import type { WorkspaceColorSlots } from '#engine/workspace-colors.ts';
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
  /** 対象の色の番号。全ペインの対象の和に配ったもので、同じ対象はどのペインでも同じ色になる。 */
  readonly colorSlots: WorkspaceColorSlots;
  /** 連動の組。従うペインの対象の持ち主で、番号は並びの順（1から）。 */
  readonly groups: readonly LinkGroup[];
  /** `groups`と同じ並びの、組ごとの対象の要約（連動のメニューで組を見分ける）。 */
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

/** 余白のペインの⋯。解析設定も対象も持たないので、複製・閉じるだけ。 */
export function blankPaneMenuItems(
  runtime: Pick<WorkspacePaneRuntime, 'duplicatePane' | 'closePane'>,
  paneId: string,
): readonly PaneMenuItem[] {
  return [
    { id: 'duplicate', label: '複製', description: '同じ大きさで隣に並べる', onSelect: () => runtime.duplicatePane(paneId) },
    { id: 'close', label: '閉じる', onSelect: () => runtime.closePane(paneId) },
  ];
}

/**
 * ペインの⋯の中身（docs/architecture.md「ペイン」）。
 */
export function paneMenuItems(
  runtime: Pick<WorkspacePaneRuntime, 'duplicatePane' | 'closePane'>,
  paneId: string,
  resetOptions: () => void,
): readonly PaneMenuItem[] {
  return [
    { id: 'duplicate', label: '複製', description: '解析設定と対象を写して、同じ大きさで隣に並べる', onSelect: () => runtime.duplicatePane(paneId) },
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

/**
 * 連動の番号は並びの順（1から）で、組が消えたら詰める。ピンの読み上げ名・番号の絵と、
 * メニューの項目の読み上げ名・番号の絵が同じ番号になるよう、番号はここ1か所から出す。
 */
function linkGroupNumber(index: number): number {
  return index + 1;
}

function bindingControl(runtime: WorkspacePaneRuntime, pane: WorkspacePane): PaneTargetBindingControl {
  const followed = pane.binding.mode === 'follow' ? pane.binding.group : undefined;
  const index = runtime.groups.findIndex((group) => group.id === followed);
  return {
    follows: followed !== undefined,
    summary: pane.binding.mode === 'fixed'
      ? summarizePaneTarget(runtime.env, pane.binding.target)
      : index === -1 ? '' : summaryOf(runtime, index, pane),
    ...(index === -1 ? {} : { groupNumber: linkGroupNumber(index) }),
    items: [
      {
        id: 'fixed',
        label: '固定',
        ariaLabel: '固定',
        glyph: { kind: 'pin' },
        selected: followed === undefined,
        onSelect: () => runtime.bindPane(pane.id, { kind: 'fixed' }),
      },
      ...runtime.groups.map((group, i) => {
        const summary = summaryOf(runtime, i, pane);
        const number = linkGroupNumber(i);
        return {
          id: `group-${group.id}`,
          label: summary,
          ariaLabel: `連動 ${number}（${summary}）`,
          glyph: { kind: 'link' as const, number },
          selected: group.id === followed,
          onSelect: () => runtime.bindPane(pane.id, { kind: 'group', id: group.id }),
        };
      }),
      {
        id: 'new-group',
        label: '新しい連動',
        ariaLabel: '新しい連動（今の対象で作る）',
        glyph: { kind: 'link-new' },
        selected: false,
        onSelect: () => runtime.bindPane(pane.id, { kind: 'new-group' }),
      },
    ],
  };
}

/** メニューに出す組の対象の要約。ペインのAnalyzerが見る形（Single / Multi）の側を出す。 */
function summaryOf(runtime: WorkspacePaneRuntime, index: number, pane: WorkspacePane): string {
  const summary = runtime.groupSummaries[index];
  if (summary === undefined) return '';
  const kind = findWorkspaceAnalyzer(pane.analyzerId)?.cardinality;
  return kind === 'set' ? summary.set : summary.single;
}
