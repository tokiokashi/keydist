import { useEffect, useRef, useState } from 'react';

/**
 * 文脈バーの左端に置くWorkspace名（ページのh1。docs/architecture.md「文脈バー」）。
 * 押すとその場で書き換えられる。Enterかフォーカスが外れると確定し、Escapeで取り消す。
 * 空の名前は確定せず元に戻す（`renameWorkspace`が空を拒む）。
 */
export function WorkspaceName({
  name,
  onRename,
}: {
  readonly name: string;
  readonly onRename: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // 確定・取り消しは1回だけ行う。Escapeで取り消した後に続くblurや、Enterの後のblurが、
  // 二重に確定しないようにする
  const activeRef = useRef(false);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const finish = (commit: boolean, restoreFocus: boolean) => {
    if (!activeRef.current) return;
    activeRef.current = false;
    if (commit && draft.trim() !== '' && draft.trim() !== name) onRename(draft);
    setEditing(false);
    // キーボードで終えた時だけ、名前のボタンへフォーカスを戻す（外を押して終えた時は、押した先を邪魔しない）
    if (restoreFocus) requestAnimationFrame(() => buttonRef.current?.focus({ preventScroll: true }));
  };

  return (
    <h1 className="workspace-name">
      {editing ? (
        <input
          ref={inputRef}
          className="workspace-name-input"
          aria-label="Workspaceの名前"
          value={draft}
          maxLength={80}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={() => finish(true, false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              finish(true, true);
            } else if (event.key === 'Escape') {
              event.stopPropagation();
              finish(false, true);
            }
          }}
        />
      ) : (
        <button
          ref={buttonRef}
          type="button"
          className="workspace-name-button"
          title="名前を変更"
          onClick={() => {
            setDraft(name);
            activeRef.current = true;
            setEditing(true);
          }}
        >
          {name}
        </button>
      )}
    </h1>
  );
}
