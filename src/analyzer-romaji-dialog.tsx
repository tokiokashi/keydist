import { useLayoutEffect } from 'react';

export interface AnalyzerRomajiDialogElements {
  dialog: HTMLDialogElement;
  form: HTMLFormElement;
  edit: HTMLSelectElement;
  name: HTMLInputElement;
  base: HTMLSelectElement;
  sokuon: HTMLInputElement;
  overrides: HTMLTextAreaElement;
  error: HTMLParagraphElement;
  assignments: HTMLDivElement;
  variants: HTMLDivElement;
  createNew: HTMLButtonElement;
}

export function resolveAnalyzerRomajiDialogElements(
  dialog: HTMLDialogElement,
): AnalyzerRomajiDialogElements {
  const find = <T extends HTMLElement>(id: string): T => {
    const element = dialog.querySelector<T>(`#${id}`);
    if (!element) throw new Error(`Romaji dialog element is missing: #${id}`);
    return element;
  };
  return {
    dialog,
    form: find('romaji-form'),
    edit: find('romaji-edit'),
    name: find('romaji-name'),
    base: find('romaji-base'),
    sokuon: find('romaji-sokuon'),
    overrides: find('romaji-overrides'),
    error: find('romaji-error'),
    assignments: find('romaji-assignments'),
    variants: find('romaji-variants'),
    createNew: find('romaji-new'),
  };
}

export function AnalyzerRomajiDialog({ onMount }: { onMount(): void }) {
  useLayoutEffect(() => {
    onMount();
  }, [onMount]);

  return (
    <form method="dialog" id="romaji-form" data-react-feature="romaji-dialog">
      <div className="dialog-head">
        <h2>ローマ字の綴り</h2>
        <button type="submit" value="cancel" className="ghost close">閉じる</button>
      </div>
      <p className="note">
        基底ルールと差分で綴りを作る。評価時は小文字として扱う。<br />
        既定配列への割り当てもここで保存する。
      </p>

      <label className="ctl">
        <span>編集する綴り</span>
        <select id="romaji-edit" />
      </label>
      <button type="button" className="secondary" id="romaji-new">
        新しい綴りを作る
      </button>

      <div className="romaji-variants" id="romaji-variants" />

      <label className="ctl">
        <span>名前</span>
        <input type="text" id="romaji-name" placeholder="私のローマ字" />
      </label>
      <label className="ctl">
        <span>基底ルール</span>
        <select id="romaji-base" />
      </label>
      <label className="ctl checkbox">
        <input type="checkbox" id="romaji-sokuon" defaultChecked />
        <span>促音の後ろに子音を重ねた見出しを自動生成する（っか → kka）</span>
      </label>
      <label className="ctl">
        <span>差分 <small>1行に「かな = 綴り」。複数かなも可</small></span>
        <textarea
          id="romaji-overrides"
          rows={8}
          spellCheck={false}
          placeholder={'しゃ = sha\nじゃ = ja\nちゃ = cha'}
        />
      </label>
      <p className="error" id="romaji-error" hidden />
      <button type="submit" id="romaji-save">この内容を保存する</button>

      <hr />
      <h3>配列への割り当て</h3>
      <div id="romaji-assignments" />
    </form>
  );
}
