import type { FigureTableModel } from './figure-table.ts';
import './figure-table-view.css';

/**
 * 図の値を表で読む表示。見出しのセル（`th scope`）と表題（`caption`）を持つ `<table>` を、
 * キーボードで focus できる領域に入れる（横にはみ出す時、矢印キーでスクロールできる）。
 */
export function FigureTable({ model }: { readonly model: FigureTableModel }) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: 表がはみ出す時に、キーボードでスクロールできるようにする
    <section className="figure-table-scroll" aria-label={model.caption} tabIndex={0} data-figure-table="">
      <table className="figure-table">
        <caption>{model.caption}</caption>
        <thead>
          <tr>
            <th scope="col">{model.rowHeader}</th>
            {model.columns.map((column, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 列の名前は重なることがあり、順が同一性
              <th key={index} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row) => (
            <tr key={row.key}>
              <th scope="row" title={row.title}>
                {row.header}
              </th>
              {row.cells.map((cell, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 列の順が同一性
                <td key={index}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/**
 * 図と表を切り替えるボタン。見出しの行に置く。ラベルは変えず、押している状態を `aria-pressed` で伝える。
 * 状態は呼び出し側のcomponentが持ち、保存しない。
 */
export function FigureTableSwitch({ pressed, onToggle }: { readonly pressed: boolean; readonly onToggle: () => void }) {
  return (
    <button type="button" className="figure-table-switch" aria-pressed={pressed} data-figure-table-switch="" onClick={onToggle}>
      表で見る
    </button>
  );
}
