import type { WorkspacePane, WorkspacePaneTarget } from '#engine/workspace.ts';
import type { PaneChrome, PaneEnvironment } from '#hosts/shared/panes/pane-environment.ts';
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
  /** 従う / 固定を切り替える。固定にする時は、今映している対象をそのペインの対象として持つ。 */
  readonly setPaneFollows: (paneId: string, follows: boolean) => void;
  readonly duplicatePane: (paneId: string) => void;
  readonly closePane: (paneId: string) => void;
}

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
    targetBinding: {
      follows: pane.binding.mode === 'follow',
      onChange: (follows) => runtime.setPaneFollows(pane.id, follows),
    },
  };
}
