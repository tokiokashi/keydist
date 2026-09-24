import { useLayoutEffect } from 'react';

export interface AnalyzerGeometryDialogElements {
  editor: HTMLDivElement;
  unit: HTMLSelectElement;
  name: HTMLInputElement;
  save: HTMLButtonElement;
  saveAs: HTMLButtonElement;
  delete: HTMLButtonElement;
  error: HTMLParagraphElement;
}

export function resolveAnalyzerGeometryDialogElements(
  dialog: HTMLDialogElement,
): AnalyzerGeometryDialogElements {
  const find = <T extends HTMLElement>(id: string): T => {
    const element = dialog.querySelector<T>(`#${id}`);
    if (!element) throw new Error(`Geometry dialog element is missing: #${id}`);
    return element;
  };
  return {
    editor: find('geometry-modal-editor'),
    unit: find('geometry-modal-unit'),
    name: find('geometry-modal-name'),
    save: find('geometry-modal-save'),
    saveAs: find('geometry-modal-save-as'),
    delete: find('geometry-modal-delete'),
    error: find('geometry-modal-error'),
  };
}

export function AnalyzerGeometryDialog({ onMount }: { onMount(): void }) {
  useLayoutEffect(() => {
    onMount();
  }, [onMount]);

  return (
    <form method="dialog" id="geometry-form" data-react-feature="geometry-dialog">
      <div className="dialog-head">
        <h2>形状と運指の設定</h2>
        <button type="submit" value="cancel" className="ghost close">閉じる</button>
      </div>
      <p className="note">
        物理形状は内部ではキーピッチ単位 [u] で保存します。段ずれ・列オフセット・親指位置・分割間隔は、現在のピッチを使ってmm表示にも切り替えられます。
      </p>
      <label className="ctl">
        <span>形状名</span>
        <input type="text" id="geometry-modal-name" />
      </label>
      <label className="ctl">
        <span>数値の表示単位</span>
        <select id="geometry-modal-unit" defaultValue="mm">
          <option value="mm">mm（実測値）</option>
          <option value="u">u（キーピッチ単位）</option>
        </select>
      </label>
      <div id="geometry-modal-editor" />
      <p className="error" id="geometry-modal-error" hidden />
      <div className="dialog-actions">
        <button type="button" className="ghost" id="geometry-modal-delete">
          このカスタム形状を削除
        </button>
        <span className="spacer" />
        <button type="button" className="secondary" id="geometry-modal-save-as">
          名前を付けて保存
        </button>
        <button type="button" id="geometry-modal-save">上書き保存</button>
      </div>
    </form>
  );
}
