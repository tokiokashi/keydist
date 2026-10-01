import { useMemo } from 'react';
import { PaneMenu, type PaneMenuItem } from './PaneHeaderParts.tsx';

/** 個別画面のAnalyzerの送り先。既存のWorkspaceか、新しく作るWorkspace。 */
export type AddToWorkspaceDestination =
  | { readonly kind: 'existing'; readonly workspaceId: string }
  | { readonly kind: 'new' };

export interface AddToWorkspaceMenuProps {
  /** 送り先に選べる、保存済みのWorkspace（資産の並び順）。 */
  readonly workspaces: readonly { readonly id: string; readonly name: string }[];
  readonly onAdd: (destination: AddToWorkspaceDestination) => void;
}

const NEW_WORKSPACE_ITEM_ID = '\u0000new';

/**
 * 個別画面の見出しの右端に置く「Workspaceに追加」。押すと送り先のメニューが開き、既存のWorkspaceか
 * 「新しいWorkspaceに追加」を選ぶ。メニューの開閉・キーボード操作・Escapeは`PaneMenu`のもの。
 * Workspaceのペインには置かない（すでにWorkspaceの中にいるため）。
 */
export function AddToWorkspaceMenu({ workspaces, onAdd }: AddToWorkspaceMenuProps) {
  const items = useMemo<readonly PaneMenuItem[]>(() => [
    ...workspaces.map((workspace): PaneMenuItem => ({
      id: workspace.id,
      label: workspace.name,
      onSelect: () => onAdd({ kind: 'existing', workspaceId: workspace.id }),
    })),
    // idの衝突を避けるため、Workspaceのidに現れない文字を含める
    { id: NEW_WORKSPACE_ITEM_ID, label: '新しいWorkspaceに追加', onSelect: () => onAdd({ kind: 'new' }) },
  ], [workspaces, onAdd]);

  return (
    <PaneMenu
      paneName="Workspaceに追加"
      label="Workspaceに追加"
      text="Workspaceに追加"
      title="Workspaceに追加"
      icon={(
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 5.2v5.6M5.2 8h5.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )}
      className="add-to-workspace"
      items={items}
    />
  );
}
