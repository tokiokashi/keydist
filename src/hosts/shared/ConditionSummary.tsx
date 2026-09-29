import { useEffect, useId, useRef, useState } from 'react';
import {
  conditionSummaryLine,
  type ConditionHeaderInfo,
  type ConditionSummaryRow,
  type ConditionTargetDiff,
} from './condition-summary.ts';
import { resetAllGlobalCommand, resettableGlobalIds } from './condition-edit.ts';
import { ConditionEditor, type ConditionEditorContext } from './ConditionEditor.tsx';

/**
 * 条件の要約（docs/architecture.md「画面の構成 > 条件の要約」）。
 *
 * 閉じた状態は1行で、変えた項目の先頭2件（項目の定義順）と「他N件」。何も変えていなければ
 * 「すべて既定値」。押すと条件のモーダルを開き、全体のレベルの条件をその場で編集できる
 * （docs/architecture.md「条件の編集とURL」）。開いた時の閲覧用の一覧は、モーダルの行
 * （値・出どころ・診断）が兼ねる。
 *
 * ペインの枠から切り離しておくのは、個別画面とWorkspaceのどちらのペインにも同じ部品を置くため（#629）。
 * 複数の対象を持つペインは、共通の条件を`rows`に、対象ごとの差を`targetDiffs`に渡す。
 */
export interface ConditionSummaryProps {
  /** Traceに効く条件の一覧。項目の定義順（`traceConditionSummary`の順）で渡す。 */
  readonly rows: readonly ConditionSummaryRow[];
  /**
   * モーダルの先頭に出す、対象の実体（配列・物理配列・指の割当）の名前。解決前（読み込み中）は省略する。
   * 対象のフル名（既定と違う条件つき）は出さない。条件の差分は各行が出どころつきで出すため。
   */
  readonly header?: ConditionHeaderInfo;
  /**
   * 複数の対象を持つペインで、共通の条件（`rows`）と違う対象とその項目。全対象が同じなら空か省略。
   * 単一の対象のペインは渡さない。
   */
  readonly targetDiffs?: readonly ConditionTargetDiff[];
  /** 全体のレベルの条件を書き換えるための手持ち。 */
  readonly editor: ConditionEditorContext;
}

export function ConditionSummary({ rows, header, targetDiffs = [], editor }: ConditionSummaryProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  if (rows.length === 0) return null;
  const line = conditionSummaryLine(rows);

  const close = () => {
    setOpen(false);
    // 見出しを固定しないペインではボタンが画面外にあり、既定のfocus()はそこまでスクロールしてしまう。
    buttonRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className="pane-condition-summary" data-changed-count={line.changedCount}>
      <button
        ref={buttonRef}
        type="button"
        className="pane-condition-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="条件を見る・変える"
        onClick={() => setOpen(true)}
      >
        <svg className="pane-condition-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M2.5 4.5h7M12.5 4.5h1M2.5 11.5h2M7.5 11.5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <circle cx="11" cy="4.5" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="6" cy="11.5" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        <span className="pane-condition-key">条件</span>
        {line.changedCount === 0 ? (
          <span className="pane-condition-default">すべて既定値</span>
        ) : (
          <>
            <span className="pane-condition-items">
              {line.shown.map((row) => `${row.label}: ${row.displayValue}`).join(' · ')}
            </span>
            {line.restCount > 0 ? <span className="pane-condition-more">他{line.restCount}件</span> : null}
          </>
        )}
        {targetDiffs.length > 0 ? <span className="pane-condition-diff-flag">対象ごとに差あり</span> : null}
      </button>
      {open ? <ConditionModal rows={rows} header={header} targetDiffs={targetDiffs} editor={editor} onClose={close} /> : null}
    </div>
  );
}

interface ConditionModalProps extends ConditionSummaryProps {
  readonly targetDiffs: readonly ConditionTargetDiff[];
  readonly onClose: () => void;
}

/**
 * どの画面でも同じ器で開く（パソコン幅は中央のモーダル、スマホ幅は下からのシート。`pane-frame.css`）。
 * `<dialog>`のモーダルにするのは、背後の操作を止め、Escapeとフォーカスの戻りをブラウザに任せるため。
 */
function ConditionModal({ rows, header, targetDiffs, editor, onClose }: ConditionModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const resettable = resettableGlobalIds(editor.overrides, editor.hiddenIds);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null || dialog.open) return undefined;
    dialog.showModal();
    // 片付けでcloseを呼ばない（開発時の二重実行で、閉じるイベントが親へ届いて開いた直後に閉じてしまう。
    // 閉じる時は親が描画をやめ、要素ごと外れる）。
    return undefined;
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="condition-modal"
      aria-labelledby={titleId}
      onClose={onClose}
      // 中身は器いっぱいに広げてあるので、器自身への押下は背後（暗い部分）を押した時だけ。
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="condition-modal-inner">
        <header className="condition-modal-head">
          <h2 id={titleId}>条件</h2>
          <span className="condition-modal-scope">全体の値を変える。すべての画面に効く</span>
          <button
            type="button"
            className="condition-modal-reset-all"
            disabled={resettable.length === 0}
            onClick={() => editor.dispatch(resetAllGlobalCommand(resettable))}
          >
            すべて既定値に戻す
          </button>
          <button type="button" className="condition-modal-close" aria-label="閉じる" onClick={() => dialogRef.current?.close()}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="condition-modal-body">
          {header !== undefined ? (
            <p className="pane-condition-target">
              {header.layoutName} / {header.shapeName} · 指の割当: {header.fingerAssignmentName}
            </p>
          ) : null}
          <ConditionEditor editor={editor} rows={rows} />
          {targetDiffs.length > 0 ? (
            <section className="pane-condition-diffs" aria-label="対象ごとの差">
              <h4>対象ごとの差</h4>
              <dl>
                {targetDiffs.map((diff) => (
                  <div key={diff.key} className="pane-condition-diff">
                    <dt>{diff.label}</dt>
                    <dd>{diff.items.map((item) => `${item.label}=${item.displayValue}`).join('、')}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
