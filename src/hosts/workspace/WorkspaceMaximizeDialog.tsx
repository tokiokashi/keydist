import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PaneNameInTabContext } from '#hosts/shared/pane-name-in-tab.ts';
import { PortalRootContext } from '#hosts/shared/portal-root.ts';

/**
 * 試作（#628 案M）: ペインを`<dialog>`のモーダルで大きく出す。Escape・背後の操作の停止・
 * フォーカスの戻りはブラウザに任せる（条件のモーダルと同じ作り）。
 * 解析設定の小窓・対象の選択はbody直下へ出すので、そのままではモーダルの背後になる。出す先を`<dialog>`の中へ替える。
 */
export function WorkspaceMaximizeDialog({
  title,
  children,
  onClose,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [root, setRoot] = useState<HTMLElement | undefined>(undefined);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog !== null && !dialog.open) {
      dialog.showModal();
      // 既定では先頭のⓘへフォーカスが移り、説明が開いてしまう。入れ物自身へ置く
      dialog.focus();
    }
    setRoot(dialog ?? undefined);
  }, []);
  return (
    <dialog ref={ref} tabIndex={-1} className="workspace-maximize" aria-label={`${title}（拡大表示）`} onClose={onClose}>
      <PortalRootContext.Provider value={root}>
        <PaneNameInTabContext.Provider value={false}>
          <div className="workspace-pane">{children}</div>
        </PaneNameInTabContext.Provider>
      </PortalRootContext.Provider>
    </dialog>
  );
}
