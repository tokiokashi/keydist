/**
 * 図の値を表で読むための表の形（画面に依存しない純粋な型）。
 * 各Analyzerが、図に渡している値と同じ値から行を作り、`figure-table-view.tsx` が `<table>` に描く。
 * セルの文字は図の読み取りや目盛りと同じ書式で作り、図と表で値の見え方を変えない。
 */

export interface FigureTableRow {
  readonly key: string;
  /** 行の見出し（対象の名前・指の名前・区間の位置など） */
  readonly header: string;
  /** 行の見出しにポインターを合わせた時に出す補足（集合によらない完全な名前など） */
  readonly title?: string | undefined;
  /** 列の順に並べたセルの文字。列の数と同じ長さ */
  readonly cells: readonly string[];
}

export interface FigureTableModel {
  /** 表題。何の値の表かを、表だけを読んでも分かる形で書く */
  readonly caption: string;
  /** 行の見出しの列の名前 */
  readonly rowHeader: string;
  /** 値の列の名前 */
  readonly columns: readonly string[];
  readonly rows: readonly FigureTableRow[];
}
