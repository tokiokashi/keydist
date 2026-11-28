import type { SideBySideResultsModel } from './figure-model.ts';

/**
 * 表による解析の値と今の解析の値を、配列・Setupごとに2行で並べる結果の表。
 * 配列・Setupの名前を1行で置き、その下に解析ごとの行を置くので、列は値の4つと解析の名前の1つで済み、狭い幅でも横にはみ出さない。
 * 行の見出しに、どちらの解析か、その先読みを文節で数えるかかなで数えるかを置く。差・比・順位は出さない。
 */
export function SideBySideTable({ model }: { readonly model: SideBySideResultsModel }) {
  const span = model.columns.length;
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: 表がはみ出す時に、キーボードでスクロールできるようにする
    <section className="figure-table-scroll" aria-label={model.caption} tabIndex={0} data-figure-table="" data-ngram-table-side-by-side="">
      <table className="figure-table ngram-table-side-by-side">
        <caption>{model.caption}</caption>
        <thead>
          <tr>
            <th scope="col">{model.rowHeader}</th>
            {model.columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        {model.groups.map((group) => (
          <tbody key={group.targetKey} data-ngram-table-group={group.targetKey}>
            <tr>
              <th scope="rowgroup" colSpan={span + 1} className="ngram-table-side-by-side-target" title={group.title}>
                {group.header}
              </th>
            </tr>
            {group.lines.map((line) => (
              <tr key={line.key} data-ngram-table-analysis={line.analysis}>
                <th scope="row">
                  <span className="ngram-table-side-by-side-name">{line.name}</span>
                  <span className="ngram-table-side-by-side-lookahead">{line.lookahead}</span>
                </th>
                {line.cells === undefined ? (
                  <td
                    colSpan={span}
                    className="ngram-table-side-by-side-message"
                    role={line.failed ? 'alert' : undefined}
                    aria-busy={line.failed ? undefined : true}
                  >
                    {line.message}
                  </td>
                ) : (
                  line.cells.map((cell, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: 列の順が同一性
                    <td key={index}>{cell}</td>
                  ))
                )}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </section>
  );
}
